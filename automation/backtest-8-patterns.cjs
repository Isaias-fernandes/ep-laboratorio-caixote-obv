const fs = require('node:fs');
const path = require('node:path');
const lab = require('../structure-volume-lab.js');

const SYMBOLS = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','TRXUSDT','LTCUSDT','BCHUSDT','XLMUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','NEARUSDT','APTUSDT','FILUSDT','ICPUSDT','ARBUSDT','OPUSDT','SUIUSDT','AAVEUSDT'];
const OUT = path.resolve('data/backtest-8-patterns.json');
const TARGETS = [5,10,20,30,50];
const HOUR = 3600000;
const HORIZON = 96;
const MIN_SCORE = 80;

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'laboratorio-historico/1.0' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function fetchHistory(symbol, wanted = 1200) {
  const all = [];
  let endTime;
  while (all.length < wanted) {
    const limit = Math.min(1000, wanted - all.length);
    const qs = new URLSearchParams({ symbol, interval: '1h', limit: String(limit) });
    if (endTime) qs.set('endTime', String(endTime));
    let rows, lastErr;
    for (const base of ['https://data-api.binance.vision','https://api.binance.com']) {
      try { rows = await getJSON(`${base}/api/v3/klines?${qs}`); break; }
      catch (e) { lastErr = e; }
    }
    if (!rows) throw lastErr || new Error('sem dados');
    if (!rows.length) break;
    const mapped = rows.map(x => ({ t:+x[0], o:+x[1], h:+x[2], l:+x[3], c:+x[4], v:+x[5] }));
    all.unshift(...mapped);
    endTime = mapped[0].t - 1;
    if (mapped.length < limit) break;
    await new Promise(r => setTimeout(r, 80));
  }
  const dedup = [...new Map(all.map(x => [x.t,x])).values()].sort((a,b)=>a.t-b.t);
  const now = Date.now();
  return dedup.filter(x => x.t + HOUR <= now).slice(-wanted);
}

function aggregate(rows) {
  const by = new Map();
  for (const row of rows) {
    const g = by.get(row.pattern) || { pattern:row.pattern, signals:0, mfe:0, mae:0, retest:0, obvConfirmed:0, targets:Object.fromEntries(TARGETS.map(t=>[t,0])) };
    g.signals++; g.mfe += row.mfe; g.mae += row.mae;
    if (row.retest) g.retest++;
    if (row.obv === 'ALTA') g.obvConfirmed++;
    for (const t of TARGETS) if (row.mfe >= t) g.targets[t]++;
    by.set(row.pattern,g);
  }
  return [...by.values()].map(g => ({
    pattern:g.pattern, signals:g.signals,
    avgMfePct:+(g.mfe/g.signals).toFixed(3), avgMaePct:+(g.mae/g.signals).toFixed(3),
    payoffExcursion:+((g.mfe/g.signals)/Math.max(Math.abs(g.mae/g.signals),0.0001)).toFixed(2),
    retestPct:+(100*g.retest/g.signals).toFixed(1), obvConfirmPct:+(100*g.obvConfirmed/g.signals).toFixed(1),
    hitRates:Object.fromEntries(TARGETS.map(t=>[t, +(100*g.targets[t]/g.signals).toFixed(1)])), hits:g.targets
  })).sort((a,b)=>b.hitRates[5]-a.hitRates[5] || b.avgMfePct-a.avgMfePct);
}

(async()=>{
  const allRows=[], assets=[], errors=[];
  for (const symbol of SYMBOLS) {
    try {
      const candles=await fetchHistory(symbol,1200);
      const report=lab.evaluate(candles,'1h',Date.now(),HORIZON,MIN_SCORE);
      const done=report.rows.filter(x=>x.status==='AVALIADO');
      allRows.push(...done.map(x=>({...x,symbol})));
      assets.push({symbol,candles:candles.length,signals:done.length,first:candles[0]?.t||null,last:candles.at(-1)?.t||null});
      console.log(symbol,candles.length,done.length);
    } catch(e) { errors.push({symbol,error:e.message}); console.error(symbol,e.message); }
  }
  const summary=aggregate(allRows);
  const result={generatedAt:new Date().toISOString(),labVersion:lab.VERSION,market:'CRIPTO',timeframe:'H1',candlesPerAsset:1200,horizonCandles:HORIZON,minimumScore:MIN_SCORE,assetsTested:assets.length,errors,totalSignals:allRows.length,ranking:summary,assets,sample:allRows.slice(0,200)};
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({totalSignals:result.totalSignals,ranking:summary},null,2));
})();
