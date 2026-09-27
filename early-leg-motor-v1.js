/* MOTOR EXPERIMENTAL DE INÍCIO DE PERNADA V1
 * Combina padrões gráficos + PRE-LEG + futuros. BUY e SELL não são espelhados.
 * Shadow only: não altera sinais oficiais.
 */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.EPEarlyLegMotorV1=api})(typeof window!=='undefined'?window:null,function(){
'use strict';const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
const W={'Bull Pennant':24,'Bull Flag':22,'Three Rising Valleys':20,'Rectangle Accumulation':15,'Falling Wedge':14,'Double Bottom':14};
function analyze({patterns=[],preLeg=null,futuresValidation=null,rsi=null}={}){
 const best=[...patterns].sort((a,b)=>(W[b.name]||0)-(W[a.name]||0)||(+b.score||0)-(+a.score||0))[0]||null;
 let score=0,parts={pattern:0,preLeg:0,futures:0,obv:0,compression:0,antiStretch:0};
 if(best){parts.pattern=W[best.name]||8;if(best.obvConfirm)parts.obv=8;if(best.compression)parts.compression=5}
 const ps=+preLeg?.score||0;parts.preLeg=ps>=80?28:ps>=65?22:ps>=50?14:ps>=40?7:0;
 const fs=futuresValidation?.score;parts.futures=Number.isFinite(+fs)?Math.round(Math.min(15,+fs*.2)):0;
 const rr=Number.isFinite(+rsi)?+rsi:null;
 if(rr!=null){parts.antiStretch=rr>=80?-25:rr>=74?-15:rr>=69?-7:rr<=28?-8:0}
 score=Math.round(clamp(Object.values(parts).reduce((a,v)=>a+v,0)));
 const phase=score>=80?'IGNIÇÃO':score>=65?'PRÉ-IGNIÇÃO':score>=50?'PRESSÃO':score>=35?'ACUMULAÇÃO':'OBSERVAÇÃO';
 return{version:'early-leg-motor-v1',direction:'BUY',score,phase,pattern:best?.name||null,patternScore:+best?.score||null,parts,shadowMode:true};
}
return{VERSION:'early-leg-motor-v1',analyze};
});