import {analyze, closedCandles, contiguous} from './lab-signal-engine.mjs';
import * as structuralModule from './structural-pattern-detectors-v1.js';

const detector=structuralModule.default || globalThis.EPStructuralPatternDetectors;
export const VERSION='m6-estrutura-confirmada-v1';
export const CONFIG=Object.freeze({version:VERSION,context:96,horizon:96,entryWindow:24,
  targetPct:5,stopPct:3,costPct:0.20,quietBars:3,minimumScore:80,
  patterns:['Three Rising Valleys','Bull Pennant'],direction:'BUY',
  maxRsi:74,maxMove6Pct:5});

// Pure calculation: receives the candles that the existing collector already loaded.
export function candidateReading(technical,patterns,move6Pct){
  const preferred=patterns.filter(p=>p.direction==='BUY'&&CONFIG.patterns.includes(p.name));
  const pattern=preferred.slice().sort((a,b)=>Number(b.breakout)-Number(a.breakout)||b.score-a.score)[0];
  const momentum=technical.rsi>=50&&technical.cci>0&&technical.macd.histogram>0;
  const obv=technical.obv.trend==='SUBINDO';
  const volume=technical.volumeRatio>=1.2;
  const stretched=technical.rsi>=CONFIG.maxRsi||move6Pct>=CONFIG.maxMove6Pct;
  const parts={base:pattern?50:0,pattern:pattern?(pattern.name==='Bull Pennant'?20:16):0,
    momentum:momentum?10:0,volume:technical.volumeRatio>=2?12:technical.volumeRatio>=1.5?8:volume?4:0,
    obv:obv?8:0,retest:pattern?.retest?4:0};
  const gates={pattern:!!pattern,breakout:!!pattern?.breakout,momentum,volume,obv,antiStretch:!stretched};
  let score=pattern?Math.min(100,Object.values(parts).reduce((a,b)=>a+b,0)):0;
  if(!Object.values(gates).every(Boolean))score=Math.min(score,79);
  return{score,approved:score>=CONFIG.minimumScore&&Object.values(gates).every(Boolean),
    pattern:pattern?.name||null,stage:!pattern?'OBSERVAÇÃO':!pattern.breakout?'FORMAÇÃO':pattern.retest?'RETESTE':'ROMPIMENTO',
    level:pattern?.level??null,parts,gates,rsi:technical.rsi,move6Pct,volumeRatio:technical.volumeRatio,obv:technical.obv.trend};
}

export function compareReading(rows,intervalMs,now){
  const c=closedCandles(rows,intervalMs,now).slice(-96);
  if(c.length!==96||!contiguous(c,intervalMs))throw Error('M6 paralelo exige 96 velas consecutivas fechadas');
  const technical=analyze(c),patterns=detector.detect(c);
  return{version:VERSION,candleTime:c.at(-1).t,closedAt:c.at(-1).t+intervalMs,price:c.at(-1).c,
    baseline:{approved:technical.classification==='SINAL_COMPRA',score:technical.score,pattern:technical.pattern.name,direction:technical.pattern.direction},
    candidate:candidateReading(technical,patterns,(c.at(-1).c/c.at(-7).c-1)*100)};
}

export function newStats(){return{completedEpisodes:0,partialEpisodes:0,
  baseline:emptyArmStats(),candidate:emptyArmStats()};}
function emptyArmStats(){return{signals:0,targets:0,stops:0,timeouts:0,ambiguous:0,partial:0,
  resolved:0,netSum:0,mfeSum:0,maeSum:0,returnSum:0,positive:0};}
export function newStore(){return{version:VERSION,config:CONFIG,generatedAt:null,state:{},episodes:[],stats:newStats(),statsByInterval:{}};}

function pendingArm(reading,t){return{signalTime:t,score:reading.score,pattern:reading.pattern,
  entry:null,entryTime:null,observed:0,status:'PENDING',outcome:null,netPct:null,
  mfe:0,mae:0,finalReturnPct:null,targetFirst:null,targetHours:null,lastCandleTime:t};}

function settle(arm,outcome,gross,t){
  arm.outcome=outcome;arm.exitTime=t;arm.netPct=gross==null?null:gross-CONFIG.costPct;
  arm.targetFirst=outcome==='TARGET'?true:outcome==='STOP'?false:null;
  if(outcome==='TARGET')arm.targetHours=(t-arm.entryTime)/3600000;
}

