/* PRE-LEG FUTURES v1 — experimental.
 * Confirma/nega PRE-LEG técnico usando derivativos Binance USD-M.
 * Não altera motores oficiais nem gera ordem.
 */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.EPPreLegFutures=api})(typeof window!=='undefined'?window:null,function(){
'use strict';const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));const n=x=>Number.isFinite(+x)?+x:0;
async function j(url){const r=await fetch(url,{headers:{'User-Agent':'ep-lab-futures/1.0'}});if(!r.ok)throw Error(r.status+' '+url);return r.json()}
async function fetchMetrics(symbol){
 const base='https://fapi.binance.com';
 const [oi,prem,hist,taker]=await Promise.all([
  j(base+'/fapi/v1/openInterest?symbol='+symbol).catch(()=>({})),
  j(base+'/fapi/v1/premiumIndex?symbol='+symbol).catch(()=>({})),
  j(base+'/futures/data/openInterestHist?symbol='+symbol+'&period=1h&limit=7').catch(()=>[]),
  j(base+'/futures/data/takerlongshortRatio?symbol='+symbol+'&period=1h&limit=3').catch(()=>[])
 ]);
 const a=hist[0],b=hist.at?.(-1),oi0=n(a?.sumOpenInterestValue||a?.sumOpenInterest),oi1=n(b?.sumOpenInterestValue||b?.sumOpenInterest);
 const oiChangePct=oi0?((oi1-oi0)/oi0)*100:0;
 const tr=taker.at?.(-1)||{},ratio=n(tr.buySellRatio),buy=n(tr.buyVol),sell=n(tr.sellVol);
 const takerImbalance=(buy+sell)?(buy-sell)/(buy+sell):(ratio?((ratio-1)/(ratio+1)):0);
 return{oi:n(oi.openInterest),oiChangePct,fundingPct:n(prem.lastFundingRate)*100,takerBuySellRatio:ratio,takerImbalance,source:'binance-usdm'};
}
function score(pre,m){
 let s=0;const parts={oi:0,taker:0,funding:0,technical:0};const tech=pre?.score||0;
 parts.technical=tech>=80?25:tech>=65?20:tech>=50?12:0;
 parts.oi=m.oiChangePct>=3?30:m.oiChangePct>=1?22:m.oiChangePct>=.25?12:m.oiChangePct< -2?-12:0;
 parts.taker=m.takerImbalance>=.12?25:m.takerImbalance>=.05?18:m.takerImbalance>0?8:m.takerImbalance<=-.12?-18:m.takerImbalance<0?-8:0;
 const f=m.fundingPct;parts.funding=Math.abs(f)<=.03?20:Math.abs(f)<=.06?12:Math.abs(f)<=.10?4:-15;
 s=Object.values(parts).reduce((a,v)=>a+v,0);const total=Math.round(clamp(s));
 return{score:total,phase:total>=80?'CONFIRMAÇÃO FORTE':total>=65?'CONFIRMAÇÃO':total>=50?'PARCIAL':'SEM CONFIRMAÇÃO',parts};
}
return{VERSION:'pre-leg-futures-v1',fetchMetrics,score};
});