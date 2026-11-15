/* LABORATÓRIO ISOLADO — simulador experimental de futuros.
   Não envia ordens, não altera sinais, scores, motores ou dados de origem. */
(() => {
  'use strict';

  const LEVERAGES = [1, 5, 10, 20, 50, 100];
  const MAX_ROWS = 80;
  const state = { signals: [], rawCount: 0, groupedCount: 0, generatedAt: null };

  const n = v => Number.isFinite(+v) ? +v : 0;
  const pct = v => `${n(v) >= 0 ? '+' : ''}${n(v).toFixed(2)}%`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function eventTime(signal){
    const fields = ['candleTime','candle_time','entryTime','entry_time','signalTime','signal_time','timestamp','createdAt','created_at','time'];
    for(const field of fields){
      const value = signal?.[field];
      if(value == null || value === '') continue;
      const numeric = typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim());
      if(numeric){
        const number = Number(value);
        if(Number.isFinite(number) && number > 0) return String(Math.trunc(number < 1e12 ? number * 1000 : number));
      }
      const parsed = Date.parse(value);
      if(Number.isFinite(parsed)) return String(parsed);
    }
    return null;
  }

  function uniqueEvents(signals){
    const grouped = new Map();
    const result = [];
    for(const signal of signals){
      const symbol = String(signal?.symbol ?? signal?.asset ?? signal?.pair ?? '').trim().toUpperCase();
      const direction = String(signal?.direction ?? signal?.side ?? '').trim().toUpperCase();
      const interval = String(signal?.interval ?? signal?.timeframe ?? '').trim().toLowerCase();
      const time = eventTime(signal);
      // Sem ativo, direção e horário da vela/entrada, não há base segura para agrupar.
      if(!symbol || !direction || !time){
        result.push(signal);
        continue;
      }
      const key = JSON.stringify([symbol, interval, direction, time]);
      const prior = grouped.get(key);
      if(prior){
        const event = result[prior];
        event.best = Math.min(n(event.best), n(signal.best));
        event.worst = Math.min(n(event.worst), n(signal.worst));
        event._groupedCount = (event._groupedCount || 1) + 1;
        const patterns = new Set([...(event._groupedPatterns || [event.pattern]), signal.pattern].filter(Boolean));
        event._groupedPatterns = [...patterns];
        event.pattern = patterns.size > 1 ? `Agrupado: ${[...patterns].join(' / ')}` : (event.pattern || signal.pattern);
      }else{
        const index = result.length;
        result.push({...signal, _groupedCount: 1, _groupedPatterns: signal.pattern ? [signal.pattern] : []});
        grouped.set(key, index);
      }
    }
    return result;
  }

  function theoreticalLiquidationMove(leverage){
    return leverage > 0 ? -(100 / leverage) : -100;
  }

  function simulateSignal(signal, leverage){
    const best = n(signal.best);
    const worst = n(signal.worst);
    const liqMove = theoreticalLiquidationMove(leverage);
    const bestMargin = best * leverage;
    const worstMargin = worst * leverage;
    const theoreticallyLiquidated = worst <= liqMove;
    return { leverage, best, worst, bestMargin, worstMargin, liqMove, theoreticallyLiquidated };
  }

  function summaryFor(leverage){
    const rows = state.signals.map(s => simulateSignal(s, leverage));
    const total = rows.length;
    const liquidated = rows.filter(r => r.theoreticallyLiquidated).length;
    const survived = total - liquidated;
    const avgBest = total ? rows.reduce((a,r)=>a+r.bestMargin,0)/total : 0;
    const avgWorst = total ? rows.reduce((a,r)=>a+r.worstMargin,0)/total : 0;
    return { total, liquidated, survived, survivalPct: total ? survived*100/total : 0, avgBest, avgWorst };
  }

  function ensurePanel(){
    if (document.getElementById('futuresExperimentalSimulator')) return;
    const section = document.createElement('section');
    section.id = 'futuresExperimentalSimulator';
    section.className = 'panel interpretation-center';
    section.innerHTML = `
      <div class="center-title">
        <div><span class="eyebrow">SIMULADOR EXPERIMENTAL</span><h2>Futuros · Alavancagem e risco de liquidação</h2></div>
        <span class="pill watch">SEM ORDENS REAIS</span>
      </div>
      <p>Simulação observacional dos sinais já gerados pelo laboratório. Não altera motores, scores, padrões ou sinais. Agrupa registros repetidos do mesmo ativo, direção, período e horário de vela/entrada, quando esses campos estão disponíveis; preserva a menor excursão favorável e a pior excursão adversa do grupo.</p>
      <div class="notice"><strong>Limite da estimativa:</strong> a liquidação usa a aproximação simplificada 100/alavancagem aplicada à pior excursão registrada. Exchanges usam margem de manutenção, taxas, funding, slippage e regras próprias; a liquidação real pode ocorrer antes. Registros sem horário não são agrupados.</div>
      <section class="summary" id="futuresSummary"></section>
      <div class="panel" style="margin-top:12px">
        <div class="center-title"><div><h2>Análise por alavancagem</h2></div>
          <label>Alavancagem <select id="futuresLev">${LEVERAGES.map(x=>`<option value="${x}" ${x===20?'selected':''}>${x}x</option>`).join('')}</select></label>
        </div>
        <div id="futuresLevSummary" class="facts"></div>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Mercado</th><th>Ativo</th><th>Direção</th><th>Score</th><th>Padrão</th><th>Melhor</th><th>Pior</th><th>Alav.</th><th>Melhor s/ margem</th><th>Pior s/ margem</th><th>Liq. teórica</th><th>Status</th></tr></thead>
        <tbody id="futuresSimulatorBody"></tbody>
      </table></div>
      <p id="futuresUpdated" class="notice">Aguardando dados...</p>`;
    const firstCenter = document.querySelector('.interpretation-center');
    (firstCenter?.parentNode || document.querySelector('main') || document.body).insertBefore(section, firstCenter || null);
    document.getElementById('futuresLev')?.addEventListener('change', render);
  }

  function render(){
    ensurePanel();
    const lev = n(document.getElementById('futuresLev')?.value || 20);
    const summary = document.getElementById('futuresSummary');
    if (summary) {
      summary.innerHTML = LEVERAGES.map(l => {
        const s = summaryFor(l);
        return `<article><span>${l}x · sobrevivência teórica</span><strong>${s.total ? s.survivalPct.toFixed(1)+'%' : '—'}</strong><small>${s.liquidated}/${s.total} eventos atingiriam a zona de liquidação simplificada</small></article>`;
      }).join('');
    }

    const sm = summaryFor(lev);
    const levBox = document.getElementById('futuresLevSummary');
    if (levBox) levBox.innerHTML = `
      <div class="fact"><span>Eventos após agrupamento</span><strong>${sm.total}</strong></div>
      <div class="fact"><span>Registros originais / repetidos agrupados</span><strong>${state.rawCount} / ${state.groupedCount}</strong></div>
      <div class="fact"><span>Sobreviveriam à pior excursão</span><strong>${sm.survived} (${sm.survivalPct.toFixed(1)}%)</strong></div>
      <div class="fact"><span>Atingiriam zona de liquidação teórica</span><strong>${sm.liquidated}</strong></div>
      <div class="fact"><span>Média da melhor excursão × ${lev}</span><strong>${pct(sm.avgBest)}</strong></div>
      <div class="fact"><span>Média da pior excursão × ${lev}</span><strong>${pct(sm.avgWorst)}</strong></div>
      <div class="fact"><span>Movimento adverso teórico para -100% da margem</span><strong>${pct(theoreticalLiquidationMove(lev))}</strong></div>`;

    const body = document.getElementById('futuresSimulatorBody');
    if (body) {
      body.innerHTML = state.signals.slice(0, MAX_ROWS).map(s => {
        const r = simulateSignal(s, lev);
        const status = r.theoreticallyLiquidated ? 'RISCO DE LIQUIDAÇÃO' : 'SOBREVIVE NA APROXIMAÇÃO';
        return `<tr>
          <td>${esc(s.market)}</td><td>${esc(s.symbol)}</td><td>${esc(s.direction)}</td><td>${esc(s.score)}</td><td>${esc(s.pattern)}</td>
          <td>${pct(r.best)}</td><td>${pct(r.worst)}</td><td>${lev}x</td><td>${pct(r.bestMargin)}</td><td>${pct(r.worstMargin)}</td>
          <td>${pct(r.liqMove)}</td><td><strong>${status}</strong></td>
        </tr>`;
      }).join('') || '<tr><td colspan="12">Nenhum sinal disponível.</td></tr>';
    }

    const up = document.getElementById('futuresUpdated');
    if (up) up.textContent = state.generatedAt
      ? `Dados: data/auto-signals.json · geração ${new Date(state.generatedAt).toLocaleString('pt-BR')} · ${state.rawCount} registros, ${state.signals.length} eventos após agrupamento (${state.groupedCount} repetidos agrupados). Simulação sem execução de ordens.`
      : 'Aguardando dados...';
  }

  async function load(){
    ensurePanel();
    try {
      const res = await fetch(`data/auto-signals.json?futuresSim=${Date.now()}`, { cache:'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = Array.isArray(data.signals) ? data.signals.filter(s => Number.isFinite(+s.best) && Number.isFinite(+s.worst)) : [];
      state.rawCount = raw.length;
      state.signals = uniqueEvents(raw);
      state.groupedCount = raw.length - state.signals.length;
      state.generatedAt = data.generatedAt || null;
      render();
    } catch (err) {
      const up = document.getElementById('futuresUpdated');
      if (up) up.textContent = `Não foi possível carregar os sinais para o simulador: ${err.message}`;
      console.warn('[futures-experimental-simulator]', err);
    }
  }

  window.EPLabFuturesSimulator = {
    simulateSignal,
    theoreticalLiquidationMove,
    uniqueEvents,
    getSignals: () => [...state.signals],
    reload: load,
    render
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();