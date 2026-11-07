/*
 * MOTOR EXPERIMENTAL DE INÍCIO DE PERNADA V1 — shadow mode.
 * Detecta estrutura antes da sobrecompra; não altera EPDecision nem os 5 motores.
 */
(()=>{'use strict';
const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x)),avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
function rsi14(c){let gain=0,loss=0;for(let i=1;i<c.length;i++){const d=+c[i].c-+c[i-1].c;if(i<=14){gain+=Math.max(d,0)/14;loss+=Math.max(-d,0)/14}else{gain=(gain*13+Math.max(d,0))/14;loss=(loss*13+Math.max(-d,0))/14}}return loss===0?(gain===0?50:100):100-100/(1+gain/loss)}
function patterns(c){
 if(c.length<35||!window.EPMotor6PatternPolicy?.assess)return[];
 const z=c.slice(-35),last=z.at(-1),out=[],close=z.map(x=>+x.c),vol=z.map(x=>+x.v||0);
 const hi=Math.max(...z.slice(-21,-1).map(x=>+x.h)),lo=Math.min(...z.slice(-21,-1).map(x=>+x.l)),range=(hi-lo)/(last.c||1)*100;
 const lows=z.slice(-7).map(x=>+x.l),highs=z.slice(-7).map(x=>+x.h);
 const higher=lows.slice(1).filter((v,i)=>v>=lows[i]).length,lower=highs.slice(1).filter((v,i)=>v<=highs[i]).length;
 const ranges=z.slice(-21,-1).map(x=>(+x.h-+x.l)/(+x.c||1)),compression=avg(ranges.slice(-5))/(avg(ranges.slice(0,15))||1)<=.85;
 const tr=[];for(let i=1;i<z.length;i++){const h=+z[i].h,l=+z[i].l,pc=+z[i-1].c;tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}const atr=avg(tr.slice(-14));
 const volBase=avg(vol.slice(-23,-3)),volumeRatio=volBase>0?avg(vol.slice(-3))/(volBase||1):0;
 const obvSeries=[0];for(let i=1;i<z.length;i++){const step=close[i]>close[i-1]?1:close[i]<close[i-1]?-1:0;obvSeries.push(obvSeries[i-1]+step*vol[i])}
 const obvDelta=obvSeries.at(-1)-obvSeries[Math.max(0,obvSeries.length-4)],obvLong=obvSeries.at(-1)-obvSeries.at(-11),obvBull=obvDelta>0&&obvLong>0,obvBear=obvDelta<0&&obvLong<0;
 const distR=(hi-last.c)/(last.c||1)*100,distS=(last.c-lo)/(last.c||1)*100;
 const breakoutUp=atr>0&&last.c>hi+.15*atr,breakdown=atr>0&&last.c<lo-.15*atr;
 const add=(name,dir,condition,levels={})=>{if(!condition)return;const evidence={volumeRatio,obvConfirmed:dir==='BUY'?obvBull:obvBear,breakout:levels.breakout??breakoutUp,breakdown:levels.breakdown??breakdown};const p=window.EPMotor6PatternPolicy.assess(name,dir,evidence);out.push({...p,name,dir,score:p.points,obvConfirm:evidence.obvConfirmed,compression,volumeRatio,breakout:evidence.breakout,breakdown:evidence.breakdown})};
 const pivots=z.map((v,i)=>i>=2&&i<z.length-2&&+v.l<Math.min(+z[i-1].l,+z[i-2].l)&&+v.l<=Math.min(+z[i+1].l,+z[i+2].l)?{i,l:+v.l}:null).filter(Boolean).slice(-3);
 if(pivots.length===3&&pivots[1].i-pivots[0].i>=3&&pivots[2].i-pivots[1].i>=3&&pivots[0].l<pivots[1].l&&pivots[1].l<pivots[2].l&&distR>=-1.5&&distR<=2.2)add('Three Rising Valleys','BUY',true);
 if(range<=8&&distR>=-2.5&&distR<=1.5)add('Rectangle Accumulation','BUY',true);
 if(range<=8&&distS>=-2.5&&distS<=1.5)add('Rectangle Distribution','SELL',true);
 const impulseWindow=z.slice(-18,-6),impulseUp=(+impulseWindow.at(-1).c/+impulseWindow[0].o-1)*100,impulseDn=(1-+impulseWindow.at(-1).c/+impulseWindow[0].o)*100;
 const retrUp=(Math.max(...z.slice(-12).map(x=>+x.h))-last.c)/(Math.max(...z.slice(-12).map(x=>+x.h))||1)*100;
 const retrDn=(last.c-Math.min(...z.slice(-12).map(x=>+x.l)))/(last.c||1)*100;
 if(impulseUp>=6&&retrUp>=0&&retrUp<=3.5&&compression)add('Bull Pennant','BUY',true);
 if(impulseUp>=6&&retrUp>=0&&retrUp<=5&&higher>=3)add('Bull Flag','BUY',true);
 if(impulseDn>=6&&retrDn>=0&&retrDn<=3.5&&compression)add('Bear Pennant','SELL',true,{breakdown});
 if(impulseDn>=6&&retrDn>=0&&retrDn<=5&&lower>=3)add('Bear Flag','SELL',true,{breakdown});
 const old=z.slice(-30,-15),recent=z.slice(-15),l1=Math.min(...old.map(x=>+x.l)),l2=Math.min(...recent.map(x=>+x.l)),h1=Math.max(...old.map(x=>+x.h)),h2=Math.max(...recent.map(x=>+x.h));
 const i1=old.findIndex(x=>+x.l===l1),i2=recent.findIndex(x=>+x.l===l2),between=z.slice(z.length-30+i1,z.length-15+i2+1),neckline=between.length?Math.max(...between.map(x=>+x.h)):Math.max(h1,h2);
 const doubleBottomBreak=atr>0&&last.c>neckline+.15*atr;
 if(Math.abs(l2-l1)/(last.c||1)*100<=1.5&&last.c>avg(close.slice(-10)))add('Double Bottom','BUY',true,{breakout:doubleBottomBreak});
 const hs=z.slice(-10).map(x=>+x.h),ls=z.slice(-10).map(x=>+x.l);
 if(hs.at(-1)<hs[0]&&ls.at(-1)<ls[0]&&(hs.at(-1)-ls.at(-1))<(hs[0]-ls[0])*.8&&lower>=4)add('Falling Wedge','BUY',true);
 if(ls.slice(1).filter((v,i)=>v>=ls[i]).length>=4&&lower>=4)add('Rising Wedge','SELL',true,{breakdown});
 return out;
}
function calc(x){
 if(!x?.observedAt||Date.now()<x.observedAt||Date.now()-x.observedAt>180000)return null;
 // Reuse the existing Motor 7 H1 request: no network or timeframe ambiguity.
 const cached=window.EPMotor7Minimum?.getCandles?.(x.sym||x.key);
 const candles=(cached||[]).filter(c=>Number.isFinite(+c.closeTime)&&+c.closeTime<Date.now()).slice(-96);if(candles.length<35||Date.now()-candles.at(-1).closeTime>3900000||candles.some((c,i)=>i&&c.t-candles[i-1].t!==3600000))return null;const pats=patterns(candles);
 const candidate=(window.EPBackend24?.get?.()?.state||[]).find(s=>s.symbol===x.sym||s.asset===String(x.sym||'').replace('USDT',''));
 const backend=candidate&&Date.now()-Date.parse(candidate.updated_at)<=180000?candidate:null;
 const el=backend?.metrics?.earlyLeg||backend?.metrics?.early_leg||null,fv=backend?.metrics?.futuresValidation||el?.metrics?.futuresValidation||null;
 const localRows=window.EPEarlyLegObserver?.get?.()?.rows;
 const localCandidate=Array.isArray(localRows)?localRows.find(r=>r.sym===x.sym):localRows?.[x.sym]||null;
 const localTime=localCandidate?.updated_at||localCandidate?.observedAt||localCandidate?.ts;
 const local=localTime&&Date.now()-(typeof localTime==='number'?localTime:Date.parse(localTime))<=180000?localCandidate:null,pre=el||local,preDir=pre?.dir||null,ps=+pre?.score||0,fs=fv?.score,rsi=rsi14(candles);
 function side(dir){
   const sideP=pats.filter(p=>p.dir===dir),ordered=[...sideP].sort((a,b)=>(a.rank||99)-(b.rank||99)||b.points-a.points),confirmedBest=ordered.find(p=>p.confirmed)||null,best=confirmedBest||ordered[0]||null;
   const aligned=!preDir||preDir===dir;
   let parts={pattern:best?best.points:0,preLeg:aligned?(ps>=80?28:ps>=65?22:ps>=50?14:ps>=40?7:0):0,futures:Number.isFinite(+fs)?Math.round(Math.min(15,+fs*.2)):0,obv:best?.obvConfirm?8:0,compression:best?.compression?5:0,volume:best?.volumeRatio>=1.2?8:0,buyerFlow:flowValid?(dir==='BUY'?taker/q>=.55:taker/q<=.45)?10:0:0,antiStretch:0};
   if(dir==='BUY')parts.antiStretch=rsi>=80?-25:rsi>=74?-15:rsi>=69?-7:rsi<=28?-8:0;
   else parts.antiStretch=rsi<=20?-25:rsi<=26?-15:rsi<=31?-7:rsi>=72?-8:0;
   return{dir,best,confirmedBest,parts,score:Math.round(clamp(Object.values(parts).reduce((a,v)=>a+v,0)))};
 }
 const recent=candles.slice(-3),q=recent.reduce((a,c)=>a+(+c.quoteVolume||0),0),taker=recent.reduce((a,c)=>a+(+c.takerBuyQuote||0),0),flowValid=recent.every(c=>Number.isFinite(c.quoteVolume)&&c.quoteVolume>0&&Number.isFinite(c.takerBuyQuote)&&c.takerBuyQuote>=0&&c.takerBuyQuote<=c.quoteVolume);
 const buy=side('BUY'),sell=side('SELL'),s=sell.score>buy.score?sell:buy,score=s.score,phase=score>=80?'IGNIÇÃO':score>=65?'PRÉ-IGNIÇÃO':score>=50?'PRESSÃO':score>=35?'ACUMULAÇÃO':'OBSERVAÇÃO';
 return{timeframe:'1h',closedCandles:true,candleAt:candles.at(-1).t,compression:!!s.best?.compression,buyerFlow:flowValid?{ratio:taker/q,delta:(2*taker-q)/q,source:'Binance H1 taker quote',closeTime:candles.at(-1).closeTime}:null,version:'early-leg-motor-v1.3',score,phase,dir:s.dir,pattern:s.best?.name||null,patterns:pats.filter(p=>p.dir===s.dir).map(p=>p.name),patternConfirmed:!!s.confirmedBest,confirmedPattern:s.confirmedBest?.name||null,patternStatus:s.confirmedBest?.status||s.best?.status||'AGUARDANDO PADRÃO',patternReason:s.confirmedBest?.reason||s.best?.reason||'sem estrutura prioritária',patternPriority:s.best?.rank??null,patternVolumeRatio:s.best?.volumeRatio??0,patternObvConfirmed:!!s.best?.obvConfirm,patternBreakoutConfirmed:!!s.best?.breakoutConfirmed,parts:s.parts,rsi,preLegScore:ps,futuresScore:Number.isFinite(+fs)?+fs:null,buyScore:buy.score,sellScore:sell.score,shadowMode:true};
}
window.EPEarlyLegMotorV1={calc,patterns,VERSION:'early-leg-motor-v1.3'};window.addEventListener('ep-motor7-minimum-updated',()=>window.dispatchEvent(new Event('ep-early-leg-updated')));window.dispatchEvent(new Event('ep-early-leg-motor-ready'));
})();
