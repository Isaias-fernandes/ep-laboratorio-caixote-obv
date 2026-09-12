import fs from 'node:fs';
import path from 'node:path';

/*
  HISTORICO EXPERIMENTAL H1 96/80
  - Isolado do EP Whale e da Gestao Farmaceutica.
  - Nao altera score, padroes, motores ou sinais.
  - Preserva cada sinal automatico e acompanha as 96 velas posteriores.
  - Registra a ordem observada dos limiares favoraveis/adversos.
*/

const AUTO = path.resolve('data/auto-signals.json');
const OUT = path.resolve('data/h1-history.json');
const FAVORABLE = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 50];
const ADVERSE = [0.25, 0.5, 1, 2, 5, 10];
const HORIZON = 96;

const num = v => Number.isFinite(+v) ? +v : null;
const pct = (entry, value) => entry ? ((value - entry) / entry) * 100 : 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function normalize(rows) {
  return (rows || []).map((r, i) => ({
    t: +(r.time ?? r.timestamp ?? i),
    o: +r.open, h: +r.high, l: +r.low, c: +r.close, v: +r.volume
  })).filter(x => [x.t, x.o, x.h, x.l, x.c, x.v].every(Number.isFinite) && x.h >= x.l && x.v >= 0)
    .sort((a,b) => a.t - b.t);
}

