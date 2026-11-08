import {closedCandles,contiguous} from './lab-signal-engine.mjs';
export const VERSION='ema-mtf-v3-closed';
const avg=a=>a.reduce((s,v)=>s+v,0)/(a.length||1);
function ema(v,p){if(v.length<p)return null;let e=avg(v.slice(0,p)),k=2/(p+1);for(let i=p;i<v.length;i++)e=v[i]*k+e*(1-k);return e;}
function rsi(v,p=14){let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0);}return l?100-100/(1+g/l):g?100:50;}
function snapshot(c){const v=c.map(x=>x.c);let obv=0;const o=[0];for(let i=1;i<c.length;i++){obv+=Math.sign(c[i].c-c[i-1].c)*c[i].v;o.push(obv);}const base=avg(c.slice(-21,-1).map(x=>x.v));return{last:c.at(-1),time:c.at(-1).t,close:c.at(-1).c,e9:ema(v,9),e21:ema(v,21),e50:ema(v,50),e200:ema(v,200),rsi:rsi(v),obv,obvSlope:o.at(-1)-o.at(-11),volRatio:base?c.at(-1).v/base:null};}
function retest(c,s,dir){return c.slice(-3).some(x=>dir==='BUY'?x.l<=s.e21*1.003&&x.c>=s.e21:x.h>=s.e21*.997&&x.c<=s.e21);}
export function classify(input5,input15,input60,now=Date.now()){
  const clean=(rows,ms)=>{const c=closedCandles(rows,ms,now).slice(-240);if(c.length!==240||!contiguous(c,ms)||c.at(-1).t!==Math.floor(now/ms)*ms-ms)throw Error('EMA exige candles fechados, consecutivos e atuais');return c;};
  const c5=clean(input5,300000),c15=clean(input15,900000),c60=clean(input60,3600000);
  const m5=snapshot(c5),m15=snapshot(c15),h1=snapshot(c60);
  const bias=h1.close>h1.e200&&h1.e50>h1.e200?'BUY':h1.close<h1.e200&&h1.e50<h1.e200?'SELL':'NEUTRAL';
  const m15Buy=m15.e9>m15.e21,m15Sell=m15.e9<m15.e21;
  const buy=m5.e9>m5.e21&&m5.close>m5.e21&&retest(c5,m5,'BUY'),sell=m5.e9<m5.e21&&m5.close<m5.e21&&retest(c5,m5,'SELL');
  const prep=bias==='BUY'&&m15Buy?'PREPARAÇÃO_COMPRA':bias==='SELL'&&m15Sell?'PREPARAÇÃO_VENDA':'NEUTRO';
  const configA=bias==='BUY'&&m15Buy&&buy?'COMPRA':bias==='SELL'&&m15Sell&&sell?'VENDA':prep;
  const gates={ema:bias==='BUY'?m15.e9>m15.e21&&m15.e21>m15.e50:bias==='SELL'?m15.e9<m15.e21&&m15.e21<m15.e50:false,
    rsi:bias==='BUY'?m15.rsi>50&&m15.rsi<75:bias==='SELL'?m15.rsi<50&&m15.rsi>25:false,
    obv:bias==='BUY'?m15.obvSlope>0:bias==='SELL'?m15.obvSlope<0:false,volume:m5.volRatio>=1.2};
  const confirms=Object.values(gates).filter(Boolean).length,trigger=bias==='BUY'?buy:bias==='SELL'?sell:false;
  const configB=bias!=='NEUTRAL'&&trigger&&confirms>=3?(bias==='BUY'?'COMPRA':'VENDA'):bias!=='NEUTRAL'&&confirms>=2?(bias==='BUY'?'PREPARAÇÃO_COMPRA':'PREPARAÇÃO_VENDA'):'NEUTRO';
  return{version:VERSION,configA,configB,bias,h1,m15,m5,gates,confirms,trigger,candles:{m5:c5,m15:c15,h1:c60}};
}
