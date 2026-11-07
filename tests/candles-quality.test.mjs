import test from 'node:test';
import assert from 'node:assert/strict';
import detector from '../candlestick-patterns-lab.js';
function rows(bull=true){const x=Array.from({length:96},(_,i)=>({t:i,o:bull?110:90,h:bull?111:91,l:bull?109:89,c:bull?110:90,v:100}));const make=(o,c)=>({t:0,o,c,h:Math.max(o,c)+.1,l:Math.min(o,c)-.1,v:100});
  x.splice(-3,3,...(bull?[make(105,99),make(100,103),make(103,106)]:[make(95,101),make(100,97),make(97,94)]));return x;}
test('Three Inside Up uses bearish mother, inside bullish candle and a third confirming candle',()=>{assert.ok(detector.detect(rows()).some(p=>p.name==='Three Inside Up'));const x=rows();x.at(-1).c=104;x.at(-1).h=104.1;assert.ok(!detector.detect(x).some(p=>p.name==='Three Inside Up'));});
test('Three Inside Down uses three distinct candles and rejects a missing confirmation',()=>{assert.ok(detector.detect(rows(false)).some(p=>p.name==='Three Inside Down'));const x=rows(false);x.at(-1).c=96;x.at(-1).h=97.1;assert.ok(!detector.detect(x).some(p=>p.name==='Three Inside Down'));});
