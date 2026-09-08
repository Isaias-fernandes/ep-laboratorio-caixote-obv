/* Laboratório isolado — detectores estruturais bidirecionais v1
 * Não acessa EP Whale, Supabase ou motores oficiais.
 * Regras congeladas para pesquisa: H1, contexto 96, score >=80, horizonte 96.
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.EPStructuralPatternDetectors=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const VERSION='structural-detectors-v1', HORIZON=96, MIN_SCORE=80, TARGETS=[5,10,20,30,50];
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const slope=v=>{if(v.length<3)return 0;const m=avg(v),c=(v.length-1)/2;let n=0,d=0;v.forEach((x,i)=>{const z=i-c;n+=z*(x-m);d+=z*z});return d?n/d:0};
  const near=(a,b,t=.008)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-12)<=t;
  function normalize(rows){return rows.map((r,i)=>({t:+(r.t??r.time??r.timestamp??i),o:+(r.o??r.open),h:+(r.h??r.high),l:+(r.l??r.low),c:+(r.c??r.close),v:+(r.v??r.volume)})).filter(x=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.o>0&&x.c>0&&x.l>0&&x.h>=Math.max(x.o,x.c)&&x.l<=Math.min(x.o,x.c)&&x.v>=0)}
  function obv(c){let x=0,out=[0];for(let i=1;i<c.length;i++){x+=Math.sign(c[i].c-c[i-1].c)*c[i].v;out.push(x)}return out}
  function swings(c,field,high){const out=[];for(let i=2;i<c.length-2;i++){const x=c[i][field],ok=high?x>c[i-1][field]&&x>=c[i+1][field]:x<c[i-1][field]&&x<=c[i+1][field];if(ok)out.push({i,x})}return out}
  function context(input){const w=normalize(input).slice(-96);if(w.length<96)return null;const b=w.at(-1),prior=w.slice(-21,-1),meanVol=avg(prior.map(x=>x.v)),volumeRatio=meanVol?b.v/meanVol:0,o=obv(w),obvUp=o.at(-1)>o.at(-6),obvDown=o.at(-1)<o.at(-6);return{w,b,prior,volumeRatio,obvUp,obvDown}}
  function retest(w,level,direction){if(!Number.isFinite(level)||w.length<3)return false;const a=w.at(-2),b=w.at(-1);return direction==='BUY'?(a.l<=level*1.006&&a.c>=level*.994&&b.c>=level):(a.h>=level*.994&&a.c<=level*1.006&&b.c<=level)}
  function score(ctx,direction,base,breakout,retested,forming){let s=base,obvOk=direction==='BUY'?ctx.obvUp:ctx.obvDown;if(obvOk)s+=8;if(ctx.volumeRatio>=2)s+=12;else if(ctx.volumeRatio>=1.5)s+=8;else if(ctx.volumeRatio>=1.2)s+=4;if(breakout)s+=10;if(retested)s+=6;if(forming)s=Math.min(s,79);if(ctx.volumeRatio<.8)s=Math.min(s,69);return{score:Math.max(0,Math.min(100,Math.round(s))),obvOk}}
  function item(ctx,name,family,direction,base,level,breakout,retested,stage='FORMAÇÃO'){const q=score(ctx,direction,base,breakout,retested,!breakout);return{name,family,direction,score:q.score,level:Number.isFinite(level)?level:null,breakout:!!breakout,retest:!!retested,stage:breakout?(retested?'RETESTE CONFIRMADO':'BREAKOUT CONFIRMADO'):stage,volumeRatio:ctx.volumeRatio,obv:q.obvOk?'CONFIRMADO':'SEM CONFIRMAÇÃO'}}
  function detect(input){
    const ctx=context(input);if(!ctx)return[];const {w,b}=ctx,out=[];
    const highs18=w.slice(-19,-1).map(x=>x.h),lows18=w.slice(-19,-1).map(x=>x.l),hiSlope=slope(highs18),loSlope=slope(lows18),high18=Math.max(...highs18),low18=Math.min(...lows18);
    const peaks=swings(w,'h',true),valleys=swings(w,'l',false),tol=b.c*.008;
    const add=(name,family,direction,base,level,br)=>out.push(item(ctx,name,family,direction,base,level,br,br&&retest(w,level,direction)));

    // Bandeiras e flâmulas: impulso + consolidação, depois rompimento na direção do impulso.
    const pole=w.slice(-17,-9),flag=w.slice(-9,-1),impulse=pole.length===8?pole.at(-1).c/pole[0].o-1:0,flagHigh=Math.max(...flag.map(x=>x.h)),flagLow=Math.min(...flag.map(x=>x.l)),flagRange=(flagHigh-flagLow)/Math.max(flagLow,1e-12);
    if(impulse>=.025&&flagRange<=Math.abs(impulse)*.7&&slope(flag.map(x=>x.c))<=0){const br=b.c>flagHigh;add('Bull Flag','CONTINUACAO','BUY',66,flagHigh,br)}
    if(impulse<=-.025&&flagRange<=Math.abs(impulse)*.7&&slope(flag.map(x=>x.c))>=0){const br=b.c<flagLow;add('Bear Flag','CONTINUACAO','SELL',66,flagLow,br)}
    const pennant=slope(flag.map(x=>x.h))<0&&slope(flag.map(x=>x.l))>0;
    if(impulse>=.025&&pennant){const br=b.c>flagHigh;add('Bull Pennant','CONTINUACAO','BUY',66,flagHigh,br)}
    if(impulse<=-.025&&pennant){const br=b.c<flagLow;add('Bear Pennant','CONTINUACAO','SELL',66,flagLow,br)}

    // Triângulos direcionais e simétrico.
    const asc=Math.abs(hiSlope)<=Math.max(Math.abs(loSlope)*.3,b.c*.000005)&&loSlope>0;
    const desc=Math.abs(loSlope)<=Math.max(Math.abs(hiSlope)*.3,b.c*.000005)&&hiSlope<0;
    const sym=hiSlope<0&&loSlope>0;
    if(asc){const br=b.c>high18;add('Ascending Triangle','CONTINUACAO','BUY',66,high18,br)}
    if(desc){const br=b.c<low18;add('Descending Triangle','CONTINUACAO','SELL',66,low18,br)}
    if(sym){if(b.c>high18)add('Symmetrical Triangle','BILATERAL','BUY',64,high18,true);else if(b.c<low18)add('Symmetrical Triangle','BILATERAL','SELL',64,low18,true);else out.push(item(ctx,'Symmetrical Triangle','BILATERAL','BUY',54,high18,false,false,'AGUARDANDO ROMPIMENTO'))}

    // Retângulo / trading range bilateral.
    const high20=Math.max(...ctx.prior.map(x=>x.h)),low20=Math.min(...ctx.prior.map(x=>x.l)),boxRange=(high20-low20)/Math.max(low20,1e-12);
    if(boxRange<=.04){if(b.c>high20)add('Rectangle / Trading Range','BILATERAL','BUY',68,high20,true);else if(b.c<low20)add('Rectangle / Trading Range','BILATERAL','SELL',68,low20,true);else out.push(item(ctx,'Rectangle / Trading Range','BILATERAL','BUY',58,high20,false,false,'AGUARDANDO ROMPIMENTO'))}

    // Cunhas convergentes.
    const fallingWedge=hiSlope<0&&loSlope<0&&Math.abs(hiSlope)>Math.abs(loSlope),risingWedge=hiSlope>0&&loSlope>0&&Math.abs(loSlope)>Math.abs(hiSlope);
    if(fallingWedge){const level=Math.max(...w.slice(-9,-1).map(x=>x.h)),br=b.c>level;add('Falling Wedge','REVERSAO','BUY',64,level,br)}
    if(risingWedge){const level=Math.min(...w.slice(-9,-1).map(x=>x.l)),br=b.c<level;add('Rising Wedge','REVERSAO','SELL',64,level,br)}

    // Fundo/Topo duplo.
    const v1=valleys.at(-2),v2=valleys.at(-1),p1=peaks.at(-2),p2=peaks.at(-1);
    if(v1&&v2&&v2.i-v1.i>=6&&near(v1.x,v2.x,.009)){const neck=Math.max(...w.slice(v1.i,v2.i+1).map(x=>x.h)),br=b.c>neck;add('Double Bottom','REVERSAO','BUY',74,neck,br)}
    if(p1&&p2&&p2.i-p1.i>=6&&near(p1.x,p2.x,.009)){const neck=Math.min(...w.slice(p1.i,p2.i+1).map(x=>x.l)),br=b.c<neck;add('Double Top','REVERSAO','SELL',74,neck,br)}

    // Fundo/Topo triplo.
    if(valleys.length>=3){const a=valleys.at(-3),m=valleys.at(-2),r=valleys.at(-1);if(r.i-a.i>=12&&near(a.x,m.x,.011)&&near(m.x,r.x,.011)){const neck=Math.max(...w.slice(a.i,r.i+1).map(x=>x.h)),br=b.c>neck;add('Triple Bottom','REVERSAO','BUY',76,neck,br)}}
    if(peaks.length>=3){const a=peaks.at(-3),m=peaks.at(-2),r=peaks.at(-1);if(r.i-a.i>=12&&near(a.x,m.x,.011)&&near(m.x,r.x,.011)){const neck=Math.min(...w.slice(a.i,r.i+1).map(x=>x.l)),br=b.c<neck;add('Triple Top','REVERSAO','SELL',76,neck,br)}}

    // OCO e OCO invertido.
    if(valleys.length>=3){const l=valleys.at(-3),h=valleys.at(-2),r=valleys.at(-1),shoulders=Math.abs(l.x-r.x)<=tol*1.5,head=h.x<Math.min(l.x,r.x)-tol*.4;if(shoulders&&head&&r.i-l.i>=10){const neck=Math.max(...w.slice(l.i,r.i+1).map(x=>x.h)),br=b.c>neck;add('Head and Shoulders Bottom','REVERSAO','BUY',76,neck,br)}}
    if(peaks.length>=3){const l=peaks.at(-3),h=peaks.at(-2),r=peaks.at(-1),shoulders=Math.abs(l.x-r.x)<=tol*1.5,head=h.x>Math.max(l.x,r.x)+tol*.4;if(shoulders&&head&&r.i-l.i>=10){const neck=Math.min(...w.slice(l.i,r.i+1).map(x=>x.l)),br=b.c<neck;add('Head and Shoulders Top','REVERSAO','SELL',76,neck,br)}}

    // Three Rising Valleys / Three Falling Peaks.
    if(valleys.length>=3){const a=valleys.at(-3),m=valleys.at(-2),r=valleys.at(-1);if(a.x<m.x&&m.x<r.x){const level=Math.max(...w.slice(m.i,r.i+1).map(x=>x.h)),br=b.c>level;add('Three Rising Valleys','REVERSAO','BUY',70,level,br)}}
    if(peaks.length>=3){const a=peaks.at(-3),m=peaks.at(-2),r=peaks.at(-1);if(a.x>m.x&&m.x>r.x){const level=Math.min(...w.slice(m.i,r.i+1).map(x=>x.l)),br=b.c<level;add('Three Falling Peaks','REVERSAO','SELL',70,level,br)}}

    return out.sort((a,b)=>b.score-a.score);
  }
  function evaluate(input,horizon=HORIZON,minScore=MIN_SCORE){const c=normalize(input),rows=[],cooldown=new Map();if(c.length<96)return{version:VERSION,horizon,minScore,rows};for(let i=95;i<c.length-1;i++){const sigs=detect(c.slice(0,i+1));for(const s of sigs){if(!s.breakout||s.score<minScore)continue;const key=s.name+'|'+s.direction;if(i<=(cooldown.get(key)??-1))continue;const future=c.slice(i+1,i+1+horizon),entry=future[0]?.o;if(!entry||!future.length)continue;const hi=Math.max(...future.map(x=>x.h)),lo=Math.min(...future.map(x=>x.l)),mfe=s.direction==='BUY'?(hi/entry-1)*100:(entry/lo-1)*100,mae=s.direction==='BUY'?(lo/entry-1)*100:(entry/hi-1)*100;rows.push({...s,time:c[i].t,entryTime:future[0].t,entry,horizon,bars:future.length,status:future.length===horizon?'AVALIADO':'PARCIAL',mfe:Math.max(0,mfe),mae:Math.min(0,mae),targets:Object.fromEntries(TARGETS.map(t=>[t,mfe>=t]))});cooldown.set(key,i+Math.max(4,Math.floor(horizon/4)))}}return{version:VERSION,horizon,minScore,rows}}
  return{VERSION,HORIZON,MIN_SCORE,TARGETS,implementedPatterns:['Bull Flag','Bear Flag','Bull Pennant','Bear Pennant','Ascending Triangle','Descending Triangle','Symmetrical Triangle','Rectangle / Trading Range','Falling Wedge','Rising Wedge','Double Bottom','Double Top','Triple Bottom','Triple Top','Head and Shoulders Bottom','Head and Shoulders Top','Three Rising Valleys','Three Falling Peaks'],normalize,detect,evaluate};
});
