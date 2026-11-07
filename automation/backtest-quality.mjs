// Offline replay: node automation/backtest-quality.mjs INPUT.json OUTPUT.json
// Input: {symbols:{BTCUSDT:[{t,o,h,l,c,v,q,tq},...]}}; no network or inferred future data.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CONFIG,detect,baselineHour,createEvaluation,advanceEvaluation} from '../quality/core.ts';
import {buildSummary} from './quality-collector.mjs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Informe o arquivo de candles e o arquivo de resultado');
const raw=fs.readFileSync(input),dataset=JSON.parse(raw),births=[],evaluations=[],sourceHashes=JSON.parse(fs.readFileSync(new URL('../quality/provenance.json',import.meta.url)));
for(const [symbol,rows] of Object.entries(dataset.symbols||{})){
  let detector={},active=[];
  for(let i=95;i<rows.length;i++){
    const c=rows[i],history=rows.slice(Math.max(0,i-719),i+1),r=detect(history,detector);detector=r.state;
    active=active.map(e=>advanceEvaluation(e,c,r.features.atr));
    for(const e of active)if(['COMPLETED','INVALID_DATA'].includes(e.status))evaluations.push(e);
    active=active.filter(e=>!['COMPLETED','INVALID_DATA'].includes(e.status));
    const day=new Date(c.t).toISOString().slice(0,10),hour=new Date(c.t).getUTCHours(),signals=[...r.signals];
    if(hour===baselineHour(symbol,day))signals.push({strategy:'BASELINE',signalTime:c.t,features:r.features,filters:{BOLLINGER:r.features.notStretched,NO_PRELEG_24H:null}});
    for(const s of signals){const b={...s,id:`${CONFIG.version}|${symbol}|${s.strategy}|${c.t}`,symbol,version:CONFIG.version,retroactive:false};births.push(b);active.push(createEvaluation(b));}
  }
  evaluations.push(...active);
}
// Split by calendar time with a purge equal to the full forward-label window.
const times=births.map(b=>b.signalTime).sort((a,b)=>a-b),split=times.length?times[Math.floor(times.length*.7)]:null;
const trainBirths=births.filter(b=>b.signalTime+CONFIG.horizon*CONFIG.intervalMs<split),testBirths=births.filter(b=>b.signalTime>=split);
const summary=(b)=>{const ids=new Set(b.map(x=>x.id));return buildSummary(b,evaluations.filter(e=>ids.has(e.id)));};
fs.writeFileSync(output,JSON.stringify({version:CONFIG.version,config:CONFIG,inputSha256:createHash('sha256').update(raw).digest('hex'),sourceHashes,splitTime:split,purgeHours:CONFIG.horizon,
  warning:'Descriptive replay only. Parameters must be fixed before inspecting holdout; correlated trades require cluster-aware inference.',
  train:summary(trainBirths),holdout:summary(testBirths),all:summary(births),births,evaluations},null,2)+'\n');
console.log(JSON.stringify({births:births.length,evaluations:evaluations.length,output}));
