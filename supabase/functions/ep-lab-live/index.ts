// @ts-nocheck
import {reading,advance,INTERVALS,SYMBOLS} from './lab-live-core.mjs';
import {closedCandles,contiguous} from './lab-signal-engine.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
async function fetchJson(url,init={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
 try{const r=await fetch(url,{...init,signal:ctl.signal});const text=await r.text();if(!r.ok)throw Error(`HTTP ${r.status}: ${text.slice(0,180)}`);return text?JSON.parse(text):null;}finally{clearTimeout(timer)}
}
function database(){
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 return (path,init={})=>fetchJson(url+'/rest/v1/'+path,{...init,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(init.headers||{})}});
}
async function candles(symbol,interval,limit,now){
 const errors=[];
 for(const host of ['https://data-api.binance.vision','https://api.binance.com']){
  try{const raw=await fetchJson(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
   return closedCandles(raw.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})),INTERVALS[interval],now);
  }catch(e){errors.push(String(e))}
 }throw Error('Binance indisponível: '+errors.join('; '));
}
async function scan(db){
 const started=Date.now(),states=await db('ep_lab_live_state?select=*&limit=200');
 const previous=new Map(states.map(s=>[s.symbol+'|'+s.interval,s]));
 const tasks=SYMBOLS.flatMap(symbol=>Object.keys(INTERVALS).map(interval=>({symbol,interval}))),results=[],errors=[];
 let cursor=0;
 async function worker(){while(cursor<tasks.length){
  const {symbol,interval}=tasks[cursor++],ms=INTERVALS[interval],now=Date.now(),lastClosed=Math.floor(now/ms)*ms-ms;
  const old=previous.get(symbol+'|'+interval),checkpoint=old?Date.parse(old.candle_time):null;
  if(checkpoint!=null&&checkpoint>=lastClosed)continue;
  try{
   const gap=checkpoint==null?1:Math.ceil((lastClosed-checkpoint)/ms),limit=Math.min(1000,Math.max(120,96+gap+2));
   const rows=await candles(symbol,interval,limit,now),last=rows.at(-1);
   if(!last||last.t<lastClosed)throw Error('Última vela fechada ainda indisponível');
   if(checkpoint!=null&&rows[95]?.t>checkpoint+ms)throw Error('Lacuna excede janela de recuperação; checkpoint preservado');
   let events=await db(`ep_lab_live_events?symbol=eq.${symbol}&interval=eq.${interval}&or=(status.in.(PRE_SIGNAL,CONFIRMED),data->>trackingStatus.eq.COLLECTING)&select=*&limit=500`);
   const first=checkpoint==null?rows.length-1:Math.max(95,rows.findIndex(c=>c.t>checkpoint));
   if(first<95)throw Error('Contexto insuficiente para recuperação');
   const touched=new Map();let x,processed=0;
   for(let i=first;i<rows.length;i++){
    const context=rows.slice(i-95,i+1);if(!contiguous(context,ms))throw Error('Lacuna nos candles');
    x=reading(context,interval,rows[i].t+ms);
    const changed=advance(events,symbol,interval,x,rows[i],new Date(now).toISOString());
    for(const e of changed)touched.set(e.id,e);
    const byId=new Map(events.map(e=>[e.id,e]));for(const e of changed)byId.set(e.id,e);events=[...byId.values()];processed++;
   }
   const state={symbol,interval,candle_time:new Date(x.candleTime).toISOString(),observed_at:new Date(now).toISOString(),data:{...x,model:interval==='1h'?'H1_96_80':'EXPERIMENTAL_M5_M15',recoveredCandles:Math.max(0,processed-1)}};
   await db('rpc/ep_lab_live_ingest',{method:'POST',body:JSON.stringify({p_state:state,p_events:[...touched.values()]})});
   results.push({symbol,interval,candles:processed});
  }catch(e){errors.push({symbol,interval,error:String(e)})}
 }}
 await Promise.all(Array.from({length:5},worker));
 const result={ok:errors.length===0,processed:results.length,total:150,recoveredCandles:results.reduce((s,x)=>s+Math.max(0,x.candles-1),0),errors,durationMs:Date.now()-started,at:new Date().toISOString()};
 await db('ep_lab_live_control?id=eq.true',{method:'PATCH',body:JSON.stringify({lease_until:new Date().toISOString(),last_finished_at:new Date().toISOString(),result})});
 return result;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 const db=database();
 try{
  if(req.method==='GET'){
   const [state,control,events,archive]=await Promise.all([
    db('ep_lab_live_state?select=*&order=symbol,interval&limit=200'),
    db('ep_lab_live_control?select=last_started_at,last_finished_at,result'),
    db('ep_lab_live_events?select=*&order=updated_at.desc&limit=100'),
    db('ep_lab_live_archive_receipts?select=archived_at,release_url&order=archived_at.desc&limit=1')]);
   return reply({version:'lab-live-v1',intervals:['5m','15m','1h'],symbols:50,state,events,control:control[0]||null,archive:archive[0]||null});
  }
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  const token=req.headers.get('x-lab-scheduler-token');if(!token)return reply({error:'unauthorized'},401);
  const lease=await db('rpc/ep_lab_live_begin',{method:'POST',body:JSON.stringify({p_token:token})});
  if(!lease.authorized)return reply({error:'unauthorized'},401);
  if(!lease.acquired)return reply({ok:true,skipped:'scan_in_progress'});
  return reply(await scan(db));
 }catch(e){return reply({ok:false,error:String(e)},500)}
});
