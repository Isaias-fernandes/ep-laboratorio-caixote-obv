/* Laboratório isolado — Early Warning / Pré-Movimento v1
 * Não altera structural-pattern-detectors-v1.js, EP Whale, Supabase ou motores oficiais.
 * Objetivo: detectar padrões ainda em formação e medir antecedência do breakout em H1.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EPEarlyWarningPatterns=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const VERSION='early-warning-patterns-v1';
  const CONTEXT=96, BREAKOUT_WINDOW=24, HORIZON=96, MIN_EARLY_SCORE=65, TARGETS=[5,10,20,30,50];
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
  const slope=v=>{if(v.length<3)return 0;const m=avg(v),c=(v.length-1)/2;let n=0,d=0;v.forEach((x,i)=>{const z=i-c;n+=z*(x-m);d+=z*z});return d?n/d:0};
  const near=(a,b,t=.012)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-12)<=t;
  function normalize(rows){return rows.map((r,i)=>({t:+(r.t??r.time??r.timestamp??i),o:+(r.o??r.open),h:+(r.h??r.high),l:+(r.l??r.low),c:+(r.c??r.close),v:+(r.v??r.volume)})).filter(x=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.o>0&&x.c>0&&x.l>0&&x.h>=Math.max(x.o,x.c)&&x.l<=Math.min(x.o,x.c)&&x.v>=0)}
  function obv(c){let x=0,out=[0];for(let i=1;i<c.length;i++){x+=Math.sign(c[i].c-c[i-1].c)*c[i].v;out.push(x)}return out}
  function swings(c,field,high){const out=[];for(let i=2;i<c.length-2;i++){const x=c[i][field],ok=high?x>c[i-1][field]&&x>=c[i+1][field]:x<c[i-1][field]&&x<=c[i+1][field];if(ok)out.push({i,x})}return out}
  function atr(c,p=14){if(c.length<p+1)return NaN;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return avg(tr.slice(-p))}
  function context(input){const w=normalize(input).slice(-CONTEXT);if(w.length<CONTEXT)return null;const b=w.at(-1),prior=w.slice(-21,-1),meanVol=avg(prior.map(x=>x.v)),volumeRatio=meanVol?b.v/meanVol:0,o=obv(w),obvSlope=slope(o.slice(-12)),obvUp=obvSlope>0,currentAtr=atr(w),oldAtr=atr(w.slice(0,-8)),compression=Number.isFinite(currentAtr)&&Number.isFinite(oldAtr)&&currentAtr<oldAtr*.82;return{w,b,prior,volumeRatio,o,obvSlope,obvUp,currentAtr,oldAtr,compression}}
  function score(ctx,base,level,extra=0){const distance=Number.isFinite(level)?Math.max(0,(level-ctx.b.c)/Math.max(ctx.b.c,1e-12)):1;let s=base+extra;if(ctx.obvUp)s+=10;if(ctx.volumeRatio>=1.5)s+=8;else if(ctx.volumeRatio>=1.2)s+=5;else if(ctx.volumeRatio>=.9)s+=2;if(ctx.compression)s+=6;if(distance<=.005)s+=8;else if(distance<=.012)s+=5;else if(distance<=.02)s+=2;if(ctx.volumeRatio<.65)s-=8;return{score:Math.round(clamp(s)),distancePct:distance*100}}
  function item(ctx,name,family,base,level,extra,stage,meta={}){const q=score(ctx,base,level,extra);return{name,family,direction:'BUY',stage,score:q.score,level:Number.isFinite(level)?level:null,distanceToBreakoutPct:+q.distancePct.toFixed(3),volumeRatio:+ctx.volumeRatio.toFixed(3),obvSlope:ctx.obvSlope,obvConfirm:ctx.obvUp,compression:ctx.compression,...meta}}
  function detect(input){
    const ctx=context(input);if(!ctx)return[];const {w,b}=ctx,out=[];
    const peaks=swings(w,'h',true),valleys=swings(w,'l',false);
    const highs18=w.slice(-19,-1).map(x=>x.h),lows18=w.slice(-19,-1).map(x=>x.l),hiSlope=slope(highs18),loSlope=slope(lows18);

    // 1) Three Rising Valleys — sinal ainda antes da quebra da máxima intermediária.
    if(valleys.length>=3){const a=valleys.at(-3),m=valleys.at(-2),r=valleys.at(-1);if(a.x<m.x&&m.x<r.x&&r.i-m.i>=3){const level=Math.max(...w.slice(m.i,r.i+1).map(x=>x.h));if(b.c<=level){const rise1=(m.x/a.x-1)*100,rise2=(r.x/m.x-1)*100;out.push(item(ctx,'Three Rising Valleys','REVERSAO',58,level,(rise1>0.5&&rise2>0.5?8:4),'PRÉ-ROMPIMENTO',{structure:{rise1Pct:+rise1.toFixed(2),rise2Pct:+rise2.toFixed(2)}}))}}}

    // 2) Bull Flag — impulso já ocorreu, consolidação descendente/lateral ainda abaixo da máxima.
    const pole=w.slice(-17,-9),flag=w.slice(-9,-1),impulse=pole.length===8?pole.at(-1).c/pole[0].o-1:0,flagHigh=Math.max(...flag.map(x=>x.h)),flagLow=Math.min(...flag.map(x=>x.l)),flagRange=(flagHigh-flagLow)/Math.max(flagLow,1e-12),flagSlope=slope(flag.map(x=>x.c));
    if(impulse>=.025&&flagRange<=Math.abs(impulse)*.7&&flagSlope<=0&&b.c<=flagHigh){out.push(item(ctx,'Bull Flag','CONTINUACAO',60,flagHigh,Math.min(10,impulse*100),'BANDEIRA EM FORMAÇÃO',{impulsePct:+(impulse*100).toFixed(2),flagRangePct:+(flagRange*100).toFixed(2)}))}

    // 3) Bull Pennant — máximas caindo + mínimas subindo após impulso.
    const pennant=slope(flag.map(x=>x.h))<0&&slope(flag.map(x=>x.l))>0;
    if(impulse>=.025&&pennant&&b.c<=flagHigh){out.push(item(ctx,'Bull Pennant','CONTINUACAO',61,flagHigh,Math.min(9,impulse*100),'FLÂMULA EM FORMAÇÃO',{impulsePct:+(impulse*100).toFixed(2)}))}

    // 4) Rectangle accumulation — caixa estreita + OBV crescente antes do rompimento superior.
    const high20=Math.max(...ctx.prior.map(x=>x.h)),low20=Math.min(...ctx.prior.map(x=>x.l)),boxRange=(high20-low20)/Math.max(low20,1e-12);
    if(boxRange<=.04&&b.c<=high20&&b.c>=low20*.995){const position=(b.c-low20)/Math.max(high20-low20,1e-12);out.push(item(ctx,'Rectangle Accumulation','BILATERAL',56,high20,(ctx.obvUp?6:0)+(position>=.65?5:0),'ACUMULAÇÃO / PRÉ-ROMPIMENTO',{boxRangePct:+(boxRange*100).toFixed(2),boxPosition:+position.toFixed(3)}))}

    // 5) Falling Wedge — convergência descendente ainda sem breakout.
    const fallingWedge=hiSlope<0&&loSlope<0&&Math.abs(hiSlope)>Math.abs(loSlope);
    if(fallingWedge){const level=Math.max(...w.slice(-9,-1).map(x=>x.h));if(b.c<=level)out.push(item(ctx,'Falling Wedge','REVERSAO',58,level,ctx.obvUp?5:0,'CUNHA EM FORMAÇÃO',{hiSlope,loSlope}))}

    // 6) Double Bottom — dois fundos semelhantes, neckline ainda não rompida.
    const v1=valleys.at(-2),v2=valleys.at(-1);
    if(v1&&v2&&v2.i-v1.i>=6&&near(v1.x,v2.x,.009)){const neck=Math.max(...w.slice(v1.i,v2.i+1).map(x=>x.h));if(b.c<=neck)out.push(item(ctx,'Double Bottom','REVERSAO',60,neck,ctx.obvUp?5:0,'FUNDO DUPLO PRÉ-NECKLINE',{bottomGapPct:+(Math.abs(v2.x-v1.x)/Math.max(v1.x,v2.x)*100).toFixed(2)}))}

    return out.filter(x=>x.score>=MIN_EARLY_SCORE).sort((a,b)=>b.score-a.score);
  }
  function firstBreakout(c,from,level,window=BREAKOUT_WINDOW){for(let j=1;j<=window&&from+j<c.length;j++)if(c[from+j].c>level)return{index:from+j,hours:j,time:c[from+j].t,close:c[from+j].c};return null}
  function evaluate(input,{breakoutWindow=BREAKOUT_WINDOW,horizon=HORIZON,minScore=MIN_EARLY_SCORE}={}){
    const c=normalize(input),rows=[],cooldown=new Map();if(c.length<CONTEXT+2)return{version:VERSION,rows};
    for(let i=CONTEXT-1;i<c.length-2;i++){
      for(const s of detect(c.slice(0,i+1))){if(s.score<minScore||!Number.isFinite(s.level))continue;const key=s.name;if(i<=(cooldown.get(key)??-1))continue;const br=firstBreakout(c,i,s.level,breakoutWindow);const future=c.slice(i+1,i+1+horizon),entry=c[i].c;if(!future.length)continue;const hi=Math.max(...future.map(x=>x.h)),lo=Math.min(...future.map(x=>x.l)),mfe=(hi/entry-1)*100,mae=(lo/entry-1)*100;rows.push({...s,time:c[i].t,entry,breakout:!!br,breakoutTime:br?.time??null,leadHours:br?.hours??null,horizonBars:future.length,status:future.length===horizon?'AVALIADO':'PARCIAL',mfe:Math.max(0,mfe),mae:Math.min(0,mae),targets:Object.fromEntries(TARGETS.map(t=>[t,mfe>=t]))});cooldown.set(key,i+12)}
    }
    return{version:VERSION,breakoutWindow,horizon,minScore,rows};
  }
  return{VERSION,CONTEXT,BREAKOUT_WINDOW,HORIZON,MIN_EARLY_SCORE,TARGETS,normalize,detect,evaluate};
});
