import fs from 'node:fs';
import {readJson,writeJson,repairDirectory} from './json-store.mjs';
import {loadQuality,qualityLimit,collectQuality,saveQuality} from './quality-collector.mjs';
import {reading,advance,INTERVALS,SYMBOLS} from '../lab-live-core.mjs';
import {closedCandles,contiguous} from '../lab-signal-engine.mjs';
import {loadParallel,collectParallel,saveParallel} from './m6-parallel-collector.mjs';
// Independent experiment; reuse each existing request, without changing baseline signals.
let parallel=null;const parallelErrors=[];
try{parallel=loadParallel()}catch(e){parallelErrors.push({error:String(e)})}
const OUT='data/live-signals.json';
const read=readJson;
const repairedArchives=repairDirectory('data/live-history');
const quality=loadQuality(),qualityErrors=[];let qualityChanged=false;const h1Errors=[];
const old=read(OUT,{state:[],events:[]}),previous=new Map(old.state.map(s=>[s.symbol+'|'+s.interval,s]));
const state=new Map(previous),events=new Map(old.events.map(e=>[e.id,e])),errors=[];
const tasks=SYMBOLS.flatMap(symbol=>Object.keys(INTERVALS).map(interval=>({symbol,interval})));let cursor=0,processed=0,recovered=0;
async function candles(symbol,interval,limit,now){
 let lastError;
 for(const host of ['https://data-api.binance.vision','https://api.binance.com']){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
  try{const r=await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,{signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);
   const raw=await r.json();return closedCandles(raw.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5],q:+x[7],tq:+x[10]})),INTERVALS[interval],now);
  }catch(e){lastError=e}finally{clearTimeout(timer)}
 }throw lastError;
}
async function worker(){while(cursor<tasks.length){
 const {symbol,interval}=tasks[cursor++],ms=INTERVALS[interval],now=Date.now(),lastClosed=Math.floor(now/ms)*ms-ms;
 const prior=previous.get(symbol+'|'+interval),checkpoint=prior?Date.parse(prior.candle_time):null;
 if(checkpoint!=null&&checkpoint>=lastClosed)continue;
 try{
  const gap=checkpoint==null?1:Math.ceil((lastClosed-checkpoint)/ms),rows=await candles(symbol,interval,(interval==='1h'?qualityLimit(quality,symbol,Math.min(1000,Math.max(120,96+gap+2))):Math.min(1000,Math.max(120,96+gap+2))),now);
  if(rows.at(-1)?.t<lastClosed)throw Error('Última vela indisponível');
  if(checkpoint!=null&&rows[95]?.t>checkpoint+ms)throw Error('Lacuna excede janela de recuperação; checkpoint preservado');
  let pair=[...events.values()].filter(e=>e.symbol===symbol&&e.interval===interval&&(['PRE_SIGNAL','CONFIRMED'].includes(e.status)||e.data.trackingStatus==='COLLECTING'));
  const first=checkpoint==null?rows.length-1:Math.max(95,rows.findIndex(c=>c.t>checkpoint));
  const touched=new Map();let x,count=0;
  for(let i=first;i<rows.length;i++){
   const context=rows.slice(i-95,i+1);if(!contiguous(context,ms))throw Error('Candles não consecutivos');
   x=reading(context,interval,rows[i].t+ms);
   const changed=advance(pair,symbol,interval,x,rows[i],new Date(now).toISOString());
   const map=new Map(pair.map(e=>[e.id,e]));for(const e of changed){map.set(e.id,e);touched.set(e.id,e)}pair=[...map.values()];count++;
  }
  // Commit only after the entire recovered interval has been validated.
  for(const e of touched.values())events.set(e.id,e);
  const last=rows.at(-1);
  const context=rows.slice(-96);
  let ema20=context[0].c;const alpha=2/(20+1);
  for(const candle of context.slice(1))ema20=candle.c*alpha+ema20*(1-alpha);
  const h1Snapshot=interval==='1h'?{
    candleTime:new Date(last.t).toISOString(),open:last.o,high:last.h,low:last.l,close:last.c,volume:last.v,ema20
  }:undefined;
  state.set(symbol+'|'+interval,{symbol,interval,candle_time:new Date(x.candleTime).toISOString(),observed_at:new Date(now).toISOString(),data:{...x,model:interval==='1h'?'H1_96_80':'EXPERIMENTAL_M5_M15',recoveredCandles:Math.max(0,count-1),...(h1Snapshot?{h1Snapshot}:{})}});
  processed++;recovered+=Math.max(0,count-1);
  if(interval==='1h'){try{collectQuality(quality,symbol,rows,new Date(now).toISOString());qualityChanged=true;}catch(e){qualityErrors.push({symbol,error:String(e)});}}
  if(parallel){try{collectParallel(parallel,symbol,interval,rows,ms,new Date(now).toISOString())}
    catch(e){parallelErrors.push({symbol,interval,error:String(e)})}}
 }catch(e){errors.push({symbol,interval,error:String(e)});if(interval==='1h')h1Errors.push({symbol,error:String(e)});}
}}
await Promise.all(Array.from({length:5},worker));
// Permanent Git archive first; the online feed retains seven days plus pending follow-up.
const byDay=new Map();
for(const e of events.values()){const day=e.created_at.slice(0,10);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(e)}
fs.mkdirSync('data/live-history',{recursive:true});
for(const [day,list] of byDay){const file=`data/live-history/${day}.json`,archive=read(file,{version:1,records:[]});const merged=new Map(archive.records.map(e=>[e.id,e]));for(const e of list)merged.set(e.id,e);writeJson(file,{version:1,updatedAt:new Date(Math.max(...[...merged.values()].map(e=>Date.parse(e.updated_at)))).toISOString(),records:[...merged.values()]})}
const all=[...events.values()].filter(e=>Date.parse(e.updated_at)>=Date.now()-7*86400000||e.data.trackingStatus==='COLLECTING');
const at=new Date().toISOString(),result={ok:errors.length===0,processed,total:150,recoveredCandles:recovered,repairedArchives,qualityErrors,errors,at};
fs.writeFileSync(OUT,JSON.stringify({version:'lab-live-v1',intervals:Object.keys(INTERVALS),symbols:50,state:[...state.values()],events:all.sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)),control:{last_finished_at:at,result},archive:{archived_at:at,location:'data/live-history/',verification:'committed_with_feed'}})+'\n');
console.log(JSON.stringify({...result,events:all.length}));if(processed===0&&errors.length)process.exitCode=1;
if(parallel){try{saveParallel(parallel,[...errors.map(e=>({...e,source:'coleta compartilhada'})),...parallelErrors],at)}catch(e){console.error('Histórico M6 paralelo não foi salvo:',String(e));process.exitCode=1}}
if(parallelErrors.length)console.error(JSON.stringify({parallelErrors}));

if(qualityChanged||qualityErrors.length||h1Errors.length){try{saveQuality(quality,[...h1Errors,...qualityErrors],at)}catch(e){console.error('quality_archive_failed',String(e));process.exitCode=1;}}
if(errors.length||qualityErrors.length||parallelErrors.length)process.exitCode=1;
