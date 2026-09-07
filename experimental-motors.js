/* LABORATORIO ISOLADO — 5 motores experimentais. Nao importa nem altera EP Whale. */
(function(root){
'use strict';
const VERSION='experimental-motors-v1', HORIZON=96, MIN_SCORE=80, TARGETS=[5,10,20,30,50];
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const ema=(a,n)=>{if(!a.length)return 0;let e=a[0],k=2/(n+1);for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e};
const slope=a=>a.length<2?0:(a[a.length-1]-a[0])/Math.max(Math.abs(a[0]),1e-9)*100;
const obv=c=>{let x=0;for(let i=1;i<c.length;i++)x+=c[i].c>c[i-1].c?c[i].v:c[i].c<c[i-1].c?-c[i].v:0;return x};
const atr=c=>avg(c.slice(-14).map((x,i,a)=>i?Math.max(x.h-x.l,Math.abs(x.h-a[i-1].c),Math.abs(x.l-a[i-1].c)):x.h-x.l));
const zscore=(x,a)=>{const m=avg(a),sd=Math.sqrt(avg(a.map(v=>(v-m)**2)));return sd?(x-m)/sd:0};
function common(c){const w=c.slice(-96),cl=w.map(x=>x.c),vol=w.map(x=>x.v),last=w.at(-1),prev=w.at(-2);const e20=ema(cl.slice(-50),20),e50=ema(cl.slice(-80),50);const a=atr(w),ranges=w.slice(-20).map(x=>x.h-x.l);const bw=avg(ranges)/Math.max(last.c,1e-9)*100;const vz=zscore(last.v,vol.slice(-21,-1));const oNow=obv(w.slice(-32)),oPrev=obv(w.slice(-64,-32));return{last,prev,e20,e50,trendSlope:slope(cl.slice(-20)),atrPct:a/last.c*100,bw,volRatio:last.v/Math.max(avg(vol.slice(-21,-1)),1e-9),volumeZ:vz,obvDelta:oNow-oPrev,high20:Math.max(...w.slice(-21,-1).map(x=>x.h)),low20:Math.min(...w.slice(-21,-1).map(x=>x.l))}}
function sig(id,name,dir,score,ctx,reason){return{id,name,direction:dir,score:Math.max(0,Math.min(100,Math.round(score))),price:ctx.last.c,reason,features:{volumeRatio:ctx.volRatio,volumeZ:ctx.volumeZ,atrPct:ctx.atrPct,bollingerWidthProxy:ctx.bw,obvDelta:ctx.obvDelta,ema20:ctx.e20,ema50:ctx.e50,trendSlope:ctx.trendSlope}}}
function evaluate(c,extra={}){if(!Array.isArray(c)||c.length<96)return[];const x=common(c),out=[];
// M1 Padroes: breakout/reversao proxy; candlestick module fornece padroes detalhados separadamente.
let d=x.last.c>x.high20?'BUY':x.last.c<x.low20?'SELL':null;if(d){let s=62+(x.volRatio>=1.2?10:0)+(Math.abs(x.volumeZ)>=1.5?10:0)+(d==='BUY'?x.obvDelta>0:x.obvDelta<0?true:false?1:0?0:0);s+=((d==='BUY'&&x.obvDelta>0)||(d==='SELL'&&x.obvDelta<0))?8:0;out.push(sig(1,'Padroes/Breakout',d,s,x,'rompimento 20H + confirmacoes'))}
// M2 Tendencia/Estrutura
const bull=x.e20>x.e50&&x.trendSlope>0,bear=x.e20<x.e50&&x.trendSlope<0;if(bull||bear){d=bull?'BUY':'SELL';let s=68+Math.min(16,Math.abs(x.trendSlope)*4)+(((d==='BUY'&&x.last.c>x.prev.h)||(d==='SELL'&&x.last.c<x.prev.l))?10:0);out.push(sig(2,'Tendencia/Estrutura',d,s,x,'EMA20/50 + inclinacao + estrutura'))}
// M3 Volume/Acumulacao
if(Math.abs(x.volumeZ)>=1||x.volRatio>=1.5){d=x.obvDelta>=0?'BUY':'SELL';let s=60+Math.min(20,Math.abs(x.volumeZ)*6)+Math.min(12,Math.max(0,x.volRatio-1)*8)+8;out.push(sig(3,'Volume/Acumulacao',d,s,x,'Volume Z + volume relativo + OBV'))}
// M4 Volatilidade/Expansao
const recent=c.slice(-20),old=c.slice(-40,-20),rNow=avg(recent.map(q=>q.h-q.l)),rOld=avg(old.map(q=>q.h-q.l));if(rOld&&rNow/rOld>=1.15){d=x.last.c>=x.prev.c?'BUY':'SELL';let s=64+Math.min(20,(rNow/rOld-1)*40)+(x.volRatio>=1.2?10:0);out.push(sig(4,'Volatilidade/Expansao',d,s,x,'expansao de range/ATR + volume'))}
// M5 Fluxo/Baleias: somente dados reais fornecidos; nunca infere CVD/OI/book a partir de OHLCV.
const f=extra.flow;if(f&&Number.isFinite(f.cvd)&&Number.isFinite(f.oiChange)&&Number.isFinite(f.bookImbalance)){const bullF=f.cvd>0&&f.oiChange>0&&f.bookImbalance>0,bearF=f.cvd<0&&f.oiChange>0&&f.bookImbalance<0;if(bullF||bearF){d=bullF?'BUY':'SELL';let s=65+Math.min(15,Math.abs(f.bookImbalance)*100)+(Math.abs(f.cvdZ||0)>=1.5?10:0)+(f.largeTradeAligned?10:0);out.push(sig(5,'Fluxo/Baleias',d,s,x,'CVD + OI + book imbalance + large trades reais'))}}
return out}
const api={VERSION,HORIZON,MIN_SCORE,TARGETS,evaluate};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.EPExperimentalMotors=api;
})(typeof window!=='undefined'?window:globalThis);
