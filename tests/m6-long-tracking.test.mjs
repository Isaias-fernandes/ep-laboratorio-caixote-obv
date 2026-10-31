import test from 'node:test';
import assert from 'node:assert/strict';
import {updateLong} from '../m6-long-tracking.mjs';
const ms=3600000,entryTime=ms;
const make=()=>({episodes:[{id:'test',symbol:'BTCUSDT',interval:'1h',candidate:{entry:100,entryTime,outcome:'STOP',netPct:-3.2}}],state:{}});
const bars=Array.from({length:240},(_,i)=>({t:entryTime+i*ms,o:100,h:106,l:96,c:102}));
test('ten-day milestones survive exit and duplicate collection; trade stays frozen',()=>{
 const s=make();const before=JSON.stringify(s.episodes);
 updateLong(s,'BTCUSDT','1h',bars,ms);const t=s.longTracking['test|candidate'];
 assert.equal(t.status,'COMPLETED');assert.equal(t.coverage,'COMPLETE');
 assert.equal(Object.keys(t.checkpoints).length,9);assert.ok(Math.abs(t.checkpoints[240].returnPct-2)<1e-8);
 assert.equal(t.targets[5].hours,1);assert.equal(t.targets[10],undefined);
 assert.equal(JSON.stringify(s.episodes),before);const saved=JSON.stringify(t);
 updateLong(s,'BTCUSDT','1h',bars,ms);assert.equal(JSON.stringify(t),saved);
});
test('missing candles mark coverage and missing milestone instead of inventing price',()=>{
 const s=make();updateLong(s,'BTCUSDT','1h',bars.slice(2),ms);
 const t=s.longTracking['test|candidate'];assert.equal(t.coverage,'PARTIAL');
 assert.equal(t.checkpoints[1].coverage,'MISSING');assert.equal(t.checkpoints[1].returnPct,null);
 assert.equal(t.checkpoints[240].coverage,'PARTIAL');
});
test('overlapping windows resume without duplicating checkpoints',()=>{
 const s=make();updateLong(s,'BTCUSDT','1h',bars.slice(0,12),ms);
 updateLong(s,'BTCUSDT','1h',bars.slice(6),ms);
 const t=s.longTracking['test|candidate'];assert.equal(t.coverage,'COMPLETE');assert.equal(t.status,'COMPLETED');
});
