import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchClosedCandles} from '../automation/market-candles.mjs';
const ms=3600000,now=1000*ms+10000;
function rows(stale=false){return Array.from({length:100},(_,i)=>[(900+i-(stale?1:0))*ms,100,101,99,100,100,0,10000,0,55,5500]);}
test('a successful but stale source does not prevent trying the fallback',async()=>{let count=0;const result=await fetchClosedCandles('TONUSDT','1h',100,now,ms,async()=>({ok:true,json:async()=>rows(count++===0)}));assert.equal(count,2);assert.equal(result.at(-1).t,999*ms);});
test('all stale sources remain unavailable and never advance the checkpoint',async()=>{await assert.rejects(fetchClosedCandles('TONUSDT','1h',100,now,ms,async()=>({ok:true,json:async()=>rows(true)})),/indisponíveis/);});
