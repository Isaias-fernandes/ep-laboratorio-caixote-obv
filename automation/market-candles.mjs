import {closedCandles} from '../lab-signal-engine.mjs';
export async function fetchClosedCandles(symbol,interval,limit,now,intervalMs,fetcher=fetch){
  const errors=[];
  for(const host of ['https://data-api.binance.vision','https://api.binance.com']){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
    try{
      const response=await fetcher(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,{signal:ctl.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const raw=await response.json();if(!Array.isArray(raw))throw Error('Formato de candles inválido');
      const rows=closedCandles(raw.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5],q:+x[7],tq:+x[10]})),intervalMs,now);
      const expected=Math.floor(now/intervalMs)*intervalMs-intervalMs;
      if(rows.length<96||rows.at(-1).t!==expected)throw Error('Última vela fechada indisponível');
      return rows;
    }catch(e){errors.push(new URL(host).host+': '+e.message);}finally{clearTimeout(timer);}
  }
  throw Error('Candles indisponíveis nas fontes: '+errors.join('; '));
}
