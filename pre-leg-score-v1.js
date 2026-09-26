/* PRE-LEG SCORE v1 — experimental, isolado dos motores oficiais.
 * Mede preparação ANTES do rompimento; não é sinal de compra/venda.
 */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.EPPreLegScore=api})(typeof window!=='undefined'?window:null,function(){
'use strict';
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
const slope=v=>{if(v.length<3)return 0;const m=avg(v),c=(v.length-1)/2;let n=0,d=0;v.forEach((x,i)=>{const z=i-c;n+=z*(x-m);d+=z*z});return d?n/d:0};
function normalize(rows){return rows.map((r,i)=>({t:+(r.t??r.time??i),o:+(r.o??r.open),h:+(r.h??r.high),l:+(r.l??r.low),c:+(r.c??r.close),v:+(r.v??r.volume)})).filter(x=>[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.c>0)}
function rsi(c,p=14){if(c.length<=p)return 50;let g=0,l=0;for(let i=c.length-p;i<c.length;i++){const d=c[i].c-c[i-1].c;g+=Math.max(d,0);l+=Math.max(-d,0)}return !l?100:100-100/(1+g/l)}
function obv(c){let x=0,o=[0];for(let i=1;i<c.length;i++){x+=Math.sign(c[i].c-c[i-1].c)*c[i].v;o.push(x)}return o}
function analyze(input){
 const c=normalize(input).slice(-96);if(c.length<40)return null;
 const b=c.at(-1),prior=c.slice(-21,-1),res=Math.max(...prior.map(x=>x.h)),sup=Math.min(...prior.map(x=>x.l));
 const ranges=c.slice(-20).map(x=>(x.h-x.l)/x.c),old=avg(ranges.slice(0,10)),recent=avg(ranges.slice(-5)),compression=old?recent/old:1;
 const vols=c.slice(-20).map(x=>x.v),volBase=avg(vols.slice(0,15)),volRecent=avg(vols.slice(-5)),volumeAcceleration=volBase?volRecent/volBase:1;
 const o=obv(c),obvSlope=slope(o.slice(-12)),priceSlope=slope(c.slice(-12).map(x=>x.c)),obvLead=obvSlope>0&&priceSlope<=Math.abs(priceSlope)*.35;
 const tol=Math.max((res-sup)*.08,b.c*.0035),attacks=prior.slice(-12).filter(x=>x.h>=res-tol).length;
 const dist=Math.max(0,(res-b.c)/b.c*100),rv=rsi(c);
 const lows=c.slice(-7).map(x=>x.l),higherLows=lows.slice(1).filter((x,i)=>x>=lows[i]).length;
 let score=0,parts={};
 parts.compression=compression<=.72?20:compression<=.85?14:compression<=.95?7:0;
 parts.obv=obvLead?20:obvSlope>0?12:0;
 parts.attacks=attacks>=4?18:attacks>=3?14:attacks>=2?8:0;
 parts.volume=volumeAcceleration>=1.35?15:volumeAcceleration>=1.15?10:volumeAcceleration>=.95?4:0;
 parts.structure=higherLows>=4?12:higherLows>=3?8:0;
 parts.proximity=dist<=.5?15:dist<=1?11:dist<=2?6:0;
 score=Object.values(parts).reduce((a,v)=>a+v,0);
 let penalty=0;if(rv>=78)penalty+=18;else if(rv>=72)penalty+=8;
 const move6=(b.c/c.at(-7).c-1)*100;if(move6>=5)penalty+=15;else if(move6>=3)penalty+=7;
 if(b.c>res)penalty+=25;
 score=Math.round(clamp(score-penalty));
 const phase=score>=80?'PRÉ-IGNIÇÃO':score>=65?'PRESSÃO':score>=50?'PREPARAÇÃO':'OBSERVAÇÃO';
 return{version:'pre-leg-score-v1',score,phase,price:b.c,resistance:res,support:sup,distanceToBreakoutPct:+dist.toFixed(3),compressionRatio:+compression.toFixed(3),volumeAcceleration:+volumeAcceleration.toFixed(3),obvLead,obvSlope,attacks,higherLows,rsi:+rv.toFixed(2),move6Pct:+move6.toFixed(2),penalty,parts};
}
return{VERSION:'pre-leg-score-v1',analyze};
});