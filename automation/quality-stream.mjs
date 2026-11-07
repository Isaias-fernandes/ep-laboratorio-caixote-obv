// Optional continuous runner on an existing Node 24 host. Scheduled collection remains the deployed default.
import {SYMBOLS} from '../lab-live-core.mjs';
import {loadQuality,collectQuality,saveQuality} from './quality-collector.mjs';
const MS=3600000,store=loadQuality(),errors=new Map();let stopping=false,socket,timer,chain=Promise.resolve();
const hosts=['https://data-api.binance.vision','https://api.binance.com'];
async function recover(symbol){
  const now=Date.now(),last=Math.floor(now/MS)*MS-MS,prior=store.pairs[symbol]?.lastCandle;
  if(prior!=null&&prior>=last)return;
  let from=prior==null?last-723*MS:prior-95*MS,rows=[];
  while(from<=last){let data,failed;
    for(const host of hosts){try{const r=await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${from}&limit=1000`,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();break;}catch(e){failed=e;}}
    if(!Array.isArray(data)||!data.length)throw failed||Error('Sem candles');
    const page=data.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5],q:+x[7],tq:+x[10]})).filter(c=>c.t+MS<=now);
    if(!page.length)break;rows.push(...page);const next=page.at(-1).t+MS;if(next<=from)throw Error('Paginação sem avanço');from=next;
    // Bound each transaction to a recoverable page, preserving all intervening observations.
    if(rows.length>=1000){collectQuality(store,symbol,rows,new Date().toISOString());rows=rows.slice(-96);}
  }
  if(rows.length>=96)collectQuality(store,symbol,rows,new Date().toISOString());errors.delete(symbol);
}
function flush(){saveQuality(store,[...errors].map(([symbol,error])=>({symbol,error})),new Date().toISOString());}
async function recoverAll(){
  let cursor=0;await Promise.all(Array.from({length:5},async()=>{while(cursor<SYMBOLS.length){const s=SYMBOLS[cursor++];try{await recover(s)}catch(e){errors.set(s,String(e));}}}));flush();
}
function connect(){
  if(stopping)return;
  const streams=SYMBOLS.map(s=>`${s.toLowerCase()}@kline_1h`).join('/');
  socket=new WebSocket('wss://data-stream.binance.vision/stream?streams='+streams);
  socket.addEventListener('open',()=>{chain=chain.then(recoverAll).catch(e=>console.error('recovery_failed',String(e)));});
  socket.addEventListener('message',event=>{
    let message;try{message=JSON.parse(String(event.data)).data;}catch{return;}
    const k=message?.k;if(!k?.x||!SYMBOLS.includes(k.s))return;
    chain=chain.then(async()=>{const pair=store.pairs[k.s];if(pair?.lastCandle+MS===+k.t){collectQuality(store,k.s,[...pair.cache,{t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v,q:+k.q,tq:+k.Q}],new Date().toISOString());errors.delete(k.s);}else await recover(k.s);flush();}).catch(e=>{errors.set(k.s,String(e));console.error('stream_recovery_failed',k.s,String(e));});
  });
  socket.addEventListener('error',()=>console.error('stream_unavailable'));
  socket.addEventListener('close',()=>{clearTimeout(timer);if(!stopping)timer=setTimeout(connect,5000);});
}
// REST is the audit source on close/reconnect. WS supplies prompt scheduling, never unclosed candles.
await recoverAll();connect();
const watchdog=setInterval(()=>{chain=chain.then(recoverAll).catch(e=>console.error('watchdog_failed',String(e)));},MS);
async function stop(){stopping=true;clearInterval(watchdog);clearTimeout(timer);socket?.close();await chain;flush();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
