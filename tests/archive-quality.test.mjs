import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadQuality,collectQuality,saveQuality,buildSummary} from '../automation/quality-collector.mjs';
import {buildH1Export,recordHash} from '../automation/export-tidb-batch.mjs';
import {CONFIG} from '../quality/core.ts';
const ms=3600000;
const bars=(n=724)=>Array.from({length:n},(_,i)=>({t:i*ms,o:100,h:101,l:99,c:100,v:100,q:10000,tq:5500}));
test('collector saves immutable births separately, resumes idempotently and preserves checkpoint on gap',()=>{
  const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ep-quality-'));process.chdir(dir);
  try{
    const store=loadQuality(),rows=bars();collectQuality(store,'BTCUSDT',rows,new Date(rows.at(-1).t+ms).toISOString());
    const first=JSON.stringify(store.pairs.BTCUSDT);collectQuality(store,'BTCUSDT',rows,new Date(rows.at(-1).t+ms).toISOString());assert.equal(JSON.stringify(store.pairs.BTCUSDT),first);
    assert.throws(()=>collectQuality(store,'BTCUSDT',[...rows.slice(-95),{...rows.at(-1),t:rows.at(-1).t+2*ms}],new Date().toISOString()));
    assert.equal(JSON.stringify(store.pairs.BTCUSDT),first);
    saveQuality(store,[],new Date(rows.at(-1).t+ms).toISOString());
    const summary=JSON.parse(fs.readFileSync('data/quality/summary.json'));assert.equal(summary.health.available,1);assert.equal(summary.health.ok,false);assert.equal(loadQuality().pairs.BTCUSDT.cache.length,720);
  }finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}
});
test('H1 export includes all pages and old events, with no two-hour cutoff or 500-record truncation',()=>{
  const events=Array.from({length:1201},(_,i)=>({id:'event'+i,interval:'1h',symbol:'BTCUSDT',updated_at:'2026-01-01T00:00:00Z',data:{pattern:'TRV'}}));
  const output=buildH1Export({state:[],events:[]},events);assert.equal(output.signals.length,1201);
  const checkpoint={signals:Object.fromEntries(output.signals.map(e=>[e.id,recordHash(e)]))};assert.equal(buildH1Export({state:[],events:[]},events,checkpoint).signals.length,0);
});
test('H1 export recovers every cached candle after acknowledged checkpoint',()=>{
  const rows=bars(3),snapshot={candleTime:new Date(rows.at(-1).t).toISOString(),open:100,high:101,low:99,close:100,volume:100,ema20:100};
  const feed={state:[{symbol:'BTCUSDT',interval:'1h',data:{h1Snapshot:snapshot}}],events:[]};
  const result=buildH1Export(feed,[],{candles:{BTCUSDT:0}},{pairs:{BTCUSDT:{cache:rows}}});assert.equal(result.candles.length,2);
  assert.throws(()=>buildH1Export(feed,[],{candles:{BTCUSDT:0}},{pairs:{BTCUSDT:{cache:rows.slice(-1)}}}));
});

test('historical H1 recovery reuses cached bars with warmup and safely resumes partial acknowledgements',()=>{
  const rows=bars(720),last=rows.at(-1),snapshot={candleTime:new Date(last.t).toISOString(),open:100,high:101,low:99,close:100,volume:100,ema20:100};
  const feed={state:[{symbol:'BTCUSDT',interval:'1h',data:{h1Snapshot:snapshot}}]},state={pairs:{BTCUSDT:{cache:rows}}};
  const output=buildH1Export(feed,[],{candles:{BTCUSDT:last.t}},state);assert.equal(output.candles.length,625);assert.equal(Date.parse(output.candles[0].candleTime),last.t);
  const ack=output.candles.slice(0,500),start=Date.parse(ack.at(-1).candleTime);
  const retry=buildH1Export(feed,[],{candles:{BTCUSDT:last.t},backfillStart:{BTCUSDT:start}},state);assert.equal(retry.candles.length,125);
  assert.ok(retry.candles.every(c=>Date.parse(c.candleTime)<start));
  const complete=buildH1Export(feed,[],{candles:{BTCUSDT:last.t},backfillStart:{BTCUSDT:95*ms}},state);assert.equal(complete.candles.length,0);
});
