/* Independent research lab. Never writes official EP Whale signals or remote data. */
(() => {
  'use strict';
  const VERSION = 'patterns-obv-v2';
  const KEY = 'ep_structure_volume_lab_v2';
  const TF = { '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000 };
  const TARGETS = [5, 10, 20, 30, 50];
  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const slope = v => {
    if (v.length < 3) return 0;
    const m = avg(v), c = (v.length - 1) / 2;
    let n = 0, d = 0;
    v.forEach((x, i) => { const z = i - c; n += z * (x - m); d += z * z; });
    return d ? n / d : 0;
  };
  function rsi(c, p = 14) {
    if (c.length <= p) return NaN;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = c[i].c - c[i - 1].c; g += Math.max(d, 0); l += Math.max(-d, 0); }
    g /= p; l /= p;
    for (let i = p + 1; i < c.length; i++) {
      const d = c[i].c - c[i - 1].c;
      g = (g * (p - 1) + Math.max(d, 0)) / p;
      l = (l * (p - 1) + Math.max(-d, 0)) / p;
    }
    return !g && !l ? 50 : !l ? 100 : 100 - 100 / (1 + g / l);
  }
  function obv(c) {
    const out = [0];
    for (let i = 1; i < c.length; i++) out.push(out[i - 1] + Math.sign(c[i].c - c[i - 1].c) * c[i].v);
    return out;
  }
  function swings(c, field, high) {
    const out = [];
    for (let i = 2; i < c.length - 2; i++) {
      const x = c[i][field];
      const ok = high ? x > c[i - 1][field] && x >= c[i + 1][field] : x < c[i - 1][field] && x <= c[i + 1][field];
      if (ok) out.push({ i, x });
    }
    return out;
  }
  function candleReversal(b, a) {
    const body = Math.abs(b.c - b.o), range = Math.max(b.h - b.l, 1e-12);
    const hammer = b.c >= b.o && Math.min(b.o, b.c) - b.l >= body * 2 && b.h - Math.max(b.o, b.c) <= Math.max(body, range * .12);
    const engulf = b.c > b.o && a.c < a.o && b.o <= a.c && b.c >= a.o;
    return { hammer, engulf };
  }
  function context(c) {
    const w = c.slice(-96), b = w.at(-1), prev20 = w.slice(-21, -1), meanVol = avg(prev20.map(x => x.v));
    const volumeRatio = meanVol > 0 ? b.v / meanVol : 0;
    const o = obv(w), obvUp = o.length >= 6 && o.at(-1) > o.at(-6), obvDown = o.length >= 6 && o.at(-1) < o.at(-6);
    return { w, b, prev20, meanVol, volumeRatio, obvUp, obvDown, rv: rsi(w) };
  }
  function scoreSignal(base, ctx, direction, breakout, retest, forming = false) {
    let score = base;
    const obvOk = direction === 'BUY' ? ctx.obvUp : ctx.obvDown;
    if (obvOk) score += 8;
    if (ctx.volumeRatio >= 2) score += 12; else if (ctx.volumeRatio >= 1.5) score += 8; else if (ctx.volumeRatio >= 1.2) score += 4;
    if (breakout) score += 10;
    if (retest) score += 6;
    if (forming) score = Math.min(score, 79);
    if (ctx.volumeRatio < .8) score = Math.min(score, 69);
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  function detect(c, tf) {
    if (c.length < 60) return [];
    const ctx = context(c), { w, b, prev20, volumeRatio, obvUp, rv } = ctx;
    if (!Number.isFinite(rv) || rv > 85) return [];
    const out = [];
    const high20 = Math.max(...prev20.map(x => x.h)), low20 = Math.min(...prev20.map(x => x.l));
    const recent8 = w.slice(-9, -1), prior8 = w.slice(-17, -9);
    const impulse = prior8.length === 8 ? prior8.at(-1).c / prior8[0].o - 1 : 0;
    const recentHigh = Math.max(...recent8.map(x => x.h)), recentLow = Math.min(...recent8.map(x => x.l));
    const consolidation = (recentHigh - recentLow) / Math.max(recentLow, 1e-12);
    const flagShape = impulse >= .025 && consolidation <= impulse * .7 && slope(recent8.map(x => x.c)) <= 0;
    const pennantShape = impulse >= .025 && slope(recent8.map(x => x.h)) < 0 && slope(recent8.map(x => x.l)) > 0;
    const boxRange = (high20 - low20) / Math.max(low20, 1e-12);
    const boxShape = boxRange <= .035;
    const highs18 = w.slice(-19, -1).map(x => x.h), lows18 = w.slice(-19, -1).map(x => x.l);
    const ascTri = Math.abs(slope(highs18)) <= Math.abs(slope(lows18)) * .3 && slope(lows18) > 0;
    const fallingWedge = slope(highs18) < 0 && slope(lows18) < 0 && Math.abs(slope(highs18)) > Math.abs(slope(lows18));
    const peaks = swings(w, 'h', true), valleys = swings(w, 'l', false);
    const v1 = valleys.at(-2), v2 = valleys.at(-1);
    const tol = b.c * .008;
    const bottomNeckline = v1 && v2 ? Math.max(...w.slice(v1.i, v2.i + 1).map(x => x.h)) : NaN;
    const doubleBottom = !!(v1 && v2 && v2.i - v1.i >= 6 && Math.abs(v1.x - v2.x) <= tol && b.c > bottomNeckline);
    let inverseHns = false, hnsNeck = NaN;
    if (valleys.length >= 3) {
      const a = valleys.at(-3), h = valleys.at(-2), r = valleys.at(-1);
      const shoulders = Math.abs(a.x - r.x) <= tol * 1.5;
      const headLower = h.x < Math.min(a.x, r.x) - tol * .4;
      if (shoulders && headLower && r.i - a.i >= 10) {
        hnsNeck = Math.max(...w.slice(a.i, r.i + 1).map(x => x.h));
        inverseHns = b.c > hnsNeck;
      }
    }
    const rev = candleReversal(b, w.at(-2));
    const retest = level => w.length >= 3 && w.at(-2).l <= level * 1.006 && w.at(-2).c >= level * .995 && b.c >= level;
    const add = (pattern, base, level, breakout, ret, stage = 'FORMAÇÃO') => {
      const score = scoreSignal(base, ctx, 'BUY', breakout, ret, !breakout);
      out.push({ pattern, direction: 'BUY', stage: breakout ? (ret ? 'RETESTE CONFIRMADO' : 'BREAKOUT CONFIRMADO') : stage, score, rsi: rv, volumeRatio, obv: obvUp ? 'ALTA' : 'SEM CONFIRMAÇÃO', breakout: !!breakout, retest: !!ret, level });
    };
    if (flagShape) { const br = b.c > recentHigh; add('Bull Flag', 66, recentHigh, br, br && retest(recentHigh)); }
    if (pennantShape) { const br = b.c > recentHigh; add('Bull Pennant', 66, recentHigh, br, br && retest(recentHigh)); }
    if (boxShape) { const br = b.c > high20; add('Caixote / Rectangle', 68, high20, br, br && retest(high20)); }
    if (ascTri) { const level = Math.max(...highs18); const br = b.c > level; add('Triângulo Ascendente', 66, level, br, br && retest(level)); }
    if (fallingWedge) { const level = Math.max(...w.slice(-9, -1).map(x => x.h)); const br = b.c > level; add('Falling Wedge / Cunha Descendente', 64, level, br, br && retest(level)); }
    if (doubleBottom) add('Double Bottom / Fundo Duplo', 74, bottomNeckline, true, retest(bottomNeckline));
    if (inverseHns) add('OCO Invertido', 76, hnsNeck, true, retest(hnsNeck));
    if (rev.hammer || rev.engulf) {
      const p = rev.engulf ? 'Bullish Engulfing / Engolfo de Alta' : 'Martelo';
      const level = Math.max(...w.slice(-6, -1).map(x => x.h));
      const br = b.c > level;
      add(p, 62, level, br, br && retest(level), 'REVERSÃO EM FORMAÇÃO');
    }
    return out.sort((a, b) => b.score - a.score);
  }
  function evaluate(input, tf, now = Date.now(), horizon = 48, minimumScore = 80) {
    if (!TF[tf]) throw Error('Selecione M5, M15, M30 ou H1.');
    const c = input.filter(x => x.t + TF[tf] <= now);
    if (c.length < 96) throw Error('Histórico insuficiente: mínimo de 96 candles fechados.');
    c.forEach((x, i) => {
      if (![x.t, x.o, x.h, x.l, x.c, x.v].every(Number.isFinite) || x.o <= 0 || x.c <= 0 || x.l <= 0 || x.v < 0 || x.h < Math.max(x.o, x.c) || x.l > Math.min(x.o, x.c) || (i && x.t - c[i - 1].t !== TF[tf])) throw Error('Candles inválidos, incompletos ou de outro intervalo.');
    });
    const rows = [], cooldown = new Map();
    for (let i = 95; i < c.length - 1; i++) {
      for (const signal of detect(c.slice(0, i + 1), tf)) {
        if (signal.score < minimumScore || !signal.breakout) continue;
        if (i <= (cooldown.get(signal.pattern) ?? -1)) continue;
        const future = c.slice(i + 1, i + 1 + horizon), entry = future[0]?.o || c[i].c;
        if (!future.length) continue;
        const mfe = (Math.max(...future.map(x => x.h)) / entry - 1) * 100;
        const mae = (Math.min(...future.map(x => x.l)) / entry - 1) * 100;
        const targets = Object.fromEntries(TARGETS.map(t => [t, mfe >= t]));
        rows.push({ ...signal, time: c[i].t, entryTime: future[0].t, entry, bars: future.length, horizon, status: future.length === horizon ? 'AVALIADO' : 'PARCIAL', mfe: Math.max(0, mfe), mae: Math.min(0, mae), targets });
        cooldown.set(signal.pattern, i + Math.max(4, Math.floor(horizon / 4)));
      }
    }
    return { version: VERSION, timeframe: tf, candles: c.length, horizon, minimumScore, rows };
  }
  const api = { detect, evaluate, obv, rsi, VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  window.EPStructureVolumeLab = api;
  function mount() {
    const host = document.querySelector('main');
    if (!host || document.getElementById('structureVolumeLab')) return;
    const panel = document.createElement('details'); panel.id = 'structureVolumeLab'; panel.className = 'card';
    panel.innerHTML = '<summary>Experimento expandido — Padrões + OBV + Breakout/Reteste</summary><p><strong>Laboratório isolado.</strong> Prioridade H1 • 96 candles fechados • score ≥80 • 48 candles de avaliação • sem ordens reais e sem acesso aos 5 motores do EP Whale.</p><p>Detectores: Bull Flag • Bull Pennant • Caixote • Triângulo Ascendente • Falling Wedge • Fundo Duplo • OCO Invertido • Martelo/Engolfo.</p><button type="button" data-run>Testar candles carregados</button> <button type="button" data-export>Exportar experimento</button><p data-result>Aguardando teste manual.</p><small>Formação e breakout são separados. Apenas padrões com breakout confirmado e score ≥80 entram no backtest. OBV, volume e reteste funcionam como confirmações experimentais.</small>';
    const central = document.getElementById('decisionCenter')?.closest('section');
    if (central) central.before(panel); else host.prepend(panel);
    const output = panel.querySelector('[data-result]');
    function read() { const data = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(data) ? data : []; }
    panel.querySelector('[data-run]').onclick = () => {
      try {
        const tf = window.LabData?.interval, symbol = window.LabData?.symbol, loaded = window.LabData?.candles;
        if (!loaded?.length) throw Error('Carregue ou importe candles primeiro.');
        const candles = loaded.map(x => ({ t:+x.time, o:+x.open, h:+x.high, l:+x.low, c:+x.close, v:+x.volume }));
        const report = { ...evaluate(candles, tf, Date.now(), 48, 80), symbol, testedAt: new Date().toISOString() };
        const history = read(); history.push(report); while (history.length > 100) history.shift(); localStorage.setItem(KEY, JSON.stringify(history));
        const done = report.rows.filter(x => x.status === 'AVALIADO');
        const counts = TARGETS.map(t => `≥${t}%: ${done.filter(x => x.mfe >= t).length}`).join(' | ');
        output.textContent = `${symbol} ${tf} • ${report.candles} candles • ${report.rows.length} sinais score≥80 • ${counts}`;
      } catch (e) { output.textContent = `Teste não salvo: ${e.message}`; }
    };
    panel.querySelector('[data-export]').onclick = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: VERSION, exportedAt: new Date().toISOString(), tests: read() }, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'ep-laboratorio-padroes-obv-v2.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
