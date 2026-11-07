// Extracted from original source; full original and SHA-256 stored alongside.
import policy from './original/motor6-pattern-policy.js';
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
export function patterns(c){
 if(c.length<35||!policy?.assess)return[];
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
 const add=(name,dir,condition,levels={})=>{if(!condition)return;const evidence={volumeRatio,obvConfirmed:dir==='BUY'?obvBull:obvBear,breakout:levels.breakout??breakoutUp,breakdown:levels.breakdown??breakdown};const p=policy.assess(name,dir,evidence);out.push({...p,name,dir,score:p.points,obvConfirm:evidence.obvConfirmed,compression,volumeRatio,breakout:evidence.breakout,breakdown:evidence.breakdown})};
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
