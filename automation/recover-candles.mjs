import {closedCandles,contiguous} from '../lab-signal-engine.mjs';
export async function recoverCandles(symbol,interval,ms,checkpoint,now=Date.now(),fetcher=fetch,maxPages=3){
  const last=Math.floor(now/ms)*ms-ms,earliest=checkpoint==null?last-259*ms:checkpoint+ms;
  if(earliest>last)return[];const rows=[];let start=earliest;
  // Bounded recovery; an excessive gap remains explicit rather than spending unbounded quota.
  for(let page=0;page<maxPages&&start<=last;page++){
    let result,lastError;
    for(const host of ['https://data-api.binance.vision','https://api.binance.com']){
      try{const r=await fetcher(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${last}&limit=1000`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('HTTP '+r.status);result=await r.json();break;}catch(e){lastError=e;}
    }
    if(!Array.isArray(result)||!result.length)throw lastError||Error('Recuperação M1 sem dados');
    const c=closedCandles(result.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})),ms,now).filter(c=>c.t>=start);
    if(!c.length||c[0].t!==start||!contiguous(c,ms))throw Error('Lacuna M1 não recuperada');rows.push(...c);start=c.at(-1).t+ms;
  }
  if(start<=last)throw Error('RECOVERY_BUDGET: lacuna excede orçamento; preservada como incompleta');
  return rows;
}

export const recoverMinutes=(symbol,checkpoint,now=Date.now(),fetcher=fetch,maxPages=3)=>recoverCandles(symbol,'1m',60000,checkpoint,now,fetcher,maxPages);
