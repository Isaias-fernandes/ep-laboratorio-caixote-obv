import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classify,VERSION} from '../ema-mtf-core.mjs';
import {recoverMinutes} from '../automation/recover-candles.mjs';
import {archiveEvents,compactFeed,loadActive} from '../automation/experiment-storage.mjs';
import {trackExperiment} from '../automation/track-experiment.mjs';
const now=1000*3600000+10000;
function rows(ms){const end=Math.floor(now/ms)*ms;return Array.from({length:261},(_,i)=>{const c=100+i*.02,t=end-(260-i)*ms;return{t,o:c-.01,h:c+.1,l:c-.1,c,v:100};});}
test('shared EMA core excludes forming candles and uses identical 240-bar context',()=>{
 const data=[rows(300000),rows(900000),rows(3600000)],a=classify(...data,now);
 for(const c of data)c.at(-1).h=999999,c.at(-1).c=999999;
 const b=classify(...data,now);assert.deepEqual(a,b);assert.equal(a.version,VERSION);assert.equal(a.candles.m5.length,240);
 const same=classify(...data.map(r=>r.slice(-245)),now);assert.deepEqual(a,same);
});
test('shared EMA core rejects gaps and stale candles instead of carrying them forward as current',()=>{
 const data=[rows(300000),rows(900000),rows(3600000)];data[0].splice(100,1);assert.throws(()=>classify(...data,now));
 assert.throws(()=>classify(rows(300000).slice(0,-2),rows(900000),rows(3600000),now));
});
test('minute recovery traverses multiple bounded pages and refuses an incomplete tail',async()=>{
 let calls=0;const fetcher=async url=>{calls++;const u=new URL(url),start=+u.searchParams.get('startTime'),last=+u.searchParams.get('endTime');return{ok:true,json:async()=>Array.from({length:Math.min(1000,Math.floor((last-start)/60000)+1)},(_,i)=>[start+i*60000,100,101,99,100,10])};};
 const recovered=await recoverMinutes('BTCUSDT',0,2001*60000,fetcher,3);assert.equal(recovered.length,2000);assert.equal(calls,2);
 await assert.rejects(recoverMinutes('BTCUSDT',0,4001*60000,fetcher,3),/RECOVERY_BUDGET/);
});
test('archive preserves every event before reducing feed and protects birth fields',()=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ep-storage-'));process.chdir(dir);
 try{const events=Array.from({length:400},(_,i)=>({id:'e'+i,symbol:'BTCUSDT',entry:100,entryTime:i*60000,createdAt:'2026-11-08T00:00:00Z',status:'CLOSED'}));
 archiveEvents('test',events);assert.equal(compactFeed(events).length,300);
 const p='data/experiment-history/test/2026-11-08.json';assert.equal(JSON.parse(fs.readFileSync(p)).records.length,400);
 archiveEvents('test',[{...events[0],mfe:5}]);assert.equal(JSON.parse(fs.readFileSync(p)).records.find(e=>e.id==='e0').mfe,5);
 assert.throws(()=>archiveEvents('test',[{...events[0],entry:101}]),/imutável/);
 const open={...events[0],id:'open',status:'OPEN'};archiveEvents('test',[open]);assert.equal(loadActive('test',[],Date.parse('2026-11-09T00:00:00Z')).length,1);
 }finally{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}
});
test('experiment tracking records ambiguity, exact window boundaries and incomplete coverage',()=>{
 const e={id:'test',side:'BUY',entry:100,entryTime:0,status:'OPEN',mfe:0,mae:0};
 let c=Array.from({length:60},(_,i)=>({t:(i+1)*60000,o:100,h:101,l:99,c:100}));
 trackExperiment(e,c,60000,3600000,61*60000);assert.equal(e.status,'CLOSED');assert.equal(e.audit.coverage,'COMPLETE');assert.equal(e.fixedWindows[1].valid,true);
 const other={id:'other',direction:'BUY',entry:100,entryTime:0,status:'OPEN'};
 trackExperiment(other,[{t:60000,o:100,h:111,l:96,c:100}],60000,3600000,120000);assert.equal(other.audit.cells[10].outcome,'AMBIGUOUS');
 const gap={id:'gap',direction:'BUY',entry:100,entryTime:0,status:'OPEN'};trackExperiment(gap,c.slice(1),60000,3600000,61*60000);assert.equal(gap.audit.coverage,'PARTIAL');assert.equal(gap.fixedWindows[1].valid,false);
});
