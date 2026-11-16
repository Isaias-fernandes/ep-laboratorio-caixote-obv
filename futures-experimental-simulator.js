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

  function readConfig(){
    const walletBalance = Math.max(0, n(document.getElementById('futuresBank')?.value ?? 100));
    const marginPct = Math.min(100, Math.max(0, n(document.getElementById('futuresMarginPct')?.value ?? 10)));
    const maintenancePct = Math.max(0, n(document.getElementById('futuresMaintenancePct')?.value ?? 0.5));
    return { walletBalance, marginPct, maintenancePct };
  }

  function simulateSignal(signal, leverage, config = readConfig()){
    const best = n(signal.best);
    const worst = n(signal.worst);
    const initialMargin = config.walletBalance * config.marginPct / 100;
    const notional = initialMargin * leverage;
    const isShort = /^(VENDA|SELL|SHORT)$/.test(String(signal?.direction ?? signal?.side ?? '').trim().toUpperCase());
    const adverseMove = Math.max(0, -worst / 100);
    const markNotional = notional * (isShort ? 1 + adverseMove : Math.max(0, 1 - adverseMove));
    const bestPnl = notional * best / 100;
    const worstPnl = notional * worst / 100;
    const equityAtWorst = config.walletBalance + worstPnl;
    const maintenanceMargin = markNotional * config.maintenancePct / 100;
    const theoreticallyLiquidated = equityAtWorst <= maintenanceMargin;
    return {
      leverage, best, worst, initialMargin, notional, bestPnl, worstPnl,
      equityAtWorst, markNotional, maintenanceMargin, theoreticallyLiquidated
    };
  }

  function summaryFor(leverage, config = readConfig()){
    const rows = state.signals.map(s => simulateSignal(s, leverage, config));
    const total = rows.length;
    const liquidated = rows.filter(r => r.theoreticallyLiquidated).length;
    const survived = total - liquidated;
    const avgBestPnl = total ? rows.reduce((a,r)=>a+r.bestPnl,0)/total : 0;
    const avgWorstPnl = total ? rows.reduce((a,r)=>a+r.worstPnl,0)/total : 0;
    const avgEquityAtWorst = total ? rows.reduce((a,r)=>a+r.equityAtWorst,0)/total : 0;
    const initialMargin = config.walletBalance * config.marginPct / 100;
    return {
      total, liquidated, survived, survivalPct: total ? survived*100/total : 0,
      avgBestPnl, avgWorstPnl, avgEquityAtWorst, initialMargin,
      notional: initialMargin * leverage
    };
  }

  const money = v => `${n(v) >= 0 ? '+' : ''}${n(v).toFixed(2)} USDT`;
  const balance = v => `${n(v).toFixed(2)} USDT`;

  function ensurePanel(){
    if (document.getElementById('futuresExperimentalSimulator')) return;
    const section = document.createElement('section');
    section.id = 'futuresExperimentalSimulator';
    section.className = 'panel interpretation-center';
    section.innerHTML = `
      <div class="center-title">
        <div><span class="eyebrow">SIMULADOR EXPERIMENTAL</span><h2>Futuros · Alavancagem e margem cruzada</h2></div>
        <span class="pill watch">SEM ORDENS REAIS</span>
      </div>
      <p>Simula cada sinal como uma operação independente. A margem inicial é uma parte da banca; o restante continua disponível como reserva de margem cruzada. Não altera motores, scores, padrões ou sinais. Registros repetidos do mesmo ativo, direção, período e horário de vela/entrada são agrupados quando esses campos estão disponíveis.</p>
      <div class="panel" style="margin-top:12px">
        <div class="center-title"><div><h2>Parâmetros da conta</h2></div>
          <label>Banca (USDT) <input id="futuresBank" type="number" min="0" step="10" value="100" style="width:100px"></label>
          <label>Margem inicial (%) <input id="futuresMarginPct" type="number" min="0" max="100" step="1" value="10" style="width:78px"></label>
          <label>Manutenção estimada (%) <input id="futuresMaintenancePct" type="number" min="0" step="0.1" value="0.5" style="width:78px"></label>
        </div>
        <p class="notice">Exemplo padrão: 100 USDT de banca, 10 USDT de margem inicial e 90 USDT de reserva; a 10x, a posição simulada é de 100 USDT. A taxa de manutenção padrão de 0,5% é apenas uma hipótese editável: a taxa real varia por contrato e faixa de posição.</p>
      </div>
      <div class="notice"><strong>Limites:</strong> a estimativa considera banca total + P&amp;L não realizado contra a margem de manutenção estimada sobre o notional no pior ponto. A corretora pode liquidar antes por taxas, funding, slippage, regras de faixa e outras posições/ordens. O cálculo não reconstrói o caminho intr candle nem o fechamento real; não interprete excursões como lucro realizado. Cada sinal recomeça com a mesma banca, sem posições simultâneas.</div>
      <section class="summary" id="futuresSummary"></section>
      <div class="panel" style="margin-top:12px">
        <div class="center-title"><div><h2>Análise por alavancagem</h2></div>
          <label>Alavancagem <select id="futuresLev">${LEVERAGES.map(x=>`<option value="${x}" ${x===10?'selected':''}>${x}x</option>`).join('')}</select></label>
        </div>
        <div id="futuresLevSummary" class="facts"></div>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Mercado</th><th>Ativo</th><th>Direção</th><th>Score</th><th>Padrão</th><th>Melhor mov.</th><th>Pior mov.</th><th>Alav.</th><th>Margem inicial</th><th>Notional</th><th>P&amp;L no melhor</th><th>P&amp;L no pior</th><th>Equity no pior ponto</th><th>Manutenção estimada</th><th>Status</th></tr></thead>
        <tbody id="futuresSimulatorBody"></tbody>
      </table></div>
      <p id="futuresUpdated" class="notice">Aguardando dados...</p>`;

    const firstCenter = document.querySelector('.interpretation-center');
    (firstCenter?.parentNode || document.querySelector('main') || document.body).insertBefore(section, firstCenter || null);
    ['futuresLev','futuresBank','futuresMarginPct','futuresMaintenancePct'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', render);
      document.getElementById(id)?.addEventListener('input', render);
    });
  }

  function render(){
    ensurePanel();
    const lev = n(document.getElementById('futuresLev')?.value || 10);
    const config = readConfig();
    const summary = document.getElementById('futuresSummary');
    if (summary) {
      summary.innerHTML = LEVERAGES.map(l => {
        const s = summaryFor(l, config);
        return `<article><span>${l}x · sobrevivência estimada em cross</span><strong>${s.total ? s.survivalPct.toFixed(1)+'%' : '—'}</strong><small>${s.liquidated}/${s.total} sinais alcançariam a manutenção estimada</small></article>`;
      }).join('');
    }

    const sm = summaryFor(lev, config);
    const levBox = document.getElementById('futuresLevSummary');
    if (levBox) levBox.innerHTML = `
      <div class="fact"><span>Sinais após agrupamento</span><strong>${sm.total}</strong></div>
      <div class="fact"><span>Registros originais / repetidos agrupados</span><strong>${state.rawCount} / ${state.groupedCount}</strong></div>
      <div class="fact"><span>Banca total em cada simulação</span><strong>${balance(config.walletBalance)}</strong></div>
      <div class="fact"><span>Margem inicial por sinal</span><strong>${balance(sm.initialMargin)}</strong></div>
      <div class="fact"><span>Notional por sinal em ${lev}x</span><strong>${balance(sm.notional)}</strong></div>
      <div class="fact"><span>Reserva disponível inicialmente</span><strong>${balance(Math.max(0,config.walletBalance-sm.initialMargin))}</strong></div>
      <div class="fact"><span>Sobreviveriam ao pior movimento</span><strong>${sm.survived} (${sm.survivalPct.toFixed(1)}%)</strong></div>
      <div class="fact"><span>Alcançariam manutenção estimada</span><strong>${sm.liquidated}</strong></div>
      <div class="fact"><span>P&amp;L médio no melhor movimento</span><strong>${money(sm.avgBestPnl)}</strong></div>
      <div class="fact"><span>P&amp;L médio no pior movimento</span><strong>${money(sm.avgWorstPnl)}</strong></div>
      <div class="fact"><span>Equity média no pior movimento</span><strong>${balance(sm.avgEquityAtWorst)}</strong></div>
      <div class="fact"><span>Manutenção configurada</span><strong>${config.maintenancePct.toFixed(2)}%</strong></div>`;

    const body = document.getElementById('futuresSimulatorBody');
    if (body) {
      body.innerHTML = state.signals.slice(0, MAX_ROWS).map(s => {
        const r = simulateSignal(s, lev, config);
        const status = r.theoreticallyLiquidated ? 'ATINGIRIA MANUTENÇÃO' : 'SOBREVIVERIA À PIOR EXCURSÃO';
        return `<tr>
          <td>${esc(s.market)}</td><td>${esc(s.symbol)}</td><td>${esc(s.direction)}</td><td>${esc(s.score)}</td><td>${esc(s.pattern)}</td>
          <td>${pct(r.best)}</td><td>${pct(r.worst)}</td><td>${lev}x</td><td>${balance(r.initialMargin)}</td><td>${balance(r.notional)}</td>
          <td>${money(r.bestPnl)}</td><td>${money(r.worstPnl)}</td><td>${balance(r.equityAtWorst)}</td><td>${balance(r.maintenanceMargin)}</td><td><strong>${status}</strong></td>
        </tr>`;
      }).join('') || '<tr><td colspan="15">Nenhum sinal disponível.</td></tr>';
    }

    const up = document.getElementById('futuresUpdated');
    if (up) up.textContent = state.generatedAt
      ? `Dados: data/auto-signals.json · geração ${new Date(state.generatedAt).toLocaleString('pt-BR')} · ${state.rawCount} registros, ${state.signals.length} eventos após agrupamento (${state.groupedCount} repetidos agrupados). Cenários independentes, sem execução de ordens.`
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
    readConfig,
    uniqueEvents,
    getSignals: () => [...state.signals],
    reload: load,
    render
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();