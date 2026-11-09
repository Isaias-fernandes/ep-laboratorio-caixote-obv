import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SYMBOLS,EXCLUDED,PRICE_GROUPS,ADDED_AT} from '../market-universe.mjs';
import {loadQuality,saveQuality} from '../automation/quality-collector.mjs';
test('shared collection universe excludes unavailable TON without deleting past records',()=>{
 assert.equal(SYMBOLS.length,60);assert.equal(new Set(SYMBOLS).size,60);assert.ok(!SYMBOLS.includes('TONUSDT'));assert.ok(EXCLUDED.some(x=>x.symbol==='TONUSDT'));assert.ok(SYMBOLS.every(s=>/^[A-Z0-9]+USDT$/.test(s)));
});
test('health expects active universe and ignores retained excluded cache in coverage',()=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ep-universe-'));process.chdir(dir);try{
 const store=loadQuality(),at=Date.UTC(2026,10,9,18);for(const symbol of [...SYMBOLS,'TONUSDT'])store.pairs[symbol]={lastCandle:at-3600000,cache:[],reading:{observedAt:new Date(at).toISOString(),features:{flowAvailable:true}}};
 const h=saveQuality(store,[],new Date(at).toISOString());assert.equal(h.ok,true);assert.equal(h.expected,60);assert.equal(h.available,60);assert.ok(!h.pairs.some(p=>p.symbol==='TONUSDT'));assert.ok(store.pairs.TONUSDT);
 }finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}
});

test('eleven additions have explicit admission dates and distinct price groups',()=>{
 assert.equal(PRICE_GROUPS.higher_unit_price.length,5);assert.equal(PRICE_GROUPS.lower_unit_price.length,6);const added=Object.keys(ADDED_AT);assert.equal(added.length,11);assert.equal(new Set(added).size,11);assert.ok(added.every(s=>SYMBOLS.includes(s)&&Number.isFinite(Date.parse(ADDED_AT[s]))));
});
test('signals closed before new asset admission never enter the prospective cohort',async()=>{
 const {collectQuality}=await import('../automation/quality-collector.mjs');const {baselineHour}=await import('../quality/core.ts');const ms=3600000,symbol='PAXGUSDT',day='2026-11-08',last=Date.parse(day+'T00:00:00Z')+baselineHour(symbol,day)*ms;
 const rows=Array.from({length:724},(_,i)=>({t:last-(723-i)*ms,o:100,h:101,l:99,c:100,v:100,q:10000,tq:6000}));const state={pairs:{},active:{},newBirths:[],completed:[]};collectQuality(state,symbol,rows,new Date(last+ms).toISOString());const b=state.newBirths.find(b=>b.strategy==='BASELINE');assert.ok(b);assert.equal(b.retroactive,true);assert.equal(b.universeVersion,'ep-universe-2026-11-09-60');
});
