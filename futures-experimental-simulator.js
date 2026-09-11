/* LABORATÓRIO ISOLADO — simulador experimental de futuros.
   Não envia ordens, não altera sinais, scores, motores ou dados de origem. */
(() => {
  'use strict';

  const LEVERAGES = [1, 5, 10, 20, 50, 100];
  const MAX_ROWS = 80;
  const state = { signals: [], generatedAt: null };

  const n = v => Number.isFinite(+v) ? +v : 0;
  const pct = v => `${n(v) >= 0 ? '+' : ''}${n(v).toFixed(2)}%`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
      <p>Simulação observacional dos sinais já gerados pelo laboratório. Não altera motores, score, padrões ou sinais. Usa a melhor/pior excursão registrada para estimar o efeito da alavancagem.</p>
      <div class="notice"><strong>Atenção:</strong> a liquidação abaixo é uma aproximação simplificada usando 100/alavancagem. Exchanges usam margem de manutenção, taxas, funding, slippage e regras próprias; a liquidação real pode ocorrer antes.</div>
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
        return `<article><span>${l}x · sobrevivência teórica</span><strong>${s.total ? s.survivalPct.toFixed(1)+'%' : '—'}</strong><small>${s.liquidated}/${s.total} atingiriam a zona de liquidação simplificada</small></article>`;
      }).join('');
    }

    const sm = summaryFor(lev);
    const levBox = document.getElementById('futuresLevSummary');
    if (levBox) levBox.innerHTML = `
      <div class="fact"><span>Sinais analisados</span><strong>${sm.total}</strong></div>
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
      ? `Dados: data/auto-signals.json · geração ${new Date(state.generatedAt).toLocaleString('pt-BR')} · ${state.signals.length} sinais. Simulação sem execução de ordens.`
      : 'Aguardando dados...';
  }

  async function load(){
    ensurePanel();
    try {
      const res = await fetch(`data/auto-signals.json?futuresSim=${Date.now()}`, { cache:'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.signals = Array.isArray(data.signals) ? data.signals.filter(s => Number.isFinite(+s.best) && Number.isFinite(+s.worst)) : [];
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
    getSignals: () => [...state.signals],
    reload: load,
    render
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();
