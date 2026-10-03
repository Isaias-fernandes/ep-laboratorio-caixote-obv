import test from 'node:test';
import assert from 'node:assert/strict';
import {closedCandles,contiguous,analyze} from '../lab-signal-engine.mjs';
import {reading,advance} from '../lab-live-core.mjs';
const ms=300000;
function series(n=96){return Array.from({length:n},(_,i)=>{const p=100+i*.1;return{t:i*ms,o:p,h:p+.3,l:p-.2,c:p+.1,v:100}})}
test('open candles are excluded even if they would produce a breakout',()=>{
 const a=series(97);a[96]={...a[96],h:150,c:149,v:1000};const c=closedCandles(a,ms,96*ms);assert.equal(c.length,96);assert.equal(c.at(-1).t,95*ms);
});
test('sort, deduplicate and reject an invalid OHLC candle',()=>{
 const a=series(96);const c=closedCandles([...a.reverse(),a[0],{t:99*ms,o:100,h:99,l:98,c:101,v:10}],ms,101*ms);
 assert.equal(c.length,96);assert.ok(contiguous(c,ms));
});
test('missing interval is rejected rather than counted as complete coverage',()=>{
 const a=series(97).filter((_,i)=>i!==40);assert.throws(()=>reading(a,'5m',98*ms),/consecutivas/);
});
test('shared H1 score keeps low-volume directional patterns below approval',()=>{
 const a=series(96);a.at(-1).c=120;a.at(-1).h=121;a.at(-1).v=50;assert.ok(analyze(a).score<80);
});
const x=(time,stage='PRE_SIGNAL')=>({candleTime:time,closedAt:time+ms,price:100,direction:'BUY',stage,score:stage==='CONFIRMED'?90:70,pattern:'Teste',indicators:{}});
test('pre-signal has no entry; confirmation sets entry on the closed confirmation candle',()=>{
 let e=advance([],'BTCUSDT','5m',x(0),{h:101,l:99},new Date(ms).toISOString());assert.equal(e[0].data.entry,null);
 e=advance(e,'BTCUSDT','5m',x(ms,'CONFIRMED'),{h:200,l:50},new Date(2*ms).toISOString());
 assert.equal(e.length,1);assert.equal(e[0].status,'CONFIRMED');assert.equal(e[0].data.entry,100);assert.equal(e[0].data.mfe,0);
});
test('retry preserves event identity and does not double count a candle',()=>{
 let e=advance([],'BTCUSDT','5m',x(0,'CONFIRMED'),{h:101,l:99},new Date(ms).toISOString());
 const next=advance(e,'BTCUSDT','5m',x(ms,'CONFIRMED'),{h:102,l:98},new Date(2*ms).toISOString());assert.equal(next.length,1);assert.equal(next[0].data.observedCandles,1);
 const retry=advance(next,'BTCUSDT','5m',x(ms,'CONFIRMED'),{h:102,l:98},new Date(2*ms).toISOString());
 assert.equal(retry.length,0);assert.equal(next[0].data.observedCandles,1);
});
test('invalidated signal keeps future audit tracking',()=>{
 const e=advance([],'BTCUSDT','5m',x(0,'CONFIRMED'),{h:101,l:99},new Date(ms).toISOString());
 const y={...x(ms),stage:'NO_SIGNAL',direction:'NEUTRAL'};
 const next=advance(e,'BTCUSDT','5m',y,{h:103,l:97},new Date(2*ms).toISOString());
 assert.equal(next[0].status,'INVALIDATED');assert.equal(next[0].data.trackingStatus,'COLLECTING');assert.equal(next[0].data.observedCandles,1);
});
test('96 future closed candles complete the follow-up without using entry candle extremes',()=>{
 let e=advance([],'BTCUSDT','5m',x(0,'CONFIRMED'),{h:200,l:1},new Date(ms).toISOString());
 for(let i=1;i<=96;i++)e=advance(e,'BTCUSDT','5m',x(i*ms,'CONFIRMED'),{h:102,l:98},new Date((i+1)*ms).toISOString());
 assert.equal(e[0].data.observedCandles,96);assert.equal(e[0].data.trackingStatus,'COMPLETED');assert.ok(e[0].data.mfe<3);
});
