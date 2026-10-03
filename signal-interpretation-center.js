(() => {
  const HISTORY_URL = "data/h1-history.json";
  const SIGNALS_URL = "data/auto-signals.json";
  const state = { records: [], generatedAt: null, historyUpdatedAt: null, errors: [] };
  let page = 0;
  const PAGE_SIZE = 10;
  const $ = (id) => document.getElementById(id);
  const fmtNum = (value, digits = 2) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : "—";
  };
  const fmtDate = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "—";
  };
  const percent = (value) => Number.isFinite(Number(value)) ? `${fmtNum(value)}%` : "—";
  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const addCell = (row, value, className = "") => {
    const cell = create("td", className, value);
    row.appendChild(cell);
    return cell;
  };
  const recordTime = (record) => Number(record.entryTime) || Date.parse(record.createdAt) || 0;
  const uniqRecords = (records) => {
    const byId = new Map();
    for (const record of records || []) {
      if (!record || !record.symbol || !record.direction) continue;
      const id = record.id || [record.market, record.symbol, record.entryTime, record.direction].join("|");
      if (!byId.has(id)) byId.set(id, record);
    }
    return [...byId.values()].sort((a, b) => recordTime(b) - recordTime(a));
  };
  async function fetchJson(path) {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }
  function onePctSummary(records) {
    const completed = records.filter((record) => record.tracking?.status === "CONCLUIDO_96");
    const tally = { favorable: 0, adverse: 0, same: 0, none: 0 };
    for (const record of completed) {
      const order = record.tracking?.order?.["1"];
      if (order === "FAVORAVEL_PRIMEIRO" || order === "FAVORAVEL_PRIMEIRO_PENDENTE_ADV") tally.favorable++;
      else if (order === "ADVERSO_PRIMEIRO" || order === "ADVERSO_PRIMEIRO_PENDENTE_FAV") tally.adverse++;
      else if (order === "MESMO_CANDLE_ORDEM_INDETERMINADA") tally.same++;
      else tally.none++;
    }
    return { completed, tally };
  }
  function updateSummary() {
    const records = state.records;
    const collecting = records.filter((record) => record.tracking?.status !== "CONCLUIDO_96").length;
    const completed = records.length - collecting;
    const { tally } = onePctSummary(records);
    $("signalArchivedTotal").textContent = String(records.length);
    $("signalCollectingTotal").textContent = String(collecting);
    $("signalCompletedTotal").textContent = String(completed);
    $("signalOnePctSummary").textContent =
      `±1% antes: ${tally.favorable} favorável · ${tally.adverse} adverso · ${tally.same} mesma vela · ${tally.none} sem cruzamento`;
  }
  function fillSelect(select, values, allLabel) {
    const previous = select.value;
    select.replaceChildren();
    const all = create("option", "", allLabel);
    all.value = "";
    select.appendChild(all);
    for (const value of values) {
      const option = create("option", "", value);
      option.value = value;
      select.appendChild(option);
    }
    if (values.includes(previous)) select.value = previous;
  }
  function filterRecords() {
    const asset = $("signalFilterAsset").value;
    const direction = $("signalFilterDirection").value;
    const status = $("signalFilterStatus").value;
    const query = $("signalFilterText").value.trim().toLocaleLowerCase("pt-BR");
    return state.records.filter((record) => {
      if (asset && record.symbol !== asset) return false;
      if (direction && record.direction !== direction) return false;
      if (status && (record.tracking?.status || "COLETANDO") !== status) return false;
      const searchable = [record.symbol, record.pattern, record.patternType, record.direction].join(" ").toLocaleLowerCase("pt-BR");
      return !query || searchable.includes(query);
    });
  }
  function orderLabel(record) {
    const order = record.tracking?.order?.["1"];
    if (order === "FAVORAVEL_PRIMEIRO" || order === "FAVORAVEL_PRIMEIRO_PENDENTE_ADV") return "Favorável primeiro";
    if (order === "ADVERSO_PRIMEIRO" || order === "ADVERSO_PRIMEIRO_PENDENTE_FAV") return "Adverso primeiro";
    if (order === "MESMO_CANDLE_ORDEM_INDETERMINADA") return "Mesma vela · ordem incerta";
    return "Sem cruzamento de 1%";
  }
  function renderInterpretation(record) {
    const title = $("signalReadingTitle");
    const body = $("signalReadingBody");
    const facts = $("signalReadingFacts");
    const outcome = $("signalReadingOutcome");
    facts.replaceChildren();
    if (!record) {
      title.textContent = "Nenhum sinal para os filtros selecionados";
      body.textContent = "Ajuste os filtros ou aguarde uma nova varredura.";
      outcome.textContent = "Sem registro selecionado.";
      return;
    }
    const isBuy = record.direction === "COMPRA";
    const direction = isBuy ? "COMPRA" : "VENDA";
    const tracking = record.tracking || {};
    const indicators = record.indicators || {};
    const score = Number(record.score);
    const volumeRatio = Number(indicators.volumeRatio);
    const obv = String(indicators.obv || "").toUpperCase();
    const obvAgrees = isBuy ? obv === "SUBINDO" : obv === "CAINDO";
    const evidence = [
      ["Momentum RSI/CCI/MACD", !!indicators.momentumAligned],
      ["Ignition", !!indicators.ignition],
      ["Volume ≥ 1,20×", Number.isFinite(volumeRatio) && volumeRatio >= 1.2],
      ["OBV na direção do sinal", obvAgrees]
    ];
    title.textContent = `${record.symbol} · ${direction} · score ${fmtNum(score, 0)}/100`;
    const scoreNote = score >= 100 ? " O score chegou ao teto de 100; não representa probabilidade." : "";
    const patternNote = record.patternConfirmed
      ? " O detector marcou o padrão como confirmado."
      : " O detector não marcou o padrão individual como confirmado.";
    const confluences = evidence.filter((item) => item[1]).length;
    body.textContent =
      `O modelo classificou este registro como ${direction.toLowerCase()} em ${fmtDate(record.createdAt || record.entryTime)}. ` +
      `Padrão: ${record.pattern || "não informado"} (${record.patternType || "tipo não informado"}).${patternNote} ` +
      `${confluences} de 4 confirmações auxiliares aparecem no registro.${scoreNote}` + (record.retroactive ? ' Registro recuperado retrospectivamente; não foi um alerta recebido ao vivo.' : '');
    for (const [label, active] of evidence) {
      facts.appendChild(create("span", active ? "signal-chip is-on" : "signal-chip", `${active ? "✓" : "·"} ${label}`));
    }
    const progress = Math.min(96, Number(tracking.candlesObserved) || 0);
    const statusLabel = tracking.status === "CONCLUIDO_96" ? "96 velas concluídas" : `${progress}/96 velas coletadas`;
    outcome.textContent =
      `${statusLabel}. Melhor excursão favorável: ${percent(tracking.mfe)}; maior excursão adversa: ${percent(tracking.mae)}. ` +
      `No limiar de 1%: ${orderLabel(record)}. Esses valores descrevem a trajetória observada, não o resultado de uma operação.`;
  }
  function renderTable(records) {
    const body = $("signalInterpretationBody");
    body.replaceChildren();
    const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
    page = Math.min(page, totalPages - 1);
    const shown = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    $("signalPreviousPage").disabled = page === 0;
    $("signalNextPage").disabled = page >= totalPages - 1;
    $("signalPageLabel").textContent = "Página " + (page + 1) + " de " + totalPages;
    $("signalInterpretationCount").textContent = records.length
      ? "Exibindo " + (page * PAGE_SIZE + 1) + "–" + (page * PAGE_SIZE + shown.length) + " de " + records.length + " registros."
      : "Nenhum registro para estes filtros.";
    if (!shown.length) {
      const row = create("tr");
      const cell = create("td", "signal-empty", "Nenhum registro corresponde aos filtros.");
      cell.colSpan = 11;
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    for (const record of shown) {
      const row = create("tr");
      addCell(row, fmtDate(record.confirmedAt || record.createdAt || record.entryTime) + (record.retroactive ? ' · recuperado' : ''));
      addCell(row, record.symbol);
      addCell(row, record.direction, record.direction === "COMPRA" ? "signal-buy" : "signal-sell");
      addCell(row, `${fmtNum(record.score, 0)}/100`);
      addCell(row, record.pattern || "—");
      addCell(row, fmtNum(record.indicators?.rsi, 1));
      addCell(row, fmtNum(record.indicators?.cci, 1));
      addCell(row, fmtNum(record.indicators?.macdHistogram, 5));
      addCell(row, `${fmtNum(record.indicators?.volumeRatio, 2)}× · OBV ${record.indicators?.obv || "—"}`);
      addCell(row, `${record.tracking?.status === "CONCLUIDO_96" ? "Concluído" : `${Number(record.tracking?.candlesObserved) || 0}/96`} · ${orderLabel(record)}`);
      const monitorCell = create("td");
      const monitorButton = create("button", "primary", "Monitorar");
      monitorButton.type = "button";
      monitorButton.addEventListener("click", (event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("lab-monitor-signal", { detail: record }));
      });
      monitorCell.appendChild(monitorButton);
      row.appendChild(monitorCell);
      row.tabIndex = 0;
      row.setAttribute("aria-label", `Interpretar ${record.symbol} ${record.direction} ${fmtDate(record.createdAt || record.entryTime)}`);
      row.addEventListener("click", () => renderInterpretation(record));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          renderInterpretation(record);
        }
      });
      body.appendChild(row);
    }

  }
  function render() {
    updateSummary();
    const filtered = filterRecords();
    renderTable(filtered);
    renderInterpretation(filtered[0] || state.records[0] || null);
  }
  function updateStatus() {
    const status = $("signalInterpretationStatus");
    const run = state.generatedAt ? fmtDate(state.generatedAt) : "indisponível";
    const archive = state.historyUpdatedAt ? fmtDate(state.historyUpdatedAt) : "indisponível";
    const errors = state.errors.length ? ` · ${state.errors.join(" · ")}` : "";
    let lag = "";
    if (state.generatedAt) {
      const ageHours = (Date.now() - Date.parse(state.generatedAt)) / 3600000;
      if (ageHours > 3) lag = ` · Atenção: última varredura há ${fmtNum(ageHours, 1)} h`;
    }
    status.textContent = `Varredura H1: ${run} · Histórico atualizado: ${archive}${lag}${errors}`;
    status.classList.toggle("is-warning", !!lag || state.errors.length > 0);
  }
  async function load() {
    state.errors = [];
    const [historyResult, signalsResult] = await Promise.allSettled([
      fetchJson(HISTORY_URL),
      fetchJson(SIGNALS_URL)
    ]);
    if (historyResult.status === "fulfilled") {
      const history = historyResult.value;
      state.records = uniqRecords(history.records);
      state.historyUpdatedAt = history.updatedAt || null;
    } else {
      state.errors.push("arquivo permanente indisponível");
    }
    if (signalsResult.status === "fulfilled") {
      const signals = signalsResult.value;
      state.generatedAt = signals.generatedAt || null;
    } else {
      state.errors.push("estado da varredura indisponível");
    }
    fillSelect($("signalFilterAsset"), [...new Set(state.records.map((record) => record.symbol))].sort(), "Todos os ativos");
    updateStatus();
    render();
  }
  document.addEventListener("DOMContentLoaded", () => {
    const navigation = create("div", "controls");
    navigation.setAttribute("aria-label", "Páginas do histórico");
    const previous = create("button", "ghost", "Anterior");
    previous.id = "signalPreviousPage"; previous.type = "button";
    const label = create("span"); label.id = "signalPageLabel"; label.setAttribute("aria-live", "polite");
    const next = create("button", "ghost", "Próxima");
    next.id = "signalNextPage"; next.type = "button";
    previous.addEventListener("click", () => { page = Math.max(0, page - 1); render(); });
    next.addEventListener("click", () => { page++; render(); });
    navigation.append(previous, label, next);
    $("signalInterpretationCount").after(navigation);
    const changeFilter = () => { page = 0; render(); };
    for (const id of ["signalFilterAsset", "signalFilterDirection", "signalFilterStatus", "signalFilterText"]) {
      $(id).addEventListener("input", changeFilter);
      $(id).addEventListener("change", changeFilter);
    }
    load().catch((error) => {
      $("signalInterpretationStatus").textContent = `Falha ao carregar os registros: ${error.message}`;
      $("signalInterpretationStatus").classList.add("is-warning");
    });
    setInterval(() => load().catch((error) => console.warn("Central de sinais:", error)), 300000);
  });
})();