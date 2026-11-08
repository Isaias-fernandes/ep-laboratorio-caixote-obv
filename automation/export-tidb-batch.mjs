import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readJson,writeJson} from './json-store.mjs';
export const recordHash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function buildH1Export(feed,archives,checkpoint={},qualityState={pairs:{}}){
  const latest=new Map(),signals=new Map(),candleCheckpoint=checkpoint.candles||{},signalCheckpoint=checkpoint.signals||{};
  for(const row of feed.state||[]){
    const s=row?.data?.h1Snapshot;if(row.interval!=='1h'||!s||!Number.isFinite(Date.parse(s.candleTime)))continue;
    latest.set(row.symbol,{symbol:row.symbol,...s});
  }
  const candles=[];
  for(const [symbol,s] of latest){
    const after=candleCheckpoint[symbol],cached=qualityState.pairs?.[symbol]?.cache||[];
    const rows=after==null?[]:cached.filter(c=>c.t>after);
    if(rows.length&&rows[0].t!==after+3600000)throw Error('Lacuna de exportação H1: '+symbol);
    if(after!=null&&!rows.length&&Date.parse(s.candleTime)>after)throw Error('Candles H1 de recuperação indisponíveis: '+symbol);
    // Once-only bounded historical recovery from the existing 30-day cache.
    // Exclude the first 95 bars, which do not have a complete EMA context.
    const before=checkpoint.backfillStart?.[symbol]??Infinity;
    const historical=cached.slice(95).filter(c=>c.t<before&&(after==null||c.t<=after));
    for(let i=1;i<cached.length;i++)if(cached[i].t!==cached[i-1].t+3600000)throw Error('Cache H1 descontínuo: '+symbol);
    if(after==null)candles.push(s);
    for(const c of [...rows,...historical]){const context=cached.filter(r=>r.t<=c.t).slice(-96);let ema20=context[0].c;for(const b of context.slice(1))ema20=b.c*2/21+ema20*19/21;
      candles.push({symbol,candleTime:new Date(c.t).toISOString(),open:c.o,high:c.h,low:c.l,close:c.c,volume:c.v,ema20});}
  }
  // Descending per asset: a partial acknowledgement advances a safe lower watermark.
  const unique=new Map(candles.map(c=>[c.symbol+'|'+c.candleTime,c]));
  const orderedCandles=[...unique.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol)||Date.parse(b.candleTime)-Date.parse(a.candleTime));
  // Include old archives and every pending update; a 500-record page limit never drops records.
  for(const e of [...archives,...(feed.events||[])]){
    if(e.interval!=='1h')continue;const pattern=e.pattern??e.data?.pattern;
    if(typeof pattern!=='string')throw Error('Sinal sem pattern: '+e.id);
    const value={...e,pattern},prior=signals.get(e.id);
    if(!prior||Date.parse(value.updated_at)>=Date.parse(prior.updated_at))signals.set(e.id,value);
  }
  return{source:'ep-lab-h1-v1',observedAt:new Date().toISOString(),candles:orderedCandles,
    signals:[...signals.values()].filter(e=>signalCheckpoint[e.id]!==recordHash(e)).sort((a,b)=>Date.parse(a.updated_at)-Date.parse(b.updated_at)||a.id.localeCompare(b.id))};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
  const feed=readJson('data/live-signals.json',{state:[],events:[]}),dir='data/live-history';
  const archives=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).flatMap(f=>readJson(`${dir}/${f}`,{records:[]}).records):[];
  const checkpoint=readJson('data/tidb-export-checkpoint.json',{candles:{},signals:{}}),quality=readJson('data/quality/state.json',{pairs:{}});
  const batch=buildH1Export(feed,archives,checkpoint,quality);
  writeJson(process.env.EP_TIDB_BATCH_PATH||'/tmp/ep-h1-batch.json',batch);
  console.log(JSON.stringify({candles:batch.candles.length,signals:batch.signals.length}));
}
