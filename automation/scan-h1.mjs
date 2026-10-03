import fs from 'node:fs';
import {analyze,closedCandles,contiguous} from '../lab-signal-engine.mjs';
import {SYMBOLS} from '../lab-live-core.mjs';
const HOUR=3600000,OUT='data/auto-signals.json',CHECK='data/h1-checkpoints.json',TARGETS=[10,20,30,40,50];
function load(path,fallback){try{return JSON.parse(fs.readFileSync(path,'utf8'))}catch{return fallback}}
const previous=load(OUT,{signals:[]}),signals=previous.signals||[],check=load(CHECK,{version:1,assets:{}}),ids=new Set(signals.map(s=>s.id));
const stats={crypto:{ok:0,error:0}},errors={crypto:[]},sources={};
async function candles(symbol,limit){
 for(const host of ['https://data-api.binance.vision','https://api.binance.com']){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
  try{const r=await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=1h&limit=${limit}`,{signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);const raw=await r.json();return closedCandles(raw.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})),HOUR);}
  catch(e){if(host.includes('api.binance.com'))throw e}finally{clearTimeout(timer)}
 }
}
let recovered=0;
for(const symbol of SYMBOLS){
 try{
  const now=Date.now(),checkpoint=check.assets[symbol]?.candleTime;
  const since=checkpoint??(Math.floor(now/HOUR)*HOUR-169*HOUR),gap=Math.ceil((now-since)/HOUR),rows=await candles(symbol,Math.min(1000,Math.max(120,gap+98)));
  if(!rows.length||now-rows.at(-1).t-HOUR>2*HOUR)throw Error('Candles desatualizados');
  if(rows[95]?.t>since+HOUR)throw Error('Lacuna maior que janela de recuperação; checkpoint preservado');
  for(let i=95;i<rows.length;i++){
   if(rows[i].t<=since)continue;const context=rows.slice(i-95,i+1);if(!contiguous(context,HOUR))throw Error('Candles não consecutivos');
   const r=analyze(context),last=rows[i];if(!r.classification.startsWith('SINAL_'))continue;
   const direction=r.classification==='SINAL_COMPRA'?'COMPRA':'VENDA',id=`CRIPTO|${symbol}|${last.t}|${direction}`;if(ids.has(id))continue;
   const retroactive=now-last.t-HOUR>2*HOUR;if(retroactive)recovered++;
   signals.push({id,market:'CRIPTO',symbol,interval:'1h',candles:96,direction,score:r.score,entry:last.c,entryTime:last.t,
    createdAt:new Date(last.t).toISOString(),confirmedAt:new Date(last.t+HOUR).toISOString(),detectedAt:new Date(now).toISOString(),retroactive,
    pattern:r.pattern.name,patternType:r.pattern.type,patternConfirmed:r.pattern.confirmed,rsi:r.rsi,cci:r.cci,macdHistogram:r.macd.histogram,momentumAligned:r.momentumAligned,ignition:r.ignition,
    box:'—',flag:r.pattern.name.includes('Bandeira')?r.pattern.name:'—',obv:r.obv.trend,divergence:'—',volumeRatio:r.volumeRatio,dataSource:'BINANCE_CLOSED',best:0,worst:0,lastPrice:last.c,targets:{}});ids.add(id);
  }
  for(const s of signals.filter(s=>s.symbol===symbol)){
   const after=rows.filter(c=>c.t>s.entryTime);if(!after.length)continue;
   const hi=Math.max(...after.map(c=>c.h)),lo=Math.min(...after.map(c=>c.l)),sign=s.direction==='COMPRA'?1:-1;
   s.best=Math.max(s.best||0,sign===1?(hi/s.entry-1)*100:(1-lo/s.entry)*100);s.worst=Math.min(s.worst||0,sign===1?(lo/s.entry-1)*100:(1-hi/s.entry)*100);s.lastPrice=after.at(-1).c;s.targets||={};for(const t of TARGETS)if(s.best>=t)s.targets[t]=true;
  }
  check.assets[symbol]={candleTime:rows.at(-1).t,observedAt:new Date(now).toISOString()};sources[symbol]='BINANCE_CLOSED';stats.crypto.ok++;
 }catch(e){stats.crypto.error++;errors.crypto.push({symbol,error:String(e)})}
}
signals.sort((a,b)=>b.entryTime-a.entryTime);
fs.writeFileSync(OUT,JSON.stringify({generatedAt:new Date().toISOString(),parameters:{interval:'1h',candles:96,minScore:80,closedCandlesOnly:true,logic:'INDICADORES_PADROES_CANDIDATA',rsi:14,cci:20,macd:[12,26,9],targets:TARGETS},stats,errors,sources,recoveredSignals:recovered,signals},null,2)+'\n');
fs.writeFileSync(CHECK,JSON.stringify(check,null,2)+'\n');
console.log(JSON.stringify({signals:signals.length,recovered,stats,errors}));
if(stats.crypto.ok===0)process.exitCode=1;
