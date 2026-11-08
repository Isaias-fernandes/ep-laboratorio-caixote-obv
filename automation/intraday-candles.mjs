import {closedCandles,contiguous} from '../lab-signal-engine.mjs';
export const DURATIONS={'5m':300000,'15m':900000};
export function selectionWindows(evaluations){
  return evaluations.filter(e=>['TRV_CONFIRMED','BULL_FLAG_BREAKOUT','MIN30_FLOW'].includes(e.strategy)&&Number.isFinite(e.signalTime)).map(e=>({id:e.id,symbol:e.symbol,start:e.signalTime+3600000,end:['COMPLETED','INVALID_DATA'].includes(e.status)?e.lastCandleTime+3600000:e.signalTime+721*3600000}));
}
export function collectIntraday(state,symbol,interval,input,windows,now=Date.now()){
  const ms=DURATIONS[interval];if(!ms)throw Error('Intervalo intraday inválido');
  const rows=closedCandles(input,ms,now);if(!rows.length||!contiguous(rows,ms))throw Error('Candles intraday descontínuos');
  state.rows??={};state.last??={};const key=symbol+'|'+interval,last=state.last[key]??-Infinity;
  for(const c of rows){
    if(c.t<=last)continue;
    const selected=interval==='5m'?windows.filter(w=>w.symbol===symbol&&c.t>=w.start&&c.t<w.end):[];
    if(interval==='5m'&&!selected.length)continue;
    const record={symbol,interval,candleTime:new Date(c.t).toISOString(),open:c.o,high:c.h,low:c.l,close:c.c,volume:c.v,
      quoteVolume:Number.isFinite(c.q)?c.q:null,takerBuyQuoteVolume:Number.isFinite(c.tq)?c.tq:null,
      selection:interval==='15m'?'CONTINUOUS':'QUALITY_SIGNAL',signalIds:selected.slice(0,20).map(w=>w.id)};
    state.rows[key+'|'+c.t]=record;state.last[key]=c.t;
  }
}
export function compactIntraday(state,ack,now=Date.now()){
  // Only acknowledged rows older than 48h leave the transport buffer. TiDB retains history.
  const rows=Object.entries(state.rows||{}).filter(([,c])=>Date.parse(c.candleTime)>=now-48*3600000||Date.parse(c.candleTime)>(ack.sent?.[c.symbol+'|'+c.interval]??-Infinity));
  if(rows.length>250000)throw Error('Limite de transporte intraday: preservar fila e verificar envio');
  return {...state,version:1,updatedAt:new Date(now).toISOString(),rows:Object.fromEntries(rows)};
}
export function deriveM30(rows){
  const groups=new Map();for(const c of rows){const t=Date.parse(c.candleTime),key=Math.floor(t/1800000)*1800000;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
  const out=[];for(const [t,cs] of groups){cs.sort((a,b)=>Date.parse(a.candleTime)-Date.parse(b.candleTime));if(cs.length!==2||Date.parse(cs[0].candleTime)!==t||Date.parse(cs[1].candleTime)!==t+900000)continue;out.push({symbol:cs[0].symbol,interval:'30m',candleTime:new Date(t).toISOString(),open:cs[0].open,high:Math.max(...cs.map(c=>c.high)),low:Math.min(...cs.map(c=>c.low)),close:cs[1].close,volume:cs.reduce((s,c)=>s+c.volume,0)});}return out.sort((a,b)=>Date.parse(a.candleTime)-Date.parse(b.candleTime));
}
