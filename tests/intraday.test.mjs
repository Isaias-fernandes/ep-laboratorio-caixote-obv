import test from 'node:test';import assert from 'node:assert/strict';
import {selectionWindows,collectIntraday,compactIntraday,deriveM30} from '../automation/intraday-candles.mjs';
const row=(t,c=100)=>({t,o:c,h:c+2,l:c-1,c:c+1,v:10,q:1000,tq:500});
test('M15 collection reuses closed candles, deduplicates and rejects gaps',()=>{
 const s={rows:{},last:{}};collectIntraday(s,'BTCUSDT','15m',[row(0),row(900000),row(1800000)],[],1800000);assert.equal(Object.keys(s.rows).length,2);collectIntraday(s,'BTCUSDT','15m',[row(0),row(900000)],[],1800000);assert.equal(Object.keys(s.rows).length,2);assert.throws(()=>collectIntraday(s,'BTCUSDT','15m',[row(0),row(1800000)],[],2700000));
});
test('M5 selection excludes baseline, pre-signal bars and outside windows',()=>{
 const e=[{id:'a',symbol:'BTCUSDT',strategy:'TRV_CONFIRMED',signalTime:0,status:'COMPLETED',lastCandleTime:3600000},{id:'b',symbol:'ETHUSDT',strategy:'BASELINE',signalTime:0,status:'PENDING'}],windows=selectionWindows(e),s={rows:{},last:{}};
 assert.equal(windows.length,1);const bars=Array.from({length:30},(_,i)=>row(i*300000));collectIntraday(s,'BTCUSDT','5m',bars,windows,9000000);assert.equal(Object.keys(s.rows).length,12);assert.ok(Object.values(s.rows).every(c=>Date.parse(c.candleTime)>=3600000&&Date.parse(c.candleTime)<7200000&&c.signalIds[0]==='a'));
});
test('transport retains unacknowledged history and prunes only old confirmed rows',()=>{
 const s={rows:{a:{symbol:'BTCUSDT',interval:'15m',candleTime:new Date(0).toISOString()}}};assert.equal(Object.keys(compactIntraday(s,{sent:{}},72*3600000).rows).length,1);assert.equal(Object.keys(compactIntraday(s,{sent:{'BTCUSDT|15m':0}},72*3600000).rows).length,0);
});
test('M30 is derived only from complete UTC-aligned M15 pairs',()=>{
 const c=t=>({symbol:'BTCUSDT',candleTime:new Date(t).toISOString(),open:100,high:t?105:102,low:99,close:t?104:101,volume:10});const r=deriveM30([c(0),c(900000),c(2700000)]);assert.equal(r.length,1);assert.equal(r[0].close,104);assert.equal(r[0].volume,20);assert.equal(r[0].high,105);
});
test('sender saves acknowledgements before failure and resumes remaining candles without duplicates',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ep-intraday-send-'));try{
 fs.mkdirSync(path.join(dir,'data/intraday'),{recursive:true});const rows=Object.fromEntries(Array.from({length:501},(_,i)=>['r'+i,{symbol:'BTCUSDT',interval:'15m',candleTime:new Date(i*900000).toISOString(),open:100,high:101,low:99,close:100,volume:10,selection:'CONTINUOUS',signalIds:[]} ]));fs.writeFileSync(path.join(dir,'data/intraday/buffer.json'),JSON.stringify({rows}));
 const mock=path.join(dir,'mock.mjs');fs.writeFileSync(mock,`let n=0;globalThis.fetch=async(u,o)=>{n++;const body=JSON.parse(o.body);if(process.env.MOCK_FAIL==='1'&&n===2)return{ok:false,status:503,json:async()=>({error:'temporary'})};return{ok:true,json:async()=>({ok:true,accepted:body.candles.length})};};`);
 const script=new URL('../automation/send-intraday-batch.mjs',import.meta.url).pathname,run=fail=>spawnSync(process.execPath,['--import',mock,script],{cwd:dir,env:{...process.env,EP_SIGNAL_INGEST_TOKEN:'test-only',MOCK_FAIL:fail},encoding:'utf8'});
 assert.notEqual(run('1').status,0);const ack=JSON.parse(fs.readFileSync(path.join(dir,'data/intraday/checkpoint.json')));assert.equal(ack.sent['BTCUSDT|15m'],499*900000);
 const resume=run('0');assert.equal(resume.status,0);assert.equal(JSON.parse(resume.stdout).sentIntraday,1);assert.equal(JSON.parse(run('0').stdout).sentIntraday,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