async function json(url, headers={}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function cryptoCandles(symbol) {
  const errs=[];
  for (const base of ['https://data-api.binance.vision','https://api.binance.com']) {
    try {
      const j = await json(`${base}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=1000`);
      return normalize(j.map(x => ({time:x[0],open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})));
    } catch(e) { errs.push(`${base}:${e.message}`); }
  }
  try {
    const pair = symbol.replace(/USDT$/,'-USDT');
    const j = await json(`https://api.kucoin.com/api/v1/market/candles?type=1hour&symbol=${pair}`);
    return normalize((j?.data || []).slice(0,1000).reverse().map(x => ({time:+x[0]*1000,open:x[1],close:x[2],high:x[3],low:x[4],volume:x[5]})));
  } catch(e) { errs.push(`KUCOIN:${e.message}`); }
  throw new Error(errs.join(' | '));
}

async function b3Candles(symbol) {
  const errs=[];
  for (const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']) {
    try {
      const u = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol+'.SA')}?range=3mo&interval=1h&includePrePost=false&events=div%2Csplits`;
      const j = await json(u, {'User-Agent':'Mozilla/5.0'});
      const d = j.chart?.result?.[0];
      if (!d) throw new Error('sem resultado');
      const q=d.indicators?.quote?.[0], t=d.timestamp||[];
      return normalize(t.map((ts,i)=>({time:ts*1000,open:q.open[i],high:q.high[i],low:q.low[i],close:q.close[i],volume:q.volume[i]})));
    } catch(e) { errs.push(`${host}:${e.message}`); }
  }
  throw new Error(errs.join(' | '));
}

function compactSignal(s) {
  return {
    id: s.id,
    market: s.market,
    symbol: s.symbol,
    direction: s.direction,
    interval: '1h',
    contextCandles: 96,
    horizonCandles: 96,
    score: s.score,
    entry: s.entry,
    entryTime: s.entryTime,
    createdAt: s.createdAt,
    pattern: s.pattern,
    patternType: s.patternType,
    patternConfirmed: !!s.patternConfirmed,
    indicators: {
      rsi: num(s.rsi),
      cci: num(s.cci),
      macdHistogram: num(s.macdHistogram),
      obv: s.obv ?? null,
      volumeRatio: num(s.volumeRatio),
      momentumAligned: !!s.momentumAligned,
      ignition: !!s.ignition
    },
    dataSource: s.dataSource ?? null,
    tracking: {
      status: 'COLETANDO',
      coverage: 'AGUARDANDO',
      candlesObserved: 0,
      lastProcessedCandleTime: null,
      lastPrice: num(s.entry),
      mfe: 0,
      mae: 0,
      favorableHits: {},
      adverseHits: {},
      order: {},
      completedAt: null
    }
  };
}

function markHit(map, threshold, candleTime, price) {
  const k=String(threshold);
  if (!map[k]) map[k] = { candleTime, price };
}

function refreshOrder(rec) {
  rec.tracking.order ||= {};
  for (const th of [0.25,0.5,1,2,5,10]) {
    const k=String(th), f=rec.tracking.favorableHits?.[k], a=rec.tracking.adverseHits?.[k];
    if (!f && !a) continue;
    if (f && !a) rec.tracking.order[k]='FAVORAVEL_PRIMEIRO_PENDENTE_ADV';
    else if (!f && a) rec.tracking.order[k]='ADVERSO_PRIMEIRO_PENDENTE_FAV';
    else if (f.candleTime < a.candleTime) rec.tracking.order[k]='FAVORAVEL_PRIMEIRO';
    else if (a.candleTime < f.candleTime) rec.tracking.order[k]='ADVERSO_PRIMEIRO';
    else rec.tracking.order[k]='MESMO_CANDLE_ORDEM_INDETERMINADA';
  }
}

function processRecord(rec, candles) {
  const tr = rec.tracking ||= compactSignal(rec).tracking;
  if (tr.status === 'CONCLUIDO_96') return false;
  const entry = num(rec.entry);
  if (!entry) return false;

  const all = candles.filter(c => c.t > rec.entryTime);
  if (!all.length) return false;

  if (tr.lastProcessedCandleTime == null) {
    const hasEntryCandle = candles.some(c => c.t === rec.entryTime);
    tr.coverage = hasEntryCandle ? 'COMPLETA_DESDE_ENTRADA' : 'PARCIAL_INICIO_NAO_DISPONIVEL';
  }

  const fresh = all.filter(c => tr.lastProcessedCandleTime == null || c.t > tr.lastProcessedCandleTime);
  if (!fresh.length) return false;

  let changed=false;
  for (const c of fresh) {
    if (tr.candlesObserved >= HORIZON) break;
    const fav = rec.direction === 'COMPRA' ? pct(entry,c.h) : -pct(entry,c.l);
    const adv = rec.direction === 'COMPRA' ? pct(entry,c.l) : -pct(entry,c.h);
    tr.mfe = Math.max(num(tr.mfe) || 0, fav);
    tr.mae = Math.min(num(tr.mae) || 0, adv);
    tr.lastPrice = c.c;
    tr.candlesObserved += 1;
    tr.lastProcessedCandleTime = c.t;
    for (const th of FAVORABLE) if (fav >= th) markHit(tr.favorableHits, th, c.t, rec.direction==='COMPRA'?c.h:c.l);
    for (const th of ADVERSE) if (adv <= -th) markHit(tr.adverseHits, th, c.t, rec.direction==='COMPRA'?c.l:c.h);
    changed=true;
  }
  refreshOrder(rec);
  if (tr.candlesObserved >= HORIZON) {
    tr.status='CONCLUIDO_96';
    tr.completedAt = new Date(tr.lastProcessedCandleTime).toISOString();
  }
  return changed;
}

function ensureRecord(history, signal) {
  if (history.records.some(r => r.id === signal.id)) return false;
  history.records.push(compactSignal(signal));
  return true;
}

async function main() {
  const auto = readJson(AUTO, {signals:[]});
  const history = readJson(OUT, {
    version: 1,
    protocol: {
      interval: '1h', contextCandles: 96, minScore: 80, futureHorizonCandles: 96,
      favorableThresholdsPct: FAVORABLE, adverseThresholdsPct: ADVERSE,
      note: 'Historico independente da retencao da tela/auto-signals. Ordem dentro da mesma vela H1 e indeterminada.'
    },
    createdAt: new Date().toISOString(),
    updatedAt: null,
    records: []
  });
  history.records = Array.isArray(history.records) ? history.records : [];

  let changed=false;
  for (const s of (auto.signals || [])) changed = ensureRecord(history,s) || changed;

  const active = history.records.filter(r => r.tracking?.status !== 'CONCLUIDO_96');
  const groups = new Map();
  for (const r of active) {
    const key=`${r.market}|${r.symbol}`;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(r);
  }

  const errors=[];
  for (const [key, records] of groups) {
    const [market,symbol]=key.split('|');
    try {
      const candles = market === 'CRIPTO' ? await cryptoCandles(symbol) : await b3Candles(symbol);
      for (const r of records) changed = processRecord(r,candles) || changed;
    } catch(e) {
      errors.push({market,symbol,error:e.message});
    }
    await sleep(80);
  }

  history.records.sort((a,b)=>(b.entryTime||0)-(a.entryTime||0));
  history.updatedAt = new Date().toISOString();
  history.summary = {
    total: history.records.length,
    collecting: history.records.filter(r=>r.tracking?.status==='COLETANDO').length,
    completed96: history.records.filter(r=>r.tracking?.status==='CONCLUIDO_96').length,
    completeCoverage: history.records.filter(r=>r.tracking?.coverage==='COMPLETA_DESDE_ENTRADA').length,
    partialCoverage: history.records.filter(r=>r.tracking?.coverage==='PARCIAL_INICIO_NAO_DISPONIVEL').length,
    errors
  };

  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT, JSON.stringify(history,null,2)+'\n');
  console.log(`historico H1: ${history.summary.total} sinais; ${history.summary.completed96} concluidos; ${history.summary.collecting} coletando; erros ${errors.length}`);
}

await main();
