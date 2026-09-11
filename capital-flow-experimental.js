/* LABORATÓRIO ISOLADO — Fluxo de Capital Experimental.
   Observacional. Não altera score, sinais, motores, gates ou ordens.
   Usa Tape Reading já existente + dados públicos de futuros Binance quando disponíveis. */
(() => {
  'use strict';

  const UNIVERSE = (window.TapeReadingExperimental?.universe || [
    'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT',
    'TRXUSDT','LTCUSDT','BCHUSDT','XLMUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','NEARUSDT','APTUSDT','FILUSDT',
    'ICPUSDT','ARBUSDT','OPUSDT','SUIUSDT','AAVEUSDT'
  ]).slice();

  const state = new Map();
  const BATCH = 5;
  const REFRESH_MS = 30000;
  const STORAGE_KEY = 'ep_lab_capital_flow_v1';
  const MAX_HISTORY = 1200;
  let cursor = 0;
  let timer = null;

  const num = v => Number.isFinite(+v) ? +v : null;
  const pct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`;
  const money = v => {
    if (v == null || !Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return `${v >= 0 ? '+' : '-'}$${(a/1e9).toFixed(2)} bi`;
    if (a >= 1e6) return `${v >= 0 ? '+' : '-'}$${(a/1e6).toFixed(2)} mi`;
    if (a >= 1e3) return `${v >= 0 ? '+' : '-'}$${(a/1e3).toFixed(1)} mil`;
    return `${v >= 0 ? '+' : '-'}$${a.toFixed(0)}`;
  };
  const esc = s => String(s ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function loadHistory(){
    try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
  function saveHistory(row){
    try {
      const h = loadHistory(); h.push(row);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-MAX_HISTORY)));
    } catch {}
  }

  async function fetchJson(url){
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6500);
    try {
      const r = await fetch(url, { cache:'no-store', signal:ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function futuresSnapshot(symbol){
    const out = { oi:null, funding:null, markPrice:null, source:'BINANCE_FUTURES', ok:false };
    try {
      const [oi, premium] = await Promise.all([
        fetchJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`),
        fetchJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`)
      ]);
      out.oi = num(oi?.openInterest);
      out.funding = num(premium?.lastFundingRate);
      out.markPrice = num(premium?.markPrice);
      out.ok = out.oi != null || out.funding != null;
    } catch (e) { out.error = e?.message || 'indisponível'; }
    return out;
  }

  function classify(row){
    const tapeDelta = row.tapeDeltaUsd;
    const oiPct = row.oiChangePct;
    const funding = row.funding;
    const aggression = row.aggression;

    // classificação descritiva, sem afetar qualquer sinal.
    if (tapeDelta != null && oiPct != null) {
      if (tapeDelta > 0 && oiPct > 0.05) return {label:'ENTRADA COMPRADORA', note:'agressão compradora + OI crescendo'};
      if (tapeDelta < 0 && oiPct > 0.05) return {label:'ENTRADA VENDEDORA', note:'agressão vendedora + OI crescendo'};
      if (tapeDelta > 0 && oiPct < -0.05) return {label:'SAÍDA DE SHORTS', note:'compras com OI diminuindo'};
      if (tapeDelta < 0 && oiPct < -0.05) return {label:'SAÍDA DE LONGS', note:'vendas com OI diminuindo'};
    }
    if (aggression === 'COMPRADORA') return {label:'PRESSÃO COMPRADORA', note:'fluxo agressor comprador; OI sem confirmação'};
    if (aggression === 'VENDEDORA') return {label:'PRESSÃO VENDEDORA', note:'fluxo agressor vendedor; OI sem confirmação'};
    if (funding != null && Math.abs(funding) >= 0.001) return {label:'ALAVANCAGEM ESTICADA', note:`funding ${funding > 0 ? 'positivo' : 'negativo'} elevado`};
    return {label:'NEUTRO / AGUARDANDO', note:'sem confluência suficiente'};
  }

  function tapeSnapshot(symbol){
    const t = window.TapeReadingExperimental?.get?.(symbol, 'CRIPTO');
    if (!t?.available) return { aggression:'AGUARDANDO', buyNotional:null, sellNotional:null, tapeDeltaUsd:null, bookImbalance:null, speed:null, persistence:'AGUARDANDO' };
    const buy = num(t.buyNotional), sell = num(t.sellNotional);
    return {
      aggression:t.aggression || 'AGUARDANDO', buyNotional:buy, sellNotional:sell,
      tapeDeltaUsd:(buy != null && sell != null) ? buy - sell : null,
      bookImbalance:num(t.bookImbalance), speed:num(t.speed), persistence:t.persistence || 'AGUARDANDO'
    };
  }

  async function updateSymbol(symbol){
    const prev = state.get(symbol) || {};
    const tape = tapeSnapshot(symbol);
    const fut = await futuresSnapshot(symbol);
    const oiUsd = (fut.oi != null && fut.markPrice != null) ? fut.oi * fut.markPrice : null;
    let oiChangePct = null;
    if (prev.oi != null && fut.oi != null && prev.oi > 0) oiChangePct = (fut.oi / prev.oi - 1) * 100;
    const row = {
      symbol, updatedAt:Date.now(), ...tape,
      oi:fut.oi, oiUsd, oiChangePct, funding:fut.funding, markPrice:fut.markPrice,
      futuresOk:fut.ok, source:fut.ok ? 'TAPE + BINANCE FUTURES' : 'TAPE (OI/FUNDING indisponível)'
    };
    row.reading = classify(row);
    state.set(symbol, row);
    saveHistory({t:row.updatedAt,symbol,oi:row.oi,oiChangePct:row.oiChangePct,funding:row.funding,tapeDeltaUsd:row.tapeDeltaUsd,reading:row.reading.label});
    return row;
  }

  function ensurePanel(){
    if (document.getElementById('capitalFlowExperimental')) return;
    const s = document.createElement('section');
    s.id = 'capitalFlowExperimental';
    s.className = 'panel interpretation-center';
    s.innerHTML = `
      <div class="center-title"><div><span class="eyebrow">OBSERVADOR EXPERIMENTAL</span><h2>Fluxo de Capital · Cripto</h2></div><span class="pill watch">NÃO ALTERA SINAIS</span></div>
      <p>Combina agressão do Tape Reading com Open Interest e Funding públicos da Binance Futures quando disponíveis. Serve para estudar entrada/saída de capital, fechamento de longs/shorts e pressão compradora/vendedora.</p>
      <div class="notice"><strong>Importante:</strong> é uma inferência de fluxo, não uma medição contábil perfeita de “dinheiro entrando/saindo”. OI + agressão ajudam a distinguir abertura de posições de fechamento.</div>
      <section class="summary" id="capitalFlowSummary"></section>
      <div class="table-wrap"><table><thead><tr>
        <th>Ativo</th><th>Leitura</th><th>Delta agressor 60s</th><th>Book</th><th>OI aprox.</th><th>Δ OI</th><th>Funding</th><th>Persistência</th><th>Fonte</th>
      </tr></thead><tbody id="capitalFlowBody"></tbody></table></div>
      <p id="capitalFlowUpdated" class="notice">Inicializando...</p>`;
    const tapePanel = [...document.querySelectorAll('.interpretation-center')].find(x => x.textContent.includes('Tape Reading'));
    if (tapePanel?.parentNode) tapePanel.parentNode.insertBefore(s, tapePanel.nextSibling);
    else (document.querySelector('main') || document.body).appendChild(s);
  }

  function render(){
    ensurePanel();
    const rows = [...state.values()].sort((a,b)=>b.updatedAt-a.updatedAt);
    const counts = rows.reduce((o,r)=>{o[r.reading?.label]=(o[r.reading?.label]||0)+1; return o;},{});
    const summary = document.getElementById('capitalFlowSummary');
    if (summary) summary.innerHTML = [
      ['Entrada compradora', counts['ENTRADA COMPRADORA']||0],
      ['Entrada vendedora', counts['ENTRADA VENDEDORA']||0],
      ['Saída de shorts', counts['SAÍDA DE SHORTS']||0],
      ['Saída de longs', counts['SAÍDA DE LONGS']||0]
    ].map(([k,v])=>`<article><span>${k}</span><strong>${v}</strong></article>`).join('');

    const body = document.getElementById('capitalFlowBody');
    if (body) body.innerHTML = rows.map(r=>`<tr title="${esc(r.reading?.note)}">
      <td><strong>${esc(r.symbol)}</strong></td>
      <td><strong>${esc(r.reading?.label)}</strong><br><small>${esc(r.reading?.note)}</small></td>
      <td>${money(r.tapeDeltaUsd)}</td>
      <td>${r.bookImbalance == null ? '—' : `${r.bookImbalance>=0?'+':''}${(r.bookImbalance*100).toFixed(1)}%`}</td>
      <td>${r.oiUsd == null ? '—' : money(r.oiUsd)}</td>
      <td>${pct(r.oiChangePct)}</td>
      <td>${r.funding == null ? '—' : `${(r.funding*100).toFixed(4)}%`}</td>
      <td>${esc(r.persistence)}</td><td>${esc(r.source)}</td>
    </tr>`).join('') || '<tr><td colspan="9">Aguardando primeira leitura...</td></tr>';

    const u = document.getElementById('capitalFlowUpdated');
    if (u) u.textContent = `Monitorando ${UNIVERSE.length} criptos em rotação de ${BATCH} por ciclo · atualização ~${REFRESH_MS/1000}s · histórico local observacional.`;
  }

  async function cycle(){
    ensurePanel();
    const batch = [];
    for (let i=0;i<BATCH;i++) batch.push(UNIVERSE[(cursor+i)%UNIVERSE.length]);
    cursor = (cursor+BATCH)%UNIVERSE.length;
    window.TapeReadingExperimental?.watchMany?.(batch);
    await Promise.allSettled(batch.map(updateSymbol));
    render();
  }

  function get(symbol){ return state.get(String(symbol||'').toUpperCase()) || null; }
  function start(){ if (timer) return; cycle(); timer=setInterval(cycle, REFRESH_MS); }
  function stop(){ if(timer){clearInterval(timer); timer=null;} }

  window.EPLabCapitalFlow = { get, getAll:()=>[...state.values()], cycle, start, stop, history:loadHistory };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();