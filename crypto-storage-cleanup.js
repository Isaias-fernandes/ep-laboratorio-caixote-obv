(() => {
  const allowed = value => ['crypto', 'cripto'].includes(String(value).toLowerCase());
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean).filter(item => item !== undefined);
    if (!value || typeof value !== 'object') return value;
    if (value.market != null && !allowed(value.market)) return undefined;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (/b3|brapi/i.test(key)) continue;
      const next = clean(item);
      if (next !== undefined) result[key] = next;
    }
    return result;
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (/b3|brapi/i.test(key)) { localStorage.removeItem(key); continue; }
      if (!/^(ep_|lab_|early_|pattern_|smart_)/.test(key)) continue;
      try {
        const raw = localStorage.getItem(key), parsed = JSON.parse(raw), next = clean(parsed);
        if (next === undefined) localStorage.removeItem(key);
        else if (JSON.stringify(parsed) !== JSON.stringify(next)) localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    }
  } catch {}
})();
