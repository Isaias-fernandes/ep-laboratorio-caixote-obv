import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SYMBOLS,EXCLUDED} from '../market-universe.mjs';
import {loadQuality,saveQuality} from '../automation/quality-collector.mjs';
test('shared collection universe excludes unavailable TON without deleting past records',()=>{
 assert.equal(SYMBOLS.length,49);assert.equal(new Set(SYMBOLS).size,49);assert.ok(!SYMBOLS.includes('TONUSDT'));assert.ok(EXCLUDED.some(x=>x.symbol==='TONUSDT'));assert.ok(SYMBOLS.every(s=>/^[A-Z0-9]+USDT$/.test(s)));
});
test('health expects active universe and ignores retained excluded cache in coverage',()=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ep-universe-'));process.chdir(dir);try{
 const store=loadQuality(),at=Date.UTC(2026,10,9,18);for(const symbol of [...SYMBOLS,'TONUSDT'])store.pairs[symbol]={lastCandle:at-3600000,cache:[],reading:{observedAt:new Date(at).toISOString(),features:{flowAvailable:true}}};
 const h=saveQuality(store,[],new Date(at).toISOString());assert.equal(h.ok,true);assert.equal(h.expected,49);assert.equal(h.available,49);assert.ok(!h.pairs.some(p=>p.symbol==='TONUSDT'));assert.ok(store.pairs.TONUSDT);
 }finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}
});
