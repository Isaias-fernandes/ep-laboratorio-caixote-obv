import {SYMBOLS,UNIVERSE_VERSION,ADDED_AT} from '../market-universe.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CONFIG,features,detect,baselineHour,createEvaluation,advanceEvaluation,rate} from '../quality/core.ts';
import {readJson,writeJson} from './json-store.mjs';
const DIR='data/quality';
export function loadQuality(){
  const s=readJson(`${DIR}/state.json`,{version:CONFIG.version,pairs:{},active:{},newBirths:[],completed:[]});
  if(s.version!==CONFIG.version)throw Error('Migração explícita de regras necessária; histórico preservado');
  s.newBirths=[];s.completed=[];return s;
}
export function qualityLimit(store,symbol,base){
  return Math.min(1000,Math.max(base,(store?.pairs[symbol]?.cache?.length||0)<720?724:base));
}
function hash(birth){return createHash('sha256').update(JSON.stringify(birth)).digest('hex')}
export function collectQuality(store,symbol,rows,observedAt,context={}){
  const original=store.pairs[symbol]||{lastCandle:null,detector:{},cache:[]};
  if(original.lastCandle!=null&&rows.at(-1).t<=original.lastCandle)return;
  const pair=structuredClone(original),active=Object.fromEntries(Object.entries(store.active).filter(([,e])=>e.symbol===symbol).map(([id,e])=>[id,structuredClone(e)]));
  const merged=[...new Map([...pair.cache,...rows].map(c=>[c.t,c])).values()].sort((a,b)=>a.t-b.t);
  const first=pair.lastCandle==null?merged.length-1:merged.findIndex(c=>c.t>pair.lastCandle);
  if(first<0)return;
  if(pair.lastCandle!=null&&merged[first].t!==pair.lastCandle+CONFIG.intervalMs)throw Error('Lacuna da qualidade: checkpoint preservado');
  const births=[],completed=[];
  for(let i=first;i<merged.length;i++){
    const history=merged.slice(Math.max(0,i-719),i+1),c=merged[i];
    if(history.length<96)throw Error('Contexto de qualidade menor que 96 candles');
    const reading=detect(history,pair.detector,context);pair.detector=reading.state;
    // Every observation runs before births at this candle. Signal-close prices never enter their own outcome.
    for(const [id,e] of Object.entries(active)){
      const next=advanceEvaluation(e,c,reading.features.atr);active[id]=next;
      if(['COMPLETED','INVALID_DATA'].includes(next.status)){completed.push(next);delete active[id];}
    }
    const day=new Date(c.t).toISOString().slice(0,10),hour=new Date(c.t).getUTCHours();
    const signals=[...reading.signals];
    if(hour===baselineHour(symbol,day))signals.push({version:CONFIG.version,strategy:'BASELINE',pattern:'Referência amostrada',signalTime:c.t,closedAt:c.t+CONFIG.intervalMs,features:reading.features,mode:'SHADOW',filters:{BOLLINGER:reading.features.notStretched,NO_PRELEG_24H:null},context:{}});
    for(const s of signals){
      const id=`${CONFIG.version}|${symbol}|${s.strategy}|${c.t}`;
      const birth={...s,id,symbol,interval:'1h',direction:'BUY',detectedAt:observedAt,
        universeVersion:UNIVERSE_VERSION,
        retroactive:Date.parse(observedAt)-s.closedAt>2*CONFIG.intervalMs||(ADDED_AT[symbol]!=null&&s.closedAt<Date.parse(ADDED_AT[symbol])),
        source:'Binance Spot H1',referenceEntry:'NEXT_CANDLE_OPEN',
        // Freeze only what was available at signal close; later outcomes live in a separate record.
        features:{...s.features,patternReadings:s.features.patternReadings.filter(p=>['Three Rising Valleys','Bull Flag'].includes(p.name))}};
      const record={...birth,birthHash:hash(birth)};
      births.push(record);active[id]=createEvaluation(record);
    }
    pair.lastCandle=c.t;pair.reading={features:reading.features,observedAt};
  }
  pair.cache=merged.slice(-720);
  // Transactional per-symbol commit only after all recovered bars have been checked.
  store.pairs[symbol]=pair;
  for(const [id,e] of Object.entries(store.active))if(e.symbol===symbol)delete store.active[id];
  Object.assign(store.active,active);store.newBirths.push(...births);store.completed.push(...completed);
}
function archiveBirths(births){
  const groups=new Map();for(const b of births){const day=new Date(b.signalTime).toISOString().slice(0,10);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(b);}
  for(const [day,list] of groups){
    const file=`${DIR}/births/${day}.json`,old=readJson(file,{version:CONFIG.version,records:[]}),map=new Map(old.records.map(b=>[b.id,b]));
    for(const b of list){if(map.has(b.id)&&map.get(b.id).birthHash!==b.birthHash)throw Error('Nascimento imutável em conflito: '+b.id);if(!map.has(b.id))map.set(b.id,b);}
    writeJson(file,{version:CONFIG.version,records:[...map.values()]});
  }
}
function completedRecords(){
  const dir=`${DIR}/outcomes`;if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(f=>f.endsWith('.json')).flatMap(f=>readJson(`${dir}/${f}`,{records:[]}).records);
}
function archiveCompleted(records){
  const groups=new Map();for(const e of records){const day=new Date(e.signalTime).toISOString().slice(0,10);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(e);}
  for(const [day,list] of groups){const file=`${DIR}/outcomes/${day}.json`,old=readJson(file,{records:[]}),map=new Map(old.records.map(e=>[e.id,e]));for(const e of list)map.set(e.id,e);writeJson(file,{version:CONFIG.version,records:[...map.values()]});}
}
export function buildSummary(births,evaluations){
  const born=new Map(births.map(b=>[b.id,b]));
  const all=evaluations.filter(e=>born.has(e.id)&&!born.get(e.id).retroactive);
  return ['TRV_CONFIRMED','BULL_FLAG_BREAKOUT','MIN30_FLOW'].flatMap(strategy=>CONFIG.experiments.map(arm=>{
    const chosen=all.filter(e=>e.strategy===strategy&&(arm==='BASE'||born.get(e.id).filters[arm]===true));
    // Controls matched on asset, UTC month and six-hour time bucket. This is descriptive, not proof of independence.
    const stratum=b=>`${b.symbol}|${new Date(b.signalTime).toISOString().slice(0,7)}|${Math.floor(new Date(b.signalTime).getUTCHours()/6)}`;
    const bucket=new Map();for(const e of all.filter(e=>e.strategy==='BASELINE')){const key=stratum(born.get(e.id));if(!bucket.has(key))bucket.set(key,[]);bucket.get(key).push(e);}
    const cells=Object.fromEntries(CONFIG.objectives.flatMap(g=>CONFIG.targets.map(target=>{
      const key=`${g.name}_target${target}`,signal=rate(chosen,key);
      let weighted=0,weight=0,matchedSignals=0,matchedHits=0;
      for(const e of chosen){if(!rate([e],key).n)continue;const controls=rate(bucket.get(stratum(born.get(e.id)))||[],key);if(controls.n){weighted+=controls.pct;weight++;matchedSignals++;if(e.cells[key].outcome==='TARGET')matchedHits++;}}
      const baselinePct=weight?weighted/weight:null,matchedSignalPct=matchedSignals?100*matchedHits/matchedSignals:null;
      return[key,{...signal,baselinePct,matchedSignals,matchedSignalPct,lift:baselinePct>0?matchedSignalPct/baselinePct:null}];
    })));
    return{strategy,arm,total:chosen.length,unknownFilter:arm==='BASE'?0:all.filter(e=>e.strategy===strategy&&born.get(e.id).filters[arm]==null).length,cells};
  }));
}
export function saveQuality(store,errors,at){
  archiveBirths(store.newBirths);archiveCompleted(store.completed);
  const birthsDir=`${DIR}/births`,births=fs.existsSync(birthsDir)?fs.readdirSync(birthsDir).filter(f=>f.endsWith('.json')).flatMap(f=>readJson(`${birthsDir}/${f}`,{records:[]}).records):[];
  const evaluations=[...completedRecords(),...Object.values(store.active)];
  const pairs=Object.entries(store.pairs).filter(([symbol])=>SYMBOLS.includes(symbol)).map(([symbol,p])=>({symbol,lastCandle:p.lastCandle,observedAt:p.reading?.observedAt,history:p.cache.length,flowAvailable:p.reading?.features.flowAvailable}));
  const stale=pairs.filter(p=>Date.parse(at)-(p.lastCandle+CONFIG.intervalMs)>2*CONFIG.intervalMs);
  const health={at,universeVersion:UNIVERSE_VERSION,ok:errors.length===0&&stale.length===0&&pairs.length===SYMBOLS.length,expected:SYMBOLS.length,available:pairs.length,stale:stale.map(p=>p.symbol),errors,pairs};
  const birthMap=new Map(births.map(b=>[b.id,b])),view=evaluations.filter(e=>e.strategy!=='BASELINE').sort((a,b)=>b.signalTime-a.signalTime).slice(0,100).map(e=>({birth:birthMap.get(e.id),evaluation:e}));
  writeJson(`${DIR}/summary.json`,{version:CONFIG.version,mode:CONFIG.mode,at,health,config:CONFIG,stats:buildSummary(births,evaluations),signals:view,
    notices:['Validação prospectiva: ainda não há probabilidade aprovada.','Resultados sobrepostos e controles reutilizados não são amostras independentes.','Sem integração de pré-pernada com cobertura comprovada, esse filtro fica indisponível.']});
  store.newBirths=[];store.completed=[];store.health=health;writeJson(`${DIR}/state.json`,store);
  return health;
}
