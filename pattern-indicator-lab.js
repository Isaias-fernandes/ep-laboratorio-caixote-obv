(() => {
  const TARGETS = [10, 20, 30, 40, 50];
  const HISTORY_KEY = 'lab_pattern_signal_history_v2';
  const BACKTEST_KEY = 'lab_pattern_backtests_v2';
  const HISTORY_LIMIT = 300;
  const BACKTEST_LIMIT = 50;
  const CONFIGS = {
    atual: { label: 'Atual (controle)', rsi: 7, cci: 14, macd: [20, 30, 60] },
    candidata: { label: 'Candidata', rsi: 14, cci: 20, macd: [12, 26, 9] }
  };
  const TF = {
    M5: { interval: '5m', b3Range: '5d' },
    M15: { interval: '15m', b3Range: '5d' },
    M30: { interval: '30m', b3Range: '1mo' },
    H1: { interval: '1h', b3Range: '3mo' }
  };
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
  const ema = (v, p) => {
    if (!v.length) return [];
    const k = 2 / (p + 1), out = [v[0]];
    for (let i = 1; i < v.length; i++) out.push(v[i] * k + out[i - 1] * (1 - k));
    return out;
  };
  const rsi = (v, p) => {
    if (v.length <= p) return NaN;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = v[i] - v[i - 1]; d >= 0 ? g += d : l -= d; }
    let ag = g / p, al = l / p;
    for (let i = p + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      ag = (ag * (p - 1) + Math.max(d, 0)) / p;
      al = (al * (p - 1) + Math.max(-d, 0)) / p;
    }
    return al ? 100 - 100 / (1 + ag / al) : 100;
  };
  const cci = (c, p) => {
    if (c.length < p) return NaN;
    const t = c.slice(-p).map(x => (x.h + x.l + x.c) / 3), m = avg(t), d = avg(t.map(x => Math.abs(x - m)));
    return d ? (t.at(-1) - m) / (0.015 * d) : 0;
  };
  const macd = (v, fast, slow, signal) => {
    if (v.length < Math.max(fast, slow, signal) + 2) return { histogram: NaN, previousHistogram: NaN };
    const a = ema(v, fast), b = ema(v, slow), line = v.map((_, i) => a[i] - b[i]), sig = ema(line, signal);
    return { line: line.at(-1), signal: sig.at(-1), histogram: line.at(-1) - sig.at(-1), previousHistogram: line.at(-2) - sig.at(-2) };
  };
  const atr = (c, p = 14) => {
    if (c.length < p + 1) return NaN;
    const tr = [];
    for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)));
    return avg(tr.slice(-p));
  };
  const slope = v => {
    if (v.length < 3) return 0;
    const center = (v.length - 1) / 2, mean = avg(v);
    let num = 0, den = 0;
    v.forEach((x, i) => { const d = i - center; num += d * (x - mean); den += d * d; });
    return den ? num / den : 0;
  };
  function swings(c, field, high) {
    const out = [];
    for (let i = 2; i < c.length - 2; i++) {
      const x = c[i][field], ok = high ? x > c[i - 1][field] && x >= c[i + 1][field] : x < c[i - 1][field] && x <= c[i + 1][field];
      if (ok) out.push({ i, x });
    }
    return out;
  }
  function classifyPattern(candles) {
    const w = candles.slice(-60);
    if (w.length < 30) return { type: 'NEUTRO', direction: 'NEUTRAL', name: 'Dados insuficientes', confirmed: false, strength: 0 };
    const b = w.at(-1), a = w.at(-2), d = w.at(-3), body = Math.abs(b.c - b.o), range = Math.max(b.h - b.l, 1e-12);
    const upper = b.h - Math.max(b.o, b.c), lower = Math.min(b.o, b.c) - b.l;
    const bullEng = b.c > b.o && a.c < a.o && b.c >= a.o && b.o <= a.c;
    const bearEng = b.c < b.o && a.c > a.o && b.o >= a.c && b.c <= a.o;
    const hammer = lower >= body * 2 && upper <= Math.max(body, range * .12) && b.c >= b.o;
    const shooting = upper >= body * 2 && lower <= Math.max(body, range * .12) && b.c <= b.o;
    const morning = d.c < d.o && Math.abs(a.c - a.o) < Math.abs(d.c - d.o) * .45 && b.c > b.o && b.c > (d.o + d.c) / 2;
    const evening = d.c > d.o && Math.abs(a.c - a.o) < Math.abs(d.c - d.o) * .45 && b.c < b.o && b.c < (d.o + d.c) / 2;
    const prior = w.slice(-21, -1), high = Math.max(...prior.map(x => x.h)), low = Math.min(...prior.map(x => x.l));
    const close = w.map(x => x.c), impulse = (close.at(-9) - close.at(-17)) / (close.at(-17) || 1), recent = w.slice(-8);
    const recentRange = (Math.max(...recent.map(x => x.h)) - Math.min(...recent.map(x => x.l))) / (b.c || 1);
    const flag = Math.abs(impulse) >= .025 && recentRange <= Math.abs(impulse) * .7;
    const highs = w.slice(-18).map(x => x.h), lows = w.slice(-18).map(x => x.l);
    const converging = slope(highs) < 0 && slope(lows) > 0;
    const ascending = Math.abs(slope(highs)) <= Math.abs(slope(lows)) * .25 && slope(lows) > 0;
    const descending = Math.abs(slope(lows)) <= Math.abs(slope(highs)) * .25 && slope(highs) < 0;
    const currentAtr = atr(w), oldAtr = atr(w.slice(0, -8)), compression = Number.isFinite(currentAtr) && Number.isFinite(oldAtr) && currentAtr < oldAtr * .78;
    const peaks = swings(w, 'h', true), valleys = swings(w, 'l', false), tol = Math.max((currentAtr || 0) * .5, b.c * .003);
    const p1 = peaks.at(-2), p2 = peaks.at(-1), v1 = valleys.at(-2), v2 = valleys.at(-1);
    const topNeckline = p1 && p2 ? Math.min(...w.slice(p1.i, p2.i + 1).map(x => x.l)) : NaN;
    const bottomNeckline = v1 && v2 ? Math.max(...w.slice(v1.i, v2.i + 1).map(x => x.h)) : NaN;
    const doubleTop = !!(p1 && p2 && p2.i - p1.i >= 8 && p2.i >= w.length - 18 && Math.abs(p2.x - p1.x) <= tol && avg([p1.x, p2.x]) - topNeckline >= (currentAtr || 0) * 1.2 && b.c < topNeckline);
    const doubleBottom = !!(v1 && v2 && v2.i - v1.i >= 8 && v2.i >= w.length - 18 && Math.abs(v2.x - v1.x) <= tol && bottomNeckline - avg([v1.x, v2.x]) >= (currentAtr || 0) * 1.2 && b.c > bottomNeckline);
    if (doubleBottom) return { type: 'REVERSÃO', direction: 'BUY', name: 'Fundo duplo', confirmed: true, strength: 76 };
    if (doubleTop) return { type: 'REVERSÃO', direction: 'SELL', name: 'Topo duplo', confirmed: true, strength: 76 };
    if (b.c > high) return { type: 'CONTINUAÇÃO', direction: 'BUY', name: 'Rompimento da máxima de 20 períodos', confirmed: true, strength: 90 };
    if (b.c < low) return { type: 'CONTINUAÇÃO', direction: 'SELL', name: 'Rompimento da mínima de 20 períodos', confirmed: true, strength: 90 };
    if (morning || bullEng || hammer) return { type: 'REVERSÃO', direction: 'BUY', name: morning ? 'Estrela da manhã' : bullEng ? 'Engolfo de alta' : 'Martelo', confirmed: false, strength: 62 };
    if (evening || bearEng || shooting) return { type: 'REVERSÃO', direction: 'SELL', name: evening ? 'Estrela da noite' : bearEng ? 'Engolfo de baixa' : 'Estrela cadente', confirmed: false, strength: 62 };
    if (flag) return { type: 'CONTINUAÇÃO', direction: impulse > 0 ? 'BUY' : 'SELL', name: impulse > 0 ? 'Bandeira de alta' : 'Bandeira de baixa', confirmed: false, strength: 68 };
    if (ascending) return { type: 'CONTINUAÇÃO', direction: 'BUY', name: 'Triângulo ascendente', confirmed: false, strength: 64 };
    if (descending) return { type: 'CONTINUAÇÃO', direction: 'SELL', name: 'Triângulo descendente', confirmed: false, strength: 64 };
    if (converging || compression) return { type: 'NEUTRO', direction: 'NEUTRAL', name: converging ? 'Triângulo simétrico aguardando saída' : 'Compressão aguardando saída', confirmed: false, strength: 50 };
    if (body / range <= .1 || (b.h < a.h && b.l > a.l)) return { type: 'NEUTRO', direction: 'NEUTRAL', name: body / range <= .1 ? 'Doji / indecisão' : 'Inside bar aguardando rompimento', confirmed: false, strength: 42 };
    return { type: 'NEUTRO', direction: 'NEUTRAL', name: 'Sem padrão confirmado', confirmed: false, strength: 20 };
  }
  function analyze(candles, configName = 'candidata') {
    const cfg = CONFIGS[configName] || CONFIGS.candidata, close = candles.map(x => x.c), pattern = classifyPattern(candles);
    const rv = rsi(close, cfg.rsi), cv = cci(candles, cfg.cci), mv = macd(close, ...cfg.macd), last = candles.at(-1);
    const volumeRatio = last.v / (avg(candles.slice(-21, -1).map(x => x.v)) || last.v || 1), sign = pattern.direction === 'BUY' ? 1 : pattern.direction === 'SELL' ? -1 : 0;
    const aligned = sign && (sign > 0 ? rv >= 50 && cv > 0 && mv.histogram > 0 : rv <= 50 && cv < 0 && mv.histogram < 0);
    const ignition = sign && (sign > 0 ? cv >= 100 && mv.histogram > mv.previousHistogram : cv <= -100 && mv.histogram < mv.previousHistogram);
    let score = pattern.strength + (aligned ? 14 : 0) + (ignition ? 10 : 0) + (volumeRatio >= 2 ? 12 : volumeRatio >= 1.5 ? 8 : volumeRatio >= 1.2 ? 4 : 0);
    if (pattern.type === 'NEUTRO') score = Math.min(score, 49);
    else if (volumeRatio < .8) score = Math.min(score, 64);
    else if (volumeRatio < 1.2) score = Math.min(score, 79);
    return { config: configName, pattern, direction: pattern.direction, score: clamp(Math.round(score)), rsi: rv, cci: cv, macd: mv, volumeRatio, momentumAligned: !!aligned, ignition: !!ignition };
  }
  function evaluate(candles, configName, horizon = 48, minimumScore = 70) {
    const targets = Object.fromEntries(TARGETS.map(x => [x, 0])), groups = new Map(), signals = [], warmup = 80;
    for (let i = warmup; i < candles.length - horizon; i++) {
      const result = analyze(candles.slice(0, i + 1), configName);
      if (result.direction === 'NEUTRAL' || result.score < minimumScore) continue;
      const entry = candles[i].c, future = candles.slice(i + 1, i + 1 + horizon);
      const up = (Math.max(...future.map(x => x.h)) - entry) / entry * 100, down = (entry - Math.min(...future.map(x => x.l))) / entry * 100;
      const favorable = result.direction === 'BUY' ? up : result.direction === 'SELL' ? down : Math.max(up, down);
      const adverse = result.direction === 'BUY' ? -down : result.direction === 'SELL' ? -up : -Math.min(up, down);
      signals.push({ i, time: candles[i].t, entry, favorable, adverse, ...result });
      TARGETS.forEach(t => { if (favorable >= t) targets[t]++; });
      const key = `${result.pattern.type}: ${result.pattern.name}`, g = groups.get(key) || { pattern: key, signals: 0, favorable: 0, sum: 0, targets: Object.fromEntries(TARGETS.map(x => [x, 0])) };
      g.signals++; g.sum += favorable; if (favorable > 0) g.favorable++;
      TARGETS.forEach(t => { if (favorable >= t) g.targets[t]++; });
      groups.set(key, g); i += Math.max(0, Math.floor(horizon / 4) - 1);
    }
    return { config: configName, horizon, signals, targets, patterns: [...groups.values()].map(g => ({ ...g, average: g.sum / g.signals })).sort((a, b) => b.targets[10] - a.targets[10] || b.average - a.average) };
  }
  function marketRegime(candles) {
    const close = candles.map(x => x.c), e20 = ema(close, 20).at(-1), e50 = ema(close, 50).at(-1), currentAtr = atr(candles, 14), oldAtr = atr(candles.slice(0, -8), 14);
    const trendSlope = slope(close.slice(-20)), distance = Math.abs(e20 - e50), trendGate = (currentAtr || close.at(-1) * .005) * .5;
    if (Number.isFinite(oldAtr) && currentAtr < oldAtr * .8) return 'COMPRESSÃO';
    if (Number.isFinite(oldAtr) && currentAtr > oldAtr * 1.25) return 'EXPANSÃO';
    if (e20 > e50 && trendSlope > 0 && distance >= trendGate) return 'ALTA';
    if (e20 < e50 && trendSlope < 0 && distance >= trendGate) return 'BAIXA';
    return 'LATERAL';
  }
  function outcome(candles, index, horizon, direction) {
    const entry = candles[index].c, future = candles.slice(index + 1, index + 1 + horizon);
    const up = (Math.max(...future.map(x => x.h)) - entry) / entry * 100, down = (entry - Math.min(...future.map(x => x.l))) / entry * 100;
    const mfe = direction === 'BUY' ? up : direction === 'SELL' ? down : Math.max(up, down);
    const mae = direction === 'BUY' ? -down : direction === 'SELL' ? -up : -Math.min(up, down);
    const targetBars = {};
    for (const target of TARGETS) {
      const found = future.findIndex(x => direction === 'BUY' ? (x.h - entry) / entry * 100 >= target : direction === 'SELL' ? (entry - x.l) / entry * 100 >= target : Math.max((x.h - entry) / entry * 100, (entry - x.l) / entry * 100) >= target);
      targetBars[target] = found >= 0 ? found + 1 : null;
    }
    return { entry, mfe, mae, targetBars };
  }
  function collectWalkForward(candles, config, start, end, horizon, minimumScore) {
    const rows = [];
    let nextEligible = start;
    for (let index = Math.max(80, start); index < end - horizon; index++) {
      if (index < nextEligible) continue;
      const history = candles.slice(0, index + 1), result = analyze(history, config);
      if (result.direction === 'NEUTRAL' || result.score < minimumScore) continue;
      const resultOutcome = outcome(candles, index, horizon, result.direction);
      rows.push({
        id: `${candles[index].t}-${config}-${result.pattern.name}-${result.direction}`,
        index, time: candles[index].t, config, regime: marketRegime(history),
        patternType: result.pattern.type, pattern: result.pattern.name,
        direction: result.direction, score: result.score, volumeRatio: result.volumeRatio,
        ...resultOutcome
      });
      nextEligible = index + horizon;
    }
    return rows;
  }
  function summarizeWalkRows(rows) {
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.patternType}|${row.pattern}|${row.regime}`;
      const group = groups.get(key) || { key, patternType: row.patternType, pattern: row.pattern, regime: row.regime, n: 0, mfe: 0, mae: 0, score: 0, volume: 0, targets: Object.fromEntries(TARGETS.map(target => [target, 0])), bars10: [] };
      group.n++; group.mfe += row.mfe; group.mae += row.mae; group.score += row.score; group.volume += row.volumeRatio;
      for (const target of TARGETS) if (row.targetBars[target] != null) group.targets[target]++;
      if (row.targetBars[10] != null) group.bars10.push(row.targetBars[10]);
      groups.set(key, group);
    }
    return [...groups.values()].map(group => ({
      ...group,
      avgMfe: group.mfe / group.n,
      avgMae: group.mae / group.n,
      avgScore: group.score / group.n,
      avgVolume: group.volume / group.n,
      avgBars10: group.bars10.length ? avg(group.bars10) : null,
      rates: Object.fromEntries(TARGETS.map(target => [target, group.targets[target] / group.n * 100]))
    }));
  }
  function walkForward(candles, config, horizon = 48, minimumScore = 70) {
    const split = Math.floor(candles.length * .7), trainRows = collectWalkForward(candles, config, 0, split, horizon, minimumScore), validationRows = collectWalkForward(candles, config, split, candles.length, horizon, minimumScore);
    const trainGroups = new Map(summarizeWalkRows(trainRows).map(row => [row.key, row])), validationGroups = summarizeWalkRows(validationRows);
    const neutral = validationRows.filter(row => row.direction === 'NEUTRAL');
    const neutralRate10 = neutral.length ? neutral.filter(row => row.targetBars[10] != null).length / neutral.length * 100 : 0;
    const comparisons = validationGroups.map(validation => {
      const train = trainGroups.get(validation.key) || null;
      const stable = !train || !train.rates[10] || validation.rates[10] >= train.rates[10] * .5;
      const beatsControl = validation.rates[10] > neutralRate10 * 1.25;
      const riskOk = validation.avgMfe > Math.abs(validation.avgMae);
      let status = 'INCONCLUSIVO';
      if (validation.n >= 20 && beatsControl && riskOk && stable) status = 'PROMISSOR';
      else if (validation.n >= 20 && (!beatsControl || !riskOk)) status = 'REJEITAR';
      return { key: validation.key, train, validation, neutralRate10, stable, beatsControl, riskOk, status };
    }).sort((a, b) => (a.status === 'PROMISSOR' ? -1 : b.status === 'PROMISSOR' ? 1 : 0) || b.validation.rates[10] - a.validation.rates[10] || b.validation.n - a.validation.n);
    return { version: 1, config, split, trainSize: split, validationSize: candles.length - split, horizon, minimumScore, neutralRate10, trainSignals: trainRows.length, validationSignals: validationRows.length, comparisons };
  }
  const normalizeB3 = rows => (rows || []).map(x => ({ t: +(x.date || x.datetime || x.timestamp || 0) * (+(x.date || 0) < 1e12 ? 1000 : 1), o: +(x.open ?? x.close), h: +(x.high ?? x.close), l: +(x.low ?? x.close), c: +x.close, v: +(x.volume || 0) })).filter(x => [x.o, x.h, x.l, x.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  async function fetchCandles(market, symbol, timeframe) {
    const tf = TF[timeframe] || TF.M15;
    if (market === 'crypto') {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf.interval}&limit=1000`, { cache: 'no-store' });
      if (!response.ok) throw Error(`Binance HTTP ${response.status}`);
      return (await response.json()).map(x => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
    }
    const token = localStorage.getItem('brapi_token') || '';
    if (!token) throw Error('Token BRAPI não salvo');
    const response = await fetch(`https://brapi.dev/api/v2/stocks/historical?symbols=${encodeURIComponent(symbol)}&range=${tf.b3Range}&interval=${tf.interval}&sortOrder=asc`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(payload.message || `BRAPI HTTP ${response.status}`);
    const item = payload?.results?.[0] || {}, data = item.data || item;
    return normalizeB3(data.historicalDataPrice || data.historical || data.prices || []);
  }
  const pct = n => `${Number(n || 0).toFixed(1)}%`;
  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function writeHistory(rows) {
    const limited = rows.slice(-HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(limited));
    return limited;
  }
  function readBacktests() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BACKTEST_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function storeBacktest(market, symbol, timeframe, horizon, minimumScore, candles, results, walkForwardResults) {
    const rows = readBacktests();
    rows.push({
      version: 1, testedAt: new Date().toISOString(), market, symbol, timeframe, horizon, minimumScore,
      candles: candles.length,
      configurations: results.map(result => ({
        config: result.config,
        signals: result.signals.length,
        targets: result.targets,
        patterns: result.patterns,
        walkForward: walkForwardResults.find(item => item.config === result.config)
      }))
    });
    localStorage.setItem(BACKTEST_KEY, JSON.stringify(rows.slice(-BACKTEST_LIMIT)));
  }
  function followAndStore(candles, market, symbol, timeframe, horizon, minimumScore) {
    const latest = candles.at(-1), rows = readHistory();
    for (const row of rows.filter(x => x.status === 'ATIVO' && x.market === market && x.symbol === symbol && x.timeframe === timeframe)) {
      const future = candles.filter(x => x.t > row.entryTime);
      if (!future.length) continue;
      row.observedBars = future.length;
      row.lastTime = latest.t;
      row.lastPrice = latest.c;
      const up = (Math.max(...future.map(x => x.h)) - row.entryPrice) / row.entryPrice * 100, down = (row.entryPrice - Math.min(...future.map(x => x.l))) / row.entryPrice * 100;
      const favorable = row.direction === 'BUY' ? up : row.direction === 'SELL' ? down : Math.max(up, down);
      const adverse = row.direction === 'BUY' ? -down : row.direction === 'SELL' ? -up : -Math.min(up, down);
      row.maxFavorablePct = Math.max(row.maxFavorablePct || 0, favorable);
      row.maxAdversePct = Math.min(row.maxAdversePct || 0, adverse);
      row.targets = Object.fromEntries(TARGETS.map(target => [target, row.maxFavorablePct >= target]));
      if (row.observedBars >= row.horizon || row.targets[50]) {
        row.status = 'AVALIADO';
        row.closedAt = latest.t;
        row.closeReason = row.targets[50] ? 'ALVO_50' : 'HORIZONTE';
      }
    }
    for (const config of Object.keys(CONFIGS)) {
      const result = analyze(candles, config);
      if (result.direction === 'NEUTRAL' || result.score < minimumScore) continue;
      const active = rows.find(row => row.status === 'ATIVO' && row.market === market && row.symbol === symbol && row.timeframe === timeframe && row.config === config);
      if (active && active.direction === result.direction && active.pattern === result.pattern.name) continue;
      if (active) {
        active.status = 'AVALIADO';
        active.closedAt = latest.t;
        active.closeReason = 'MUDANÇA_DE_SINAL';
      }
      rows.push({
        id: `${market}-${symbol}-${timeframe}-${config}-${latest.t}`,
        version: 1, market, symbol, timeframe, config,
        configLabel: CONFIGS[config].label,
        direction: result.direction,
        patternType: result.pattern.type,
        pattern: result.pattern.name,
        score: result.score,
        rsi: result.rsi,
        cci: result.cci,
        macdHistogram: result.macd.histogram,
        volumeRatio: result.volumeRatio,
        ignition: result.ignition,
        entryTime: latest.t,
        entryPrice: latest.c,
        lastTime: latest.t,
        lastPrice: latest.c,
        horizon,
        minimumScore,
        observedBars: 0,
        maxFavorablePct: 0,
        maxAdversePct: 0,
        targets: Object.fromEntries(TARGETS.map(target => [target, false])),
        status: 'ATIVO'
      });
    }
    const saved = writeHistory(rows);
    renderHistory(saved);
    return saved;
  }
  function renderHistory(rows = readHistory()) {
    const root = document.querySelector('#patternLabHistory');
    if (!root) return;
    const active = rows.filter(x => x.status === 'ATIVO'), evaluated = rows.filter(x => x.status === 'AVALIADO'), backtests = readBacktests();
    const targetCounts = Object.fromEntries(TARGETS.map(target => [target, rows.filter(row => row.targets?.[target]).length]));
    const recent = [...rows].sort((a, b) => b.entryTime - a.entryTime).slice(0, 12);
    root.innerHTML = `<div class="pattern-lab-kpis"><span>Episódios<b>${rows.length}</b></span><span>Em acompanhamento<b>${active.length}</b></span><span>Avaliados<b>${evaluated.length}</b></span><span>Backtests salvos<b>${backtests.length}</b></span>${TARGETS.slice(0, 2).map(target => `<span>Alvo ${target}%<b>${targetCounts[target]}</b></span>`).join('')}</div><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>Ativo</th><th>TF</th><th>Configuração</th><th>Padrão</th><th>Direção</th><th>Score</th><th>Máx. movimento</th><th>Alvos</th><th>Status</th></tr></thead><tbody>${recent.length ? recent.map(row => `<tr><td>${row.symbol}</td><td>${row.timeframe}</td><td>${row.config === 'candidata' ? 'Candidata' : 'Controle'}</td><td>${row.pattern}</td><td>${row.direction === 'BUY' ? 'ALTA' : row.direction === 'SELL' ? 'QUEDA' : 'NEUTRO'}</td><td>${row.score}</td><td>${pct(row.maxFavorablePct)}</td><td>${TARGETS.filter(target => row.targets?.[target]).map(target => `${target}%`).join(', ') || '—'}</td><td>${row.status === 'ATIVO' ? 'ACOMPANHANDO' : 'AVALIADO'}</td></tr>`).join('') : '<tr><td colspan="9">Nenhum sinal experimental armazenado.</td></tr>'}</tbody></table></div><p class="sub">Armazenamento local deste navegador • máximo ${HISTORY_LIMIT} episódios e ${BACKTEST_LIMIT} backtests • sem uso do Supabase.</p>`;
  }
  function exportHistory() {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), signals: readHistory(), backtests: readBacktests() }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ep-padroes-historico-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function resultHtml(result) {
    const total = result.signals.length;
    return `<section class="pattern-lab-result"><h4>${CONFIGS[result.config].label}</h4><div class="pattern-lab-kpis"><span>Sinais<b>${total}</b></span>${TARGETS.map(t => `<span>Alvo ${t}%<b>${result.targets[t]}</b><small>${total ? pct(result.targets[t] / total * 100) : '—'}</small></span>`).join('')}</div><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>Padrão</th><th>Sinais</th><th>Favoráveis</th><th>Média</th>${TARGETS.map(t => `<th>≥${t}%</th>`).join('')}</tr></thead><tbody>${result.patterns.length ? result.patterns.map(g => `<tr><td>${g.pattern}</td><td>${g.signals}</td><td>${pct(g.favorable / g.signals * 100)}</td><td>${pct(g.average)}</td>${TARGETS.map(t => `<td>${g.targets[t]}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="9">Nenhum sinal elegível nesta amostra.</td></tr>'}</tbody></table></div></section>`;
  }
  function walkForwardHtml(reports) {
    return reports.map(report => `<section class="pattern-lab-result"><h4>WALK-FORWARD 70/30 — ${CONFIGS[report.config].label}</h4><p class="sub">Desenvolvimento: ${report.trainSize} candles/${report.trainSignals} sinais • Validação: ${report.validationSize} candles/${report.validationSignals} sinais • Controle neutro ≥10%: ${pct(report.neutralRate10)}</p><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>Padrão + regime</th><th>Amostra validação</th><th>≥10% treino</th><th>≥10% validação</th><th>MFE médio</th><th>MAE médio</th><th>Volume</th><th>Candles até 10%</th><th>Conclusão</th></tr></thead><tbody>${report.comparisons.length ? report.comparisons.slice(0, 20).map(row => `<tr><td>${row.validation.pattern}<small> • ${row.validation.regime}</small></td><td>${row.validation.n}</td><td>${row.train ? pct(row.train.rates[10]) : '—'}</td><td>${pct(row.validation.rates[10])}</td><td>${pct(row.validation.avgMfe)}</td><td>${pct(row.validation.avgMae)}</td><td>${row.validation.avgVolume.toFixed(2)}x</td><td>${row.validation.avgBars10 == null ? '—' : row.validation.avgBars10.toFixed(1)}</td><td class="${row.status === 'PROMISSOR' ? 'buy' : row.status === 'REJEITAR' ? 'sell' : 'wait'}"><b>${row.status}</b></td></tr>`).join('') : '<tr><td colspan="9">Amostra insuficiente.</td></tr>'}</tbody></table></div><p class="sub">PROMISSOR exige ≥20 sinais na validação, superar o controle neutro em 25%, MFE maior que MAE e estabilidade em relação ao desenvolvimento.</p></section>`).join('');
  }
  function fillAssets() {
    const market = document.querySelector('#patternLabMarket')?.value || 'crypto', select = document.querySelector('#patternLabAsset');
    if (!select) return;
    const crypto = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','MATICUSDT','LTCUSDT','BCHUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','XLMUSDT','FILUSDT','APTUSDT','ARBUSDT','OPUSDT','NEARUSDT','INJUSDT','SUIUSDT','PEPEUSDT'].map(x => [x, x.replace('USDT','')]);
    const b3 = ['PETR4','VALE3','ITUB4','BBAS3','BBDC4','B3SA3','PRIO3','WEGE3','EMBR3','RENT3','SUZB3','ELET3','EQTL3','RADL3','GGBR4','CSNA3','MGLU3','HAPV3','BHIA3','ABEV3'].map(x => [x, x]);
    const items = market === 'crypto' ? crypto : b3;
    select.innerHTML = items.map(([symbol, name]) => `<option value="${symbol}">${market === 'crypto' ? `${name}/USDT` : `${symbol} — ${name}`}</option>`).join('');
  }
  async function run() {
    const market = document.querySelector('#patternLabMarket').value, symbol = document.querySelector('#patternLabAsset').value, timeframe = document.querySelector('#patternLabTf').value;
    const horizon = +document.querySelector('#patternLabHorizon').value, score = +document.querySelector('#patternLabScore').value;
    const status = document.querySelector('#patternLabStatus'), output = document.querySelector('#patternLabOutput');
    status.textContent = `Carregando ${symbol} ${timeframe}...`; output.innerHTML = '';
    try {
      const candles = await fetchCandles(market, symbol, timeframe);
      if (candles.length < horizon + 80) throw Error(`Amostra insuficiente: ${candles.length} candles`);
      const current = evaluate(candles, 'atual', horizon, score), candidate = evaluate(candles, 'candidata', horizon, score);
      const walkReports = [walkForward(candles, 'atual', horizon, score), walkForward(candles, 'candidata', horizon, score)];
      storeBacktest(market, symbol, timeframe, horizon, score, candles, [current, candidate], walkReports);
      const history = followAndStore(candles, market, symbol, timeframe, horizon, score);
      output.innerHTML = `<p class="sub">${candles.length} candles. Alvos medidos pela máxima excursão favorável após o sinal; não representam lucro garantido.</p>${walkForwardHtml(walkReports)}${resultHtml(current)}${resultHtml(candidate)}`;
      status.textContent = `Concluído • ${symbol} • ${timeframe} • ${history.length} episódios armazenados localmente`;
    } catch (error) { status.textContent = `Falha no teste: ${error.message}`; }
  }
  function init() {
    if (document.querySelector('#patternIndicatorLab')) return;
    const anchor = document.querySelector('main'); if (!anchor) return;
    const section = document.createElement('section'); section.id = 'patternIndicatorLab'; section.className = 'card';
    section.innerHTML = `<div class="section-head"><h2>TESTE DE INDICADORES + PADRÕES — ALVOS 10% A 50%</h2><span class="signal-badge warn">EXPERIMENTAL • NÃO ALTERA OS 5 MOTORES</span></div><p class="sub">Compara o controle atual com RSI 14, CCI 20 e MACD 12/26/9. Os resultados ficam somente neste navegador.</p><div class="pattern-lab-controls"><label>Mercado<select id="patternLabMarket"><option value="crypto">Cripto</option><option value="b3">B3</option></select></label><label>Ativo<select id="patternLabAsset"></select></label><label>Período<select id="patternLabTf"><option>M5</option><option selected>M15</option><option>M30</option><option>H1</option></select></label><label>Horizonte<select id="patternLabHorizon"><option value="24">24 candles</option><option value="48" selected>48 candles</option><option value="96">96 candles</option></select></label><label>Pontuação mínima<select id="patternLabScore"><option>60</option><option selected>70</option><option>80</option></select></label><button id="patternLabRun">Executar e registrar</button></div><div id="patternLabStatus" class="sub">Aguardando execução manual.</div><div id="patternLabOutput"></div><section class="pattern-lab-result"><div class="section-head"><h3>HISTÓRICO EXPERIMENTAL LOCAL</h3><button id="patternLabExport" class="secondary" style="width:auto">Exportar JSON</button></div><div id="patternLabHistory"></div></section>`;
    anchor.appendChild(section);
    const style = document.createElement('style'); style.textContent = '.pattern-lab-controls{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr)) 150px;gap:10px;align-items:end}.pattern-lab-result{margin-top:14px;padding:12px;background:#091827;border:1px solid #29415e;border-radius:10px}.pattern-lab-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:10px 0}.pattern-lab-kpis span{padding:8px;background:#0d1a2b;border-radius:7px;font-size:11px}.pattern-lab-kpis b,.pattern-lab-kpis small{display:block;margin-top:3px}@media(max-width:900px){.pattern-lab-controls,.pattern-lab-kpis{grid-template-columns:repeat(2,1fr)}}'; document.head.appendChild(style);
    fillAssets(); renderHistory(); document.querySelector('#patternLabMarket').addEventListener('change', fillAssets); document.querySelector('#patternLabRun').addEventListener('click', run); document.querySelector('#patternLabExport').addEventListener('click', exportHistory);
  }
  window.EPPatternIndicatorLab = { analyze, classifyPattern, evaluate, walkForward, marketRegime, readHistory, readBacktests, followAndStore, configs: CONFIGS, targets: TARGETS };
  setTimeout(init, 900);
})();
