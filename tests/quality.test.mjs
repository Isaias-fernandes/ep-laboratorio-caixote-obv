import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {CONFIG,features,detect,baselineHour,createEvaluation,advanceEvaluation,touch,netReturn,rate} from '../quality/core.ts';
import {patterns} from '../quality/patterns.mjs';
import {parseJson} from '../automation/json-store.mjs';
const ms=CONFIG.intervalMs;
function bars(n=96){return Array.from({length:n},(_,i)=>({t:i*ms,o:100+Math.sin(i)*.2,h:101,l:99,c:100+Math.cos(i)*.2,v:100,q:10000,tq:6000}));}
function birth(t=95*ms){return{id:'test',symbol:'BTCUSDT',strategy:'TRV_CONFIRMED',signalTime:t,features:{atr:1,structuralLow:97}};}
function next(t,values={}){return {t,o:100,h:101,l:99,c:100,v:100,...values};}
test('pattern extraction matches original JavaScript outputs and pinned SHA-256',()=>{
  const source=fs.readFileSync(new URL('../quality/original/early-leg-motor-v1.js',import.meta.url),'utf8');
  const policy=fs.readFileSync(new URL('../quality/original/motor6-pattern-policy.js',import.meta.url),'utf8');
  const provenance=JSON.parse(fs.readFileSync(new URL('../quality/provenance.json',import.meta.url)));
  for(const [name,text] of [['early-leg-motor-v1.js',source],['motor6-pattern-policy.js',policy]])assert.equal(createHash('sha256').update(text).digest('hex'),provenance.files[name]);
  const context={window:{},Date,console};context.window.window=context.window;vm.createContext(context);vm.runInContext(policy,context);
  const fragment=source.slice(source.indexOf('function patterns(c){'),source.indexOf('\nfunction calc(x)'));
  vm.runInContext('const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;'+fragment+';this.originalPatterns=patterns',context);
  let confirmed=0;
  for(let seed=1;seed<=600;seed++){
    let r=seed,c=100;const rows=[];const random=()=>{r=(Math.imul(r,1664525)+1013904223)>>>0;return r/2**32;};
    for(let i=0;i<96;i++){const o=c;c=o*(1+(random()-.45)*.035);rows.push({t:i*ms,o,h:Math.max(o,c)*(1+random()*.005),l:Math.min(o,c)*(1-random()*.005),c,v:50+random()*200});}
    const a=patterns(rows),b=JSON.parse(JSON.stringify(context.originalPatterns(rows)));assert.deepEqual(a,b);confirmed+=a.filter(x=>x.confirmed).length;
  }assert.ok(confirmed>0,'Parity fixtures must exercise confirmations');
});
test('resistance excludes breakout candle and missing buyer flow remains unavailable',()=>{
  const rows=bars();rows.at(-1).c=103;rows.at(-1).h=104;const f=features(rows);
  assert.equal(f.resistance,101);assert.equal(f.breakout,true);assert.equal(f.aggression,.6);
  assert.equal(features(rows.map(({q,tq,...c})=>c)).aggression,null);
});
test('gap, invalid candle and insufficient warmup are rejected',()=>{
  assert.throws(()=>features(bars(30)));const rows=bars();rows[30].t+=ms;assert.throws(()=>features(rows));
  const other=bars();other[20].l=-1;assert.throws(()=>features(other));
});
test('baseline selection is reproducible and independent of price data',()=>{
  assert.equal(baselineHour('BTCUSDT','2026-11-07'),baselineHour('BTCUSDT','2026-11-07'));
  assert.ok(baselineHour('BTCUSDT','2026-11-07')>=0&&baselineHour('BTCUSDT','2026-11-07')<24);
});
test('minimum 30D requires 720 candles and aggression; arm survives until later confirmation',()=>{
  const short=detect(bars());assert.equal(short.features.minimum30,null);assert.ok(!short.signals.some(s=>s.strategy==='MIN30_FLOW'));
  const rows=bars(720);rows.at(-1).o=99.1;rows.at(-1).c=99.3;rows.at(-1).v=300;
  rows.at(-2).c=99.2;rows.at(-2).v=200;rows.at(-3).c=99.1;rows.at(-3).v=200;
  const d=detect(rows);assert.ok(d.signals.some(s=>s.strategy==='MIN30_FLOW'));assert.equal(d.signals.find(s=>s.strategy==='MIN30_FLOW').filters.NO_PRELEG_24H,null);
  const missing=detect(rows.map(({q,tq,...c})=>c));assert.ok(!missing.signals.some(s=>s.strategy==='MIN30_FLOW'));
});
test('entry uses next open and never reads signal-candle extremes',()=>{
  const e=createEvaluation(birth());assert.equal(e.entry,null);
  const a=advanceEvaluation(e,next(96*ms,{o:102,h:103,l:101,c:102}),1);assert.equal(a.entry,102);assert.equal(a.observed,1);
  assert.deepEqual(advanceEvaluation(a,next(96*ms,{h:999}),1),a);
});
test('missing entry candle invalidates instead of fabricating a later entry',()=>{
  const a=advanceEvaluation(createEvaluation(birth()),next(97*ms),1);assert.equal(a.status,'INVALID_DATA');assert.equal(a.entry,null);
});
test('target plus stop in one candle is ambiguous; opening gap has known precedence',()=>{
  assert.equal(touch(next(0,{h:111,l:96}),100,110,97).outcome,'AMBIGUOUS');
  assert.deepEqual(touch(next(0,{o:95,h:111,l:94}),100,110,97),{outcome:'STOP',grossPct:(.95-1)*100});
});
test('target remains locked when a later candle hits stop, observation continues',()=>{
  let e=advanceEvaluation(createEvaluation(birth()),next(96*ms,{h:111,l:99}),1);
  assert.equal(e.cells['96h_stop3_target10'].outcome,'TARGET');
  e=advanceEvaluation(e,next(97*ms,{l:95}),1);assert.equal(e.cells['96h_stop3_target10'].outcome,'TARGET');assert.equal(e.observed,2);
});
test('partial cohorts are excluded and immature resolved targets do not inflate hit rate',()=>{
  let e=advanceEvaluation(createEvaluation(birth()),next(96*ms,{h:111,l:99}),1);
  assert.equal(rate([e],'96h_stop3_target10').n,0);
  for(let i=97;i<192;i++)e=advanceEvaluation(e,next(i*ms),1);
  assert.equal(rate([e],'96h_stop3_target10').pct,100);
  e=advanceEvaluation(e,next(194*ms),1);assert.equal(rate([e],'96h_stop3_target10').n,0);
});
test('trailing stop is not raised retroactively inside a candle',()=>{
  let e=advanceEvaluation(createEvaluation(birth()),next(96*ms,{h:115,l:98,c:110}),1);
  assert.equal(e.exits.trailing3atr.status,'COLLECTING');assert.equal(e.exits.trailing3atr.stop,107);
  e=advanceEvaluation(e,next(97*ms,{o:105,h:108,l:104,c:106}),1);
  assert.equal(e.exits.trailing3atr.status,'STOP');assert.equal(e.exits.trailing3atr.fills[0].price,105);
});
test('partial exit weights are applied to the whole initial position',()=>{
  const fills=[{weight:1/3,grossPct:5},{weight:1/3,grossPct:10},{weight:1/3,grossPct:50}];
  assert.ok(Math.abs(netReturn(fills,{buyPct:0,sellPct:0,slippagePct:0,spreadPct:0})-65/3)<1e-10);
  assert.equal(netReturn(fills,null),null);assert.ok(netReturn(fills,CONFIG.fees.binanceReference)<65/3);
});
test('96h and 30d windows close independently and use explicit stop definitions',()=>{
  let e=createEvaluation(birth());for(let i=96;i<816;i++)e=advanceEvaluation(e,next(i*ms),1);
  assert.equal(e.status,'COMPLETED');assert.equal(e.observed,720);
  assert.equal(e.cells['96h_stop3_target50'].outcome,'TIMEOUT');assert.equal(e.cells['30d_stop10_target50'].outcome,'TIMEOUT');
});
test('legacy literal-newline suffix is recovered; arbitrary corruption is rejected',()=>{
  assert.deepEqual(parseJson('{"records":[1]}\\n'),{records:[1]});assert.throws(()=>parseJson('{invalid'));
});
