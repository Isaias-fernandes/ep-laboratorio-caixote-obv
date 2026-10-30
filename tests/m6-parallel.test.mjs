import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReading,compareReading,advancePair,newStore,commitPair,statsView,CONFIG} from '../m6-parallel-core.mjs';
import {analyze} from '../lab-signal-engine.mjs';
const ms=300000;
const technical={rsi:60,cci:110,macd:{histogram:1},volumeRatio:1.5,obv:{trend:'SUBINDO'}};
const preferred={name:'Three Rising Valleys',direction:'BUY',score:90,breakout:true,retest:false,level:100};
const reading=(t,b=true,c=true)=>({candleTime:t,closedAt:t+ms,
  baseline:{approved:b,score:90,pattern:'Controle'},candidate:{approved:c,score:90,pattern:'Three Rising Valleys'}});
const candle=(t,o=100,h=101,l=99,c=100)=>({t,o,h,l,c,v:100});
const tick=(pair,t,b=true,c=true,bar=candle(t))=>advancePair(pair,'BTCUSDT','5m',reading(t,b,c),bar,ms,new Date(t+ms).toISOString());
function finish(pair,from=ms,barFn=t=>candle(t)){
  let completed=null;for(let t=from;t<=120*ms;t+=ms){const next=tick(pair,t,false,false,barFn(t));pair=next.pair;if(next.completed){completed=next.completed;break;}}
  return{pair,completed};
}
test('candidate validates structure and refuses formation, weak volume, falling OBV and stretched RSI',()=>{
  assert.equal(candidateReading(technical,[preferred],1).approved,true);
  for(const [tech,pattern,move] of [
    [technical,{...preferred,breakout:false},1],
    [{...technical,volumeRatio:1.19},preferred,1],
    [{...technical,obv:{trend:'CAINDO'}},preferred,1],
    [{...technical,rsi:74},preferred,1],
    [technical,preferred,5],
    [technical,{...preferred,name:'Rectangle / Trading Range'},1],
    [{...technical,cci:-1},preferred,1],
  ]){const r=candidateReading(tech,[pattern],move);assert.equal(r.approved,false);assert.ok(r.score<80);}
});
test('original score is unchanged, and an open candle cannot leak into the parallel reading',()=>{
  const bars=Array.from({length:97},(_,i)=>candle(i*ms,100+i*.01,101+i*.01,99+i*.01,100.1+i*.01));
  bars[96]=candle(96*ms,101,150,100,149);
  const before=JSON.stringify(bars),r=compareReading(bars,ms,96*ms),base=analyze(bars.slice(0,96));
  assert.equal(r.candleTime,95*ms);assert.equal(r.baseline.score,base.score);
  assert.equal(r.baseline.approved,base.classification==='SINAL_COMPRA');assert.equal(JSON.stringify(bars),before);
  assert.throws(()=>compareReading(bars.filter((_,i)=>i!==30),ms,97*ms),/consecutivas/);
});
test('entry is next open, signal candle extremes are excluded, and retries do not count twice',()=>{
  let {pair}=tick(null,0,true,true,candle(0,100,200,1));assert.equal(pair.episode.baseline.entry,null);
  ({pair}=tick(pair,ms,true,true,candle(ms,110,111,109,110)));
  assert.equal(pair.episode.baseline.entry,110);assert.equal(pair.episode.baseline.observed,1);
  const duplicate=tick(pair,ms,true,true,candle(ms,110,200,1));
  assert.deepEqual(duplicate.pair,pair);assert.equal(pair.episode.baseline.outcome,null);
});
test('the two versions can trigger at different times but share one episode identity',()=>{
  let {pair}=tick(null,0,true,false);const id=pair.episode.id;
  ({pair}=tick(pair,ms,false,true));assert.equal(pair.episode.id,id);
  assert.equal(pair.episode.baseline.entry,100);assert.equal(pair.episode.candidate.entry,null);
  ({pair}=tick(pair,2*ms,true,true,candle(2*ms,102,103,101,102)));
  assert.equal(pair.episode.candidate.entry,102);assert.equal(pair.episode.baseline.observed,2);
  assert.equal(pair.episode.candidate.observed,1);
});
test('same-candle target and stop remains ambiguous, excluded from resolved metrics',()=>{
  let {pair}=tick(null,0);({pair}=tick(pair,ms,false,false,candle(ms,100,106,96)));
  assert.equal(pair.episode.baseline.outcome,'AMBIGUOUS');assert.equal(pair.episode.baseline.netPct,null);
  const done=finish(pair,2*ms).completed;assert.ok(done);
  const store=newStore();commitPair(store,'BTCUSDT|5m',null,[done]);
  assert.equal(store.stats.baseline.ambiguous,1);assert.equal(statsView(store.stats).baseline.netMeanPct,null);
  assert.equal(statsView(store.stats).baseline.targetFirstPct,null);
});
test('target before later stop locks result while full 96-candle price excursions continue',()=>{
  let {pair}=tick(null,0);({pair}=tick(pair,ms,false,false,candle(ms,100,106,99)));
  ({pair}=tick(pair,2*ms,false,false,candle(2*ms,100,101,90)));
  const done=finish(pair,3*ms).completed;
  assert.equal(done.baseline.outcome,'TARGET');assert.equal(done.baseline.netPct,4.8);
  assert.equal(done.baseline.observed,96);assert.ok(done.baseline.mae< -9.9);
});
test('opening gap beyond stop uses opening price and takes precedence over later high',()=>{
  let {pair}=tick(null,0);({pair}=tick(pair,ms,false,false));
  ({pair}=tick(pair,2*ms,false,false,candle(2*ms,95,106,94,100)));
  assert.equal(pair.episode.baseline.outcome,'STOP');assert.ok(Math.abs(pair.episode.baseline.netPct+5.2)<1e-9);
});
test('late second-arm trigger does not join after entry window; no repeated overlapping episode',()=>{
  let {pair}=tick(null,0,true,false);const id=pair.episode.id;
  for(let i=1;i<=95;i++)({pair}=tick(pair,i*ms,true,i>CONFIG.entryWindow));
  assert.equal(pair.episode.id,id);assert.equal(pair.episode.candidate,null);
  const {pair:closed,completed}=tick(pair,96*ms,true,true);assert.ok(completed);assert.equal(closed.episode,null);
  const next=tick(closed,97*ms,true,true);assert.equal(next.pair.episode,null);
});
test('gaps invalidate episode coverage instead of inventing a next-open entry',()=>{
  let {pair}=tick(null,0);({pair}=tick(pair,2*ms,false,false));
  assert.equal(pair.episode.coverage,'PARTIAL');assert.equal(pair.episode.baseline.entry,null);
  const done=finish(pair,3*ms).completed;const store=newStore();commitPair(store,'BTCUSDT|5m',null,[done]);
  assert.equal(store.stats.baseline.partial,1);assert.equal(store.stats.baseline.resolved,0);
});
test('timeouts use closing return less costs; summary remains separate by interval and deduplicated',()=>{
  let {pair}=tick(null,0,true,false);const done=finish(pair,ms,t=>candle(t,100,102,99,101)).completed;
  assert.equal(done.baseline.outcome,'TIMEOUT');assert.ok(Math.abs(done.baseline.netPct-.8)<1e-9);
  const store=newStore();commitPair(store,'BTCUSDT|5m',null,[done]);commitPair(store,'BTCUSDT|5m',null,[done]);
  assert.equal(store.stats.completedEpisodes,1);assert.equal(store.statsByInterval['5m'].baseline.signals,1);
  assert.equal(store.statsByInterval['1h'],undefined);
  assert.equal(store.stats.candidate.signals,0);
});
test('candidate activation after baseline gives its own full follow-up, not a truncated horizon',()=>{
  let {pair}=tick(null,0,true,false);
  for(let i=1;i<=24;i++)({pair}=tick(pair,i*ms,false,i===24));
  const done=finish(pair,25*ms).completed;
  assert.ok(done);assert.equal(done.baseline.observed,96);assert.equal(done.candidate.observed,96);
  assert.equal(done.candidate.entryTime,25*ms);
});
