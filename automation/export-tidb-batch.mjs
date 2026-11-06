import fs from 'node:fs';

const input = 'data/live-signals.json';
const output = process.env.EP_TIDB_BATCH_PATH || '/tmp/ep-h1-batch.json';
const now = Date.now();
const feed = JSON.parse(fs.readFileSync(input, 'utf8'));
const latest = new Map();

for (const row of feed.state || []) {
  const snapshot = row?.data?.h1Snapshot;
  if (row.interval !== '1h' || !snapshot || !Number.isFinite(Date.parse(snapshot.candleTime))) continue;
  const current = latest.get(row.symbol);
  if (!current || Date.parse(snapshot.candleTime) > Date.parse(current.candleTime)) {
    latest.set(row.symbol, {
      symbol: row.symbol,
      candleTime: snapshot.candleTime,
      open: snapshot.open,
      high: snapshot.high,
      low: snapshot.low,
      close: snapshot.close,
      volume: snapshot.volume,
      ema20: snapshot.ema20,
    });
  }
}

const cutoff = now - 2 * 60 * 60 * 1000;
const signals = new Map();
for (const event of feed.events || []) {
  if (event.interval !== '1h') continue;
  const recentlyUpdated = Date.parse(event.updated_at) >= cutoff;
  const stillTracking = event.data?.trackingStatus === 'COLLECTING';
  if (recentlyUpdated || stillTracking) signals.set(event.id, event);
}
const selectedSignals = [...signals.values()]
  .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  .slice(0, 500);

if (latest.size === 0) {
  console.log('Nenhuma vela H1 disponível para enviar; lote não criado.');
  process.exit(0);
}

fs.writeFileSync(output, JSON.stringify({
  source: 'ep-lab-h1-v1',
  observedAt: new Date(now).toISOString(),
  candles: [...latest.values()],
  signals: selectedSignals,
}));
console.log(JSON.stringify({ candles: latest.size, signals: selectedSignals.length }));
