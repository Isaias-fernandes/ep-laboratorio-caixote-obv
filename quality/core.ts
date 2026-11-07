import {CONFIG, type Candle, type Json} from './config.ts';
import {patterns} from './patterns.mjs';
export {CONFIG};
const avg=(v:number[])=>v.reduce((a,b)=>a+b,0)/(v.length||1);
export function validate(rows:Candle[]) {
  if(!Array.isArray(rows)||!rows.length)throw Error('Candles ausentes');
  for(let i=0;i<rows.length;i++){
    const c=rows[i];
    if(![c.t,c.o,c.h,c.l,c.c,c.v].every(Number.isFinite)||c.t%CONFIG.intervalMs!==0||
      Math.min(c.o,c.l,c.c)<=0||c.h<Math.max(c.o,c.c)||c.l>Math.min(c.o,c.c)||c.v<0)
      throw Error('Candle H1 inválido');
    if(i&&c.t-rows[i-1].t!==CONFIG.intervalMs)throw Error('Lacuna H1');
  }
}
export function atr(rows:Candle[],period=14){
  const w=rows.slice(-period-1);if(w.length<period+1)return null;
  return avg(w.slice(1).map((c,i)=>Math.max(c.h-c.l,Math.abs(c.h-w[i].c),Math.abs(c.l-w[i].c))));
}
export function features(rows:Candle[]){
  validate(rows);if(rows.length<CONFIG.warmup)throw Error('Histórico H1 insuficiente');
  const w=rows.slice(-35),last=w.at(-1)!,previous=w.slice(-21,-1);
  const volumeBase=avg(w.slice(-23,-3).map(c=>c.v));
  const volumeRatio=volumeBase>0?avg(w.slice(-3).map(c=>c.v))/volumeBase:null;
  const obv=[0];for(let i=1;i<w.length;i++)obv.push(obv[i-1]+Math.sign(w[i].c-w[i-1].c)*w[i].v);
  const obv3=obv.at(-1)!-obv.at(-4)!,obv10=obv.at(-1)!-obv.at(-11)!;
  const resistance=Math.max(...previous.map(c=>c.h)),a=atr(w)!;
  const close=rows.slice(-20).map(c=>c.c),mean=avg(close),sd=Math.sqrt(avg(close.map(x=>(x-mean)**2)));
  const flow=w.slice(-3),flowAvailable=flow.every(c=>Number.isFinite(c.q)&&Number.isFinite(c.tq)&&c.q!>0&&c.tq!>=0&&c.tq!<=c.q!);
  const aggression=flowAvailable?flow.reduce((s,c)=>s+c.tq!,0)/flow.reduce((s,c)=>s+c.q!,0):null;
  const minimum=rows.length>=720?Math.min(...rows.slice(-720).map(c=>c.l)):null;
  return {atr:a,resistance,volumeRatio,obv3,obv10,aggression,
    bollingerUpper:mean+2*sd,notStretched:last.c<=mean+2*sd,
    minimum30:minimum,minimumDistancePct:minimum==null?null:(last.c/minimum-1)*100,
    breakout:last.c>resistance+CONFIG.breakoutAtr*a,
    candleUp:last.c>last.o,price:last.c,candleTime:last.t,
    structuralLow:Math.min(...rows.slice(-7,-1).map(c=>c.l)),
    compression:avg(w.slice(-6,-1).map(c=>(c.h-c.l)/c.c))<=.85*avg(w.slice(-21,-6).map(c=>(c.h-c.l)/c.c)),
    patternReadings:patterns(rows),flowAvailable};
}
export function detect(rows:Candle[],state:Json={},context:Json={}){
  const f=features(rows),last=rows.at(-1)!,t=last.t,previous=structuredClone(state);
  const knownPreleg=context.prelegKnown===true;
  const filters={BOLLINGER:f.notStretched,NO_PRELEG_24H:knownPreleg?context.prelegIn24h===false:null};
  const ready=f.volumeRatio!=null&&f.volumeRatio>=CONFIG.volumeMinimum&&f.obv3>0&&f.obv10>0;
  const trv=f.patternReadings.find((p:Json)=>p.name==='Three Rising Valleys'&&p.dir==='BUY');
  const flag=f.patternReadings.find((p:Json)=>p.name==='Bull Flag'&&p.dir==='BUY');
  // Strict Bull Flag is explicitly versioned: unlike the original policy it also requires breakout.
  const candidates=[{strategy:'TRV_CONFIRMED',approved:!!trv?.confirmed,pattern:'Three Rising Valleys'},
    {strategy:'BULL_FLAG_BREAKOUT',approved:!!flag?.confirmed&&f.breakout,pattern:'Bull Flag'}];
  let armed=previous.minimumArm;
  if(armed&&(t-armed.t>CONFIG.confirmationHours*CONFIG.intervalMs||last.c<armed.minimum||last.c>armed.price*1.03))armed=null;
  if(!armed&&f.minimumDistancePct!=null&&f.minimumDistancePct<=.5&&f.minimumDistancePct>=0){armed={t,minimum:f.minimum30,price:last.c};}
  const minimumApproved=!!armed&&ready&&f.aggression!=null&&f.aggression>=.55&&f.candleUp;
  candidates.push({strategy:'MIN30_FLOW',approved:minimumApproved,pattern:'Mínima 30D + fluxo comprador'});
  previous.minimumArm=armed;
  const signals=[];
  previous.lastSignal??={};
  for(const candidate of candidates){
    if(!candidate.approved)continue;
    const lastSignal=previous.lastSignal[candidate.strategy];
    if(lastSignal!=null&&t-lastSignal<CONFIG.cooldown*CONFIG.intervalMs)continue;
    signals.push({version:CONFIG.version,strategy:candidate.strategy,pattern:candidate.pattern,
      signalTime:t,closedAt:t+CONFIG.intervalMs,mode:CONFIG.mode,features:f,filters,
      context:{...context,minimumArm:armed},checklist:{pattern:true,breakout:f.breakout,
        volume:ready&&f.volumeRatio!>=1.2,obv:f.obv3>0&&f.obv10>0,notStretched:f.notStretched,
        buyerFlow:f.aggression==null?null:f.aggression>=.55}});
    previous.lastSignal[candidate.strategy]=t;
    if(candidate.strategy==='MIN30_FLOW')previous.minimumArm=null;
  }
  return {signals,state:previous,features:f};
}
// Deterministic preselected sample; the selection depends only on date, symbol and fixed seed.
export function baselineHour(symbol:string,day:string){let h=2166136261;for(const c of `ep-quality-baseline-v1|${symbol}|${day}`){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0)%24;}
export function createEvaluation(birth:Json):Json {
  return {id:birth.id,version:CONFIG.version,symbol:birth.symbol,strategy:birth.strategy,
    signalTime:birth.signalTime,entry:null,entryTime:null,lastCandleTime:birth.signalTime,
    observed:0,status:'PENDING',coverage:'COMPLETE',mfe:0,mae:0,finalReturnPct:null,
    cells:Object.fromEntries(CONFIG.objectives.flatMap(g=>CONFIG.targets.map(target=>
      [`${g.name}_target${target}`,{target,stop:g.stop,bars:g.bars,outcome:'PENDING',exitTime:null,grossPct:null}]))),
    exits:{},structuralStop:birth.features.structuralLow-.15*birth.features.atr,
    previousAtr:birth.features.atr};
}
export function touch(c:Candle,entry:number,target:number,stop:number){
  if(c.o<=stop)return{outcome:'STOP',grossPct:(c.o/entry-1)*100};
  if(c.o>=target)return{outcome:'TARGET',grossPct:(c.o/entry-1)*100};
  if(c.l<=stop&&c.h>=target)return{outcome:'AMBIGUOUS',grossPct:null};
  if(c.l<=stop)return{outcome:'STOP',grossPct:(stop/entry-1)*100};
  if(c.h>=target)return{outcome:'TARGET',grossPct:(target/entry-1)*100};
  return null;
}
function exitState(stop:number,target:number|null,bars:number,partial=false):Json {
  return {stop,target,bars,partial,status:'COLLECTING',remaining:1,fills:[],grossPct:null,peak:null};
}
function fill(x:Json,weight:number,price:number,entry:number,time:number){
  x.fills.push({weight,price,time,grossPct:(price/entry-1)*100});x.remaining=Math.max(0,x.remaining-weight);
}
function finish(x:Json,status:string){x.status=status;x.grossPct=status==='AMBIGUOUS'?null:x.fills.reduce((s:number,f:Json)=>s+f.weight*f.grossPct,0);}
function advanceExit(x:Json,c:Candle,entry:number,a:number|null,observed:number,ms:number){
  if(x.status!=='COLLECTING')return;
  const target=x.target==null?Infinity:entry*(1+x.target/100);
  if(x.partial){
    const levels=[['T5',5],['T10',10]] as const;
    if(c.o<=x.stop){fill(x,x.remaining,c.o,entry,c.t);finish(x,'STOP');return;}
    // Opening fills precede the unknown high/low sequence.
    for(const [key,pct] of levels)if(!x.fills.some((f:Json)=>f.partial===key)&&c.o>=entry*(1+pct/100)){
      fill(x,1/3,c.o,entry,c.t);x.fills.at(-1).partial=key;
    }
    const unfilled=levels.filter(([key])=>!x.fills.some((f:Json)=>f.partial===key));
    if(c.l<=x.stop&&unfilled.some(([,pct])=>c.h>=entry*(1+pct/100))){finish(x,'AMBIGUOUS');return;}
    if(c.l<=x.stop){fill(x,x.remaining,x.stop,entry,c.t+ms);finish(x,'STOP');return;}
    for(const [key,pct] of unfilled)if(c.h>=entry*(1+pct/100)){
      fill(x,1/3,entry*(1+pct/100),entry,c.t+ms);x.fills.at(-1).partial=key;
    }
  }else{
    const hit=touch(c,entry,target,x.stop);
    if(hit?.outcome==='AMBIGUOUS'){finish(x,'AMBIGUOUS');return;}
    if(hit?.outcome==='STOP'){fill(x,x.remaining,c.o<=x.stop?c.o:x.stop,entry,c.t+ms);finish(x,'STOP');return;}
    if(hit?.outcome==='TARGET'){fill(x,x.remaining,c.o>=target?c.o:target,entry,c.t+ms);finish(x,'TARGET');return;}
  }
  if(observed>=x.bars){fill(x,x.remaining,c.c,entry,c.t+ms);finish(x,'TIMEOUT');return;}
  // Stop from the previous candle is processed first. Only then ratchet at this close.
  if(x.target==null&&a!=null)x.stop=Math.max(x.stop,c.c-3*a);
}
export function advanceEvaluation(input:Json,c:Candle,currentAtr:number|null):Json {
  const e=structuredClone(input),ms=CONFIG.intervalMs;
  if(e.status==='COMPLETED'||e.status==='INVALID_DATA'||c.t<=e.lastCandleTime)return e;
  if(c.t!==e.lastCandleTime+ms)e.coverage='PARTIAL';
  if(e.entry==null){
    if(c.t!==e.signalTime+ms){e.status='INVALID_DATA';e.lastCandleTime=c.t;return e;}
    e.entry=c.o;e.entryTime=c.t;e.status='COLLECTING';
    e.exits={fixed10_3:exitState(c.o*.97,10,96),fixed20_5:exitState(c.o*.95,20,720),
      trailing3atr:exitState(c.o*.97,null,720),partials5_10_trailing:exitState(c.o*.97,null,720,true)};
    if(e.structuralStop>0&&e.structuralStop<c.o&&e.structuralStop>=c.o*.90)e.exits.structural20=exitState(e.structuralStop,20,720);
  }
  e.observed++;e.lastCandleTime=c.t;e.mfe=Math.max(e.mfe,(c.h/e.entry-1)*100);
  e.mae=Math.min(e.mae,(c.l/e.entry-1)*100);e.finalReturnPct=(c.c/e.entry-1)*100;
  const elapsed=Math.floor((c.t-e.entryTime)/ms)+1;
  for(const cell of Object.values(e.cells) as Json[]){
    if(cell.outcome!=='PENDING')continue;
    if(elapsed>cell.bars){cell.outcome='INCOMPLETE';continue;}
    const outcome=touch(c,e.entry,e.entry*(1+cell.target/100),e.entry*(1-cell.stop/100));
    if(outcome)Object.assign(cell,outcome,{exitTime:c.t+ms});
    else if(elapsed===cell.bars)Object.assign(cell,{outcome:'TIMEOUT',grossPct:e.finalReturnPct,exitTime:c.t+ms});
  }
  for(const x of Object.values(e.exits) as Json[])advanceExit(x,c,e.entry,currentAtr,elapsed,ms);
  e.previousAtr=currentAtr;
  if(elapsed>=CONFIG.horizon)e.status='COMPLETED';
  return e;
}
export function netReturn(fills:Json[],cost:Json|null){
  if(!cost||!['buyPct','sellPct','slippagePct','spreadPct'].every(k=>Number.isFinite(cost[k])&&cost[k]>=0&&cost[k]<100))return null;
  if(Math.abs(fills.reduce((s,f)=>s+f.weight,0)-1)>1e-8)return null;
  const extra=(cost.slippagePct+cost.spreadPct)/100;
  return 100*(fills.reduce((s,f)=>s+f.weight*(1+f.grossPct/100)*(1-cost.sellPct/100-extra),0)/(1+cost.buyPct/100+extra)-1);
}
export function rate(evaluations:Json[],cellKey:string){
  const mature=(e:Json)=>e.entryTime!=null&&e.lastCandleTime>=e.entryTime+(e.cells[cellKey].bars-1)*CONFIG.intervalMs;
  const eligible=evaluations.filter(e=>e.coverage==='COMPLETE'&&e.cells[cellKey]&&mature(e)&&['TARGET','STOP','TIMEOUT'].includes(e.cells[cellKey]?.outcome));
  const n=eligible.length,hits=eligible.filter(e=>e.cells[cellKey].outcome==='TARGET').length;
  return {n,hits,pct:n?hits/n*100:null,
    ambiguous:evaluations.filter(e=>e.cells[cellKey]?.outcome==='AMBIGUOUS').length,
    partial:evaluations.filter(e=>e.coverage!=='COMPLETE').length,
    pending:evaluations.filter(e=>e.cells[cellKey]&&(!mature(e)||e.cells[cellKey].outcome==='PENDING')).length};
}
