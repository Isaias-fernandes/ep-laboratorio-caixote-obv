(() => {
  'use strict';
  const PROJECT = "ep-laboratorio";
  const STORAGE_KEYS = [
  "ep_lab_capital_flow_v1",
  "ep_lab_experimental_activation_v1",
  "ep_lab_macd_observer_v1",
  "ep_lab_modelos_ab_latest",
  "ep_market_cycle_history_v1",
  "ep_oscillation_lab_v1",
  "ep_oscillation_lab_v1_db",
  "ep_structure_volume_lab_v2",
  "lab_ema_mtf_tests_v1",
  "lab_pattern_backtests_v2",
  "lab_pattern_signal_history_v2",
  "labHistory"
];
  const RETENTION_NOTE = "O backup inclui apenas registros ainda presentes no navegador; históricos locais limitados (por exemplo, até 300 episódios e 50 backtests no laboratório de padrões) mantêm os limites existentes.";
  const countRows = value => {
    if (Array.isArray(value)) return value.length;
    if (!value || typeof value !== 'object') return 1;
    for (const name of ['records', 'events', 'history', 'closed', 'signals']) {
      if (Array.isArray(value[name])) return value[name].length;
    }
    for (const name of ['items', 'open']) {
      if (value[name] && typeof value[name] === 'object') return Object.keys(value[name]).length;
    }
    return Object.keys(value).length;
  };
  function exportBackup() {
    const stored = {};
    const inventory = [];
    let bytesApprox = 0;
    for (const key of STORAGE_KEYS) {
      let raw;
      try { raw = localStorage.getItem(key); } catch (_) { continue; }
      if (raw == null) continue;
      bytesApprox += raw.length * 2;
      let value = raw;
      try { value = JSON.parse(raw); } catch (_) {}
      stored[key] = value;
      inventory.push({ key, approxBytes: raw.length * 2, records: countRows(value) });
    }
    const exportedAt = new Date().toISOString();
    const payload = {
      format: 'ep-signals-backup',
      version: 1,
      project: PROJECT,
      exportedAt,
      scope: 'Dados locais deste projeto e desta origem/navegador',
      inventory: { keysWithData: inventory.length, approxBytes, entries: inventory },
      retentionNote: RETENTION_NOTE,
      localStorage: stored
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const stamp = exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    link.href = url;
    link.download = PROJECT + '-sinais-backup-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const status = document.getElementById('epSignalsBackupStatus');
    if (status) status.textContent = inventory.length
      ? 'Backup baixado: ' + inventory.length + ' grupos de dados • ' + inventory.reduce((n, row) => n + row.records, 0) + ' registros/itens contabilizados.'
      : 'Backup baixado. Nenhuma chave de histórico deste projeto tinha dados salvos neste navegador.';
  }
  function init() {
    const main = document.querySelector('main');
    if (!main || document.getElementById('epSignalsBackupCard')) return;
    const section = document.createElement('section');
    section.id = 'epSignalsBackupCard';
    section.className = 'card';
    section.innerHTML = '<h2>BACKUP LOCAL DE TODOS OS SINAIS</h2>' +
      '<p class="sub">Baixa em um arquivo JSON os históricos e experimentos deste notebook que estão salvos neste navegador. O arquivo não apaga nem envia os dados.</p>' +
      '<button type="button" id="epSignalsBackupButton">Exportar todos os sinais</button>' +
      '<p id="epSignalsBackupStatus" class="sub" role="status" aria-live="polite">Inclui todos os grupos de dados locais reconhecidos por este projeto. ${RETENTION_NOTE}</p>';
    main.prepend(section);
    document.getElementById('epSignalsBackupButton').addEventListener('click', exportBackup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