function trackArm(arm,candle,ms){
  if(arm.status==='COMPLETED'||candle.t<=arm.lastCandleTime)return;
  if(arm.entry==null){
    if(candle.t!==arm.signalTime+ms){arm.coverage='PARTIAL';arm.status='COMPLETED';return;}
    arm.entry=candle.o;arm.entryTime=candle.t;arm.status='COLLECTING';
  }else if(candle.t!==arm.lastCandleTime+ms)arm.coverage='PARTIAL';
  const entry=arm.entry,target=entry*(1+CONFIG.targetPct/100),stop=entry*(1-CONFIG.stopPct/100);
  arm.observed++;arm.lastCandleTime=candle.t;
  arm.mfe=Math.max(arm.mfe,(candle.h/entry-1)*100);
  arm.mae=Math.min(arm.mae,(candle.l/entry-1)*100);
  arm.finalReturnPct=(candle.c/entry-1)*100;
  if(!arm.outcome){
    // An opening gap has a known order. Inside a candle, high/low order is unknown.
    if(candle.o<=stop)settle(arm,'STOP',(candle.o/entry-1)*100,candle.t);
    else if(candle.o>=target)settle(arm,'TARGET',(candle.o/entry-1)*100,candle.t);
    else if(candle.h>=target&&candle.l<=stop)settle(arm,'AMBIGUOUS',null,candle.t+ms);
    else if(candle.l<=stop)settle(arm,'STOP',-CONFIG.stopPct,candle.t+ms);
    else if(candle.h>=target)settle(arm,'TARGET',CONFIG.targetPct,candle.t+ms);
  }
  if(arm.observed>=CONFIG.horizon){
    if(!arm.outcome)settle(arm,'TIMEOUT',arm.finalReturnPct,candle.t+ms);
    arm.status='COMPLETED';
  }
}

function addCompleted(stats,ep){
  stats.completedEpisodes++;
  if(ep.coverage==='PARTIAL')stats.partialEpisodes++;
  for(const name of ['baseline','candidate']){
    const a=ep[name],s=stats[name];if(!a)continue;s.signals++;
    if(ep.coverage==='PARTIAL'||a.coverage==='PARTIAL'){s.partial++;continue;}
    s.mfeSum+=a.mfe;s.maeSum+=a.mae;s.returnSum+=a.finalReturnPct;
    if(a.outcome==='AMBIGUOUS'){s.ambiguous++;continue;}
    if(a.outcome==='TARGET')s.targets++;
    if(a.outcome==='STOP')s.stops++;
    if(a.outcome==='TIMEOUT')s.timeouts++;
    if(Number.isFinite(a.netPct)){s.resolved++;s.netSum+=a.netPct;if(a.netPct>0)s.positive++;}
  }
}

// One episode per asset/interval; the two arms may enter at different times within
// the first 24 candles. Each arm receives its own complete 96-candle follow-up.
export function advancePair(input,symbol,interval,reading,candle,ms,detectedAt){
  const pair=structuredClone(input||{lastCandleTime:null,quiet:0,armed:true,episode:null});
  if(pair.lastCandleTime!=null&&candle.t<=pair.lastCandleTime)return{pair,completed:null};
  const hadGap=pair.lastCandleTime!=null&&candle.t!==pair.lastCandleTime+ms;
  const any=reading.baseline.approved||reading.candidate.approved;
  pair.quiet=any?0:(hadGap?1:pair.quiet+1);
  let ep=pair.episode,completed=null;
  if(ep){
    if(hadGap)ep.coverage='PARTIAL';
    for(const name of ['baseline','candidate'])if(ep[name])trackArm(ep[name],candle,ms);
    const within=candle.t<=ep.startTime+CONFIG.entryWindow*ms;
    if(within&&!hadGap){for(const name of ['baseline','candidate']){
      if(!ep[name]&&reading[name].approved)ep[name]=pendingArm(reading[name],candle.t);
    }}
    if(!within&&['baseline','candidate'].every(name=>!ep[name]||ep[name].status==='COMPLETED')){
      ep.status='COMPLETED';ep.completedAt=detectedAt;completed=ep;pair.episode=null;
      if(pair.quiet>=CONFIG.quietBars)pair.armed=true;
    }
  }else{
    if(pair.quiet>=CONFIG.quietBars)pair.armed=true;
    if(pair.armed&&any){
      ep={id:`${VERSION}|${symbol}|${interval}|${candle.t}`,version:VERSION,symbol,interval,
        startTime:candle.t,createdAt:detectedAt,retroactive:Date.parse(detectedAt)-reading.closedAt>ms*2,
        status:'COLLECTING',coverage:'COMPLETE',baseline:null,candidate:null};
      for(const name of ['baseline','candidate'])if(reading[name].approved)ep[name]=pendingArm(reading[name],candle.t);
      pair.episode=ep;pair.armed=false;
    }
  }
  pair.lastCandleTime=candle.t;pair.reading=reading;pair.observedAt=detectedAt;
  return{pair,completed};
}

export function commitPair(store,key,pair,completed){
  store.state[key]=pair;
  for(const ep of completed){
    if(store.episodes.some(e=>e.id===ep.id))continue;
    store.episodes.push(ep);addCompleted(store.stats,ep);
    store.statsByInterval[ep.interval]??=newStats();addCompleted(store.statsByInterval[ep.interval],ep);
  }
  // Permanent completed records are also archived by the collector before pruning.
}

export function statsView(stats){
  return Object.fromEntries(['baseline','candidate'].map(name=>{const s=stats[name],full=s.signals-s.partial;
    return[name,{...s,targetFirstPct:s.resolved?s.targets/s.resolved*100:null,
      netMeanPct:s.resolved?s.netSum/s.resolved:null,
      mfeMeanPct:full?s.mfeSum/full:null,maeMeanPct:full?s.maeSum/full:null,
      finalReturnMeanPct:full?s.returnSum/full:null,positivePct:s.resolved?s.positive/s.resolved*100:null}];}));
}
