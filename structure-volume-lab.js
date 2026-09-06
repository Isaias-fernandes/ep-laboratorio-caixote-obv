/* Independent, manual research lab. Never writes official signals or remote data. */
(() => {
  'use strict';
  const VERSION = 'box-flag-obv-v1';
  const KEY = 'ep_structure_volume_lab_v1';
  const TF = { '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000 };
  const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  function rsi(c) {
    let g = 0, l = 0;
    for (let i = 1; i <= 14; i++) { const d = c[i].c - c[i - 1].c; g += Math.max(d, 0); l += Math.max(-d, 0); }
    g /= 14; l /= 14;
    for (let i = 15; i < c.length; i++) { const d = c[i].c - c[i - 1].c; g = (g * 13 + Math.max(d, 0)) / 14; l = (l * 13 + Math.max(-d, 0)) / 14; }
    return !g && !l ? 50 : !l ? 100 : 100 - 100 / (1 + g / l);
  }
  function obv(c) {
    const out = [0];
    for (let i = 1; i < c.length; i++) out.push(out[i - 1] + Math.sign(c[i].c - c[i - 1].c) * c[i].v);
    return out;
  }
  function reversal(b, a) {
    const body = Math.abs(b.c - b.o), range = b.h - b.l;
    return b.c > b.o && ((range > 0 && body > 0 && Math.min(b.o, b.c) - b.l >= 2 * body && b.h - Math.max(b.o, b.c) <= Math.max(body, range * .12)) || (a.c < a.o && b.o <= a.c && b.c >= a.o));
  }
  function detect(c, tf) {
    if (c.length < 45) return [];
    const b = c.at(-1), prev = c.slice(-21, -1), meanVolume = avg(prev.map(x => x.v));
    const rv = rsi(c), o = obv(c), rising = o.at(-1) > o.at(-6);
    if (rv > 85 || !rising || meanVolume <= 0) return [];
    const result = [], high = Math.max(...prev.map(x => x.h)), low = Math.min(...prev.map(x => x.l));
    if (['15m', '30m', '1h'].includes(tf) && (high - low) / low <= .03 && b.c > high && b.v >= 3 * meanVolume)
      result.push({ pattern: 'Caixote + volume 3x + OBV', rsi: rv, volumeRatio: b.v / meanVolume, level: high });
    if (['5m', '15m'].includes(tf)) {
      // All breakout/retest decisions use only information available at this candle.
      for (let distance = 1; distance <= 4; distance++) {
        const j = c.length - 1 - distance, flag = c.slice(j - 8, j), pole = c.slice(j - 16, j - 8);
        const resistance = Math.max(...flag.map(x => x.h)), floor = Math.min(...flag.map(x => x.l));
        const impulse = pole.at(-1).c / pole[0].o - 1;
        const breakout = c[j], baseVolume = avg(c.slice(j - 20, j).map(x => x.v));
        const anchored = c.slice(j - 16), volume = anchored.reduce((s, x) => s + x.v, 0);
        const avwap = volume ? anchored.reduce((s, x) => s + (x.h + x.l + x.c) / 3 * x.v, 0) / volume : Infinity;
        if (impulse >= .10 && (resistance - floor) / floor <= impulse * .5 && flag.at(-1).c <= flag[0].c && avg(flag.map(x => x.v)) < avg(pole.map(x => x.v)) && baseVolume > 0 && breakout.c > resistance && breakout.v >= 2 * baseVolume && c.slice(j + 1).every(x => x.c >= resistance * .995) && b.l <= resistance * 1.005 && b.c >= resistance && b.c > avwap && reversal(b, c.at(-2))) {
          result.push({ pattern: 'Bandeira + reteste + OBV/VWAP ancorada', rsi: rv, volumeRatio: breakout.v / baseVolume, level: resistance });
          break;
        }
      }
    }
    return result;
  }
  function evaluate(input, tf, now = Date.now(), horizon = 48) {
    if (!TF[tf]) throw Error('Selecione M5, M15, M30 ou H1 no painel Cripto.');
    const c = input.filter(x => x.t + TF[tf] <= now);
    if (c.length < 46) throw Error('Histórico insuficiente: mínimo de 46 candles fechados.');
    c.forEach((x, i) => {
      if (![x.t, x.o, x.h, x.l, x.c, x.v].every(Number.isFinite) || x.o <= 0 || x.c <= 0 || x.l <= 0 || x.v < 0 || x.h < Math.max(x.o, x.c) || x.l > Math.min(x.o, x.c) || (i && x.t - c[i - 1].t !== TF[tf])) throw Error('Candles inválidos, incompletos ou de outro intervalo.');
    });
    const rows = [], cooldown = new Map();
    for (let i = 44; i < c.length - 1; i++) {
      for (const signal of detect(c.slice(0, i + 1), tf)) {
        if (i <= (cooldown.get(signal.pattern) ?? -1)) continue;
        const future = c.slice(i + 1, i + 1 + horizon), entry = future[0].o;
        rows.push({ ...signal, time: c[i].t, entryTime: future[0].t, entry, bars: future.length, horizon, status: future.length === horizon ? 'AVALIADO' : 'PARCIAL', mfe: Math.max(0, (Math.max(...future.map(x => x.h)) / entry - 1) * 100), mae: Math.min(0, (Math.min(...future.map(x => x.l)) / entry - 1) * 100) });
        cooldown.set(signal.pattern, i + horizon);
      }
    }
    return { version: VERSION, timeframe: tf, candles: c.length, horizon, rows };
  }
  const api = { detect, evaluate, obv, rsi, reversal, VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  window.EPStructureVolumeLab = api;
  function mount() {
    const host = document.querySelector('main');
    if (!host || document.getElementById('structureVolumeLab')) return;
    const panel = document.createElement('details'); panel.id = 'structureVolumeLab'; panel.className = 'card';
    panel.innerHTML = '<summary>Experimento separado — Caixote / Bandeira / OBV</summary><p>Cripto • usa o ativo e intervalo carregados no painel • 48 candles de avaliação • RSI 14 ≤85 • sem ordens reais.</p><button type="button" data-run>Testar candles carregados</button> <button type="button" data-export>Exportar este experimento</button><p data-result>Aguardando teste manual. Nenhum motor ou histórico existente é alterado.</p><small>Resultados brutos, sem taxas ou slippage. Amostra curta: não comprova previsão de 10–50%. Histórico só neste navegador, sem expiração automática. Exporte uma cópia para preservar os dados.</small>';
    const choice = document.createElement('select');
    choice.innerHTML = '<option value="loaded">Intervalo carregado</option><option value="30m">M30 agregado de M15</option>';
    choice.setAttribute('aria-label', 'Intervalo do novo experimento');
    panel.querySelector('[data-run]').before(choice);
    const central = document.getElementById('decisionCenter')?.closest('section');
    if (central) central.before(panel); else host.prepend(panel);
    const output = panel.querySelector('[data-result]');
    function read() { const data = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(data)) throw Error('Histórico inválido; não foi sobrescrito.'); return data; }
    panel.querySelector('[data-run]').onclick = () => {
      try {
        const tf = document.querySelector('#tf')?.value, symbol = document.querySelector('#pair')?.value;
        const asset = window.CryptoApp?.getData()?.get(symbol);
        if (!asset?.candles) throw Error('Carregue o ativo no painel Cripto primeiro.');
        let candles = asset.candles, experimentTf = tf;
        if (choice.value === '30m') {
          if (tf !== '15m') throw Error('Para M30, carregue M15 no painel Cripto.');
          const aggregated = [];
          for (let i = 0; i < candles.length - 1; i++) {
            const a = candles[i], b = candles[i + 1];
            if (a.t % TF['30m'] === 0 && b.t - a.t === TF['15m']) aggregated.push({ t: a.t, o: a.o, h: Math.max(a.h, b.h), l: Math.min(a.l, b.l), c: b.c, v: a.v + b.v });
          }
          candles = aggregated; experimentTf = '30m';
        }
        const report = { ...evaluate(candles, experimentTf), symbol, testedAt: new Date().toISOString() };
        const key = `${VERSION}|${symbol}|${experimentTf}|${candles.at(-1).t}`;
        const history = read(); const old = history.findIndex(x => x.key === key);
        if (old >= 0) history[old] = { ...report, key }; else history.push({ ...report, key });
        localStorage.setItem(KEY, JSON.stringify(history));
        const done = report.rows.filter(x => x.status === 'AVALIADO');
        output.textContent = `${symbol} ${experimentTf} • ${report.candles} candles • ${done.length} avaliados • ${report.rows.length - done.length} parciais • ` + [10, 20, 30, 50].map(t => `≥${t}%: ${done.filter(x => x.mfe >= t).length}`).join(' | ') + ` • ${history.length} testes salvos localmente.`;
      } catch (e) { output.textContent = `Teste não salvo: ${e.message}`; }
    };
    panel.querySelector('[data-export]').onclick = () => {
      try {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ version: VERSION, exportedAt: new Date().toISOString(), tests: read() }, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'ep-caixote-bandeira-obv.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { output.textContent = e.message; }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
