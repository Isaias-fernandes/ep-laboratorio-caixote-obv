/* Motor 6 policy derived from EP Laboratorio H1 experiments. */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EPMotor6PatternPolicy = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";

  const VOLUME_MIN = 1.2;
  const SELL_WEIGHT_FACTOR = 0.45;
  const RULES = Object.freeze({
    "Three Rising Valleys": { rank: 1, weight: 26, candidateWeight: 26, confirmation: "breakout" },
    "Bull Pennant": { rank: 2, weight: 24, candidateWeight: 13, confirmation: "volume-obv" },
    "Bull Flag": { rank: 3, weight: 22, candidateWeight: 12, confirmation: "volume-obv" },
    "Rectangle Accumulation": { rank: 4, weight: 16, candidateWeight: 8, confirmation: "breakout" },
    "Rectangle / Trading Range": { rank: 4, weight: 16, candidateWeight: 8, confirmation: "breakout" },
    "Double Bottom": { rank: 5, weight: 14, candidateWeight: 7, confirmation: "breakout" },
    "Falling Wedge": { rank: 6, weight: 14, candidateWeight: 7, confirmation: "volume-obv" },
    "Bear Pennant": { rank: 20, weight: 12, candidateWeight: 5, confirmation: "breakdown" },
    "Bear Flag": { rank: 21, weight: 11, candidateWeight: 5, confirmation: "breakdown" },
    "Rectangle Distribution": { rank: 22, weight: 9, candidateWeight: 4, confirmation: "breakdown" },
    "Double Top": { rank: 23, weight: 9, candidateWeight: 4, confirmation: "breakdown" },
    "Rising Wedge": { rank: 24, weight: 8, candidateWeight: 4, confirmation: "breakdown" }
  });

  function assess(name, direction, evidence = {}) {
    const rule = RULES[name] || { rank: 30, weight: 8, candidateWeight: 4, confirmation: "volume-obv" };
    const sell = direction === "SELL";
    const volumeRatio = Number(evidence.volumeRatio) || 0;
    const volumeConfirmed = volumeRatio >= VOLUME_MIN;
    const obvConfirmed = evidence.obvConfirmed === true;
    const breakout = evidence.breakout === true;
    const breakdown = evidence.breakdown === true;
    let confirmed = false;
    if (sell) confirmed = breakdown && volumeConfirmed && obvConfirmed;
    else if (rule.confirmation === "breakout") confirmed = breakout && volumeConfirmed && obvConfirmed;
    else if (rule.confirmation === "breakdown") confirmed = breakout && volumeConfirmed && obvConfirmed;
    else confirmed = volumeConfirmed && obvConfirmed;

    const rawPoints = confirmed ? rule.weight : rule.candidateWeight;
    const points = Math.round(rawPoints * (sell ? SELL_WEIGHT_FACTOR : 1));
    let status, reason;
    if (confirmed) {
      status = "CONFIRMADO";
      reason = sell
        ? "rompimento para baixo com volume e OBV vendedor"
        : rule.confirmation === "breakout"
          ? "rompimento confirmado com volume e OBV comprador"
          : "volume e OBV confirmam a estrutura";
    } else if (sell) {
      status = "VENDA EM OBSERVAÇÃO";
      reason = "padrões de venda recebem peso menor e exigem rompimento para baixo, volume e OBV";
    } else if (name === "Three Rising Valleys") {
      status = "ALERTA PRINCIPAL";
      reason = "estrutura de fundos ascendentes; aguardar rompimento com volume e OBV";
    } else if (rule.confirmation === "breakout") {
      status = "AGUARDAR ROMPIMENTO";
      reason = "manter a estrutura em observação até fechar além do nível com volume e OBV";
    } else if (!volumeConfirmed && !obvConfirmed) {
      status = "AGUARDAR VOLUME E OBV";
      reason = "estrutura promissora, sem confirmação conjunta de volume e OBV";
    } else if (!volumeConfirmed) {
      status = "AGUARDAR VOLUME";
      reason = "OBV favorável, mas volume ainda abaixo de 1,2x a média recente";
    } else {
      status = "AGUARDAR OBV";
      reason = "volume favorável, mas OBV ainda não confirma";
    }
    return {
      name, direction, rank: rule.rank, points, confirmed, status, reason,
      volumeRatio: +volumeRatio.toFixed(3), volumeConfirmed, obvConfirmed,
      breakoutConfirmed: breakout && volumeConfirmed && obvConfirmed,
      breakdownConfirmed: breakdown && volumeConfirmed && obvConfirmed
    };
  }

  const MIN30_DISTANCE_MAX_PCT = 0.5;
  const MIN30_SCORE_MIN = 50;
  const MIN30_PATTERNS = Object.freeze({
    BUY: Object.freeze(["Three Rising Valleys", "Bull Pennant", "Bull Flag", "Double Bottom", "Falling Wedge", "Rectangle Accumulation"]),
    SELL: Object.freeze(["Bear Pennant", "Bear Flag", "Rectangle Distribution", "Double Top", "Rising Wedge"])
  });

  function assessMin30(input = {}) {
    const direction = input.direction === "SELL" ? "SELL" : input.direction === "BUY" ? "BUY" : null;
    const distance = Number(input.distancePct);
    if (input.fresh !== true || input.minimumValid !== true || !Number.isFinite(distance)) {
      return { eligible: false, reason: "mínima de 30 dias ausente, incompleta ou desatualizada" };
    }
    if (!(Number(input.candleCount) >= 700)) {
      return { eligible: false, reason: "histórico menor que 700 candles H1" };
    }
    if ((distance < 0 || distance > MIN30_DISTANCE_MAX_PCT)) {
      return { eligible: false, reason: "ativo fora da faixa de 0,50% da mínima de 30 dias" };
    }
    if (direction !== "BUY") return { eligible: false, reason: "direção não identificada" };
    if (!MIN30_PATTERNS[direction].includes(String(input.pattern || ""))) {
      return { eligible: false, reason: "padrão não está entre os prioritários da direção" };
    }
    if (input.patternConfirmed !== true) {
      return { eligible: false, reason: "padrão ainda sem confirmação de volume/OBV ou rompimento" };
    }
    if (!(Number(input.score) >= MIN30_SCORE_MIN)) {
      return { eligible: false, reason: "score técnico abaixo de 50/100" };
    }
    return { eligible: true, reason: "mínima 30D e padrão direcional confirmados", direction, pattern: String(input.pattern), distancePct: distance };
  }

  function entryGate(signal, minimum, price, now = Date.now(), armed = null) {
    const fail = reason => ({ eligible: false, confirmed: false, reason });
    const w = minimum?.windows?.["30d"];
    const age = now - Number(minimum?.updatedAt);
    if (!w || !Number.isFinite(age) || age < 0 || age > 480000 || minimum.error || !(w.low > 0) || !(w.candles >= 720)) return fail("mínima 30d indisponível ou antiga");
    if (!(price > 0) || !Number.isFinite(price) || signal?.dir !== "BUY" || signal.timeframe !== "1h" || !signal.closedCandles) return fail("exige compra e candles H1 fechados");
    const distance = (price / w.low - 1) * 100;
    const continuing = armed?.policyVersion === "m6-entry-v2" && armed.entryDir === "BUY" && Number.isFinite(armed.armedAt) && now >= armed.armedAt && now - armed.armedAt <= 21600000 && price >= armed.minimum30 && price <= armed.entryPrice * 1.03;
    if (armed && !continuing) return fail("alerta expirado, invalidado ou esticado");
    if (distance < 0 || (!continuing && distance > 0.5)) return fail("fora da mínima 30d ou janela de confirmação");
    const name = signal.confirmedPattern || signal.pattern;
    if (!MIN30_PATTERNS.BUY.includes(name) || !(signal.score >= 35) || !signal.compression || !signal.patternObvConfirmed) return fail("aguardando estrutura, compressão e OBV");
    const f = signal.buyerFlow;
    // Missing aggression data never silently confirms a signal.
    const flowOk = !!f && Number.isFinite(f.ratio) && f.ratio >= 0.55 && f.ratio <= 1;
    const confirmed = signal.patternConfirmed === true && signal.score >= 50 && signal.patternVolumeRatio >= VOLUME_MIN && flowOk;
    return { eligible: true, confirmed, distancePct: distance, minimum30: w.low, reason: confirmed ? "mínima armada + estrutura, volume, OBV e agressão compradora" : "alerta antecipado; aguardando confirmação conjunta", policyVersion: "m6-entry-v2" };
  }

  return { VERSION: "lab-pattern-policy-v1", VOLUME_MIN, SELL_WEIGHT_FACTOR, RULES, assess, entryGate, MIN30_DISTANCE_MAX_PCT, MIN30_SCORE_MIN, MIN30_PATTERNS, assessMin30 };
});
