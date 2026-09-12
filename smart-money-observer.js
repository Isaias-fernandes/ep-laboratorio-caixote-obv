(()=>{
  const fmt=(v,d=2)=>Number.isFinite(+v)?(+v).toFixed(d):'—';
  const pct=v=>Number.isFinite(+v)?`${(+v).toFixed(2)}%`:'—';
  const yes=v=>v?'SIM':'NÃO';
  const el=(tag,html)=>{const x=document.createElement(tag);x.innerHTML=html;return x.firstElementChild};

  async function load(){
    const r=await fetch(`data/h1-history.json?t=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw Error(`HTTP ${r.status}`);
    return r.json();
  }

  function stats(records){
    const obs=records.filter(r=>r.smartMoneyObserver);
    const full=obs.filter(r=>r.smartMoneyObserver?.confluence?.fullAny);
    const absMae=a=>a.length?a.reduce((s,r)=>s+Math.abs(+r.tracking?.mae||0),0)/a.length:null;
    const favFirst=(a,t)=>{const d=a.filter(r=>r.tracking?.order?.[t]);return d.length?100*d.filter(r=>String(r.tracking.order[t]).startsWith('FAVORAVEL_PRIMEIRO')).length/d.length:null};
    return{obs,full,baseMae:absMae(obs),fullMae:absMae(full),base05:favFirst(obs,'0.5'),full05:favFirst(full,'0.5'),base1:favFirst(obs,'1'),full1:favFirst(full,'1'),base2:favFirst(obs,'2'),full2:favFirst(full,'2')};
  }

  function row(r){
    const o=r.smartMoneyObserver||{},liq=o.liquiditySweep?.type||'—',st=o.structure?.type||'—',fvg=o.fvg?.type||'—',f=o.futures||{},c=o.confluence||{};
    return `<tr>
      <td>${r.market||'—'}</td><td>${r.symbol||'—'}</td><td>${r.direction||'—'}</td><td>${r.score??'—'}</td>
      <td>${liq}</td><td>${st}</td><td>${fvg}${o.fvg?.mitigated===false?' · ATIVO':''}</td>
      <td>${o.vwap?.side||'—'} (${pct(o.vwap?.entryDistancePct)})</td>
      <td>${fmt(o.volumeProfile?.poc,6)}</td><td>${r.indicators?.obv||'—'}</td>
      <td>${pct(f.oiChangePct)}</td><td>${f.aggression||'—'}</td><td>${yes(c.fullAny)}</td>
      <td>${pct(r.tracking?.mfe)}</td><td>${pct(r.tracking?.mae)}</td>
      <td>${r.tracking?.order?.['0.5']||'—'}</td><td>${r.tracking?.order?.['1']||'—'}</td><td>${r.tracking?.order?.['2']||'—'}</td>
    </tr>`;
  }

  function render(data){
    const records=Array.isArray(data.records)?data.records:[],s=stats(records);
    let box=document.getElementById('smartMoneyObserverPanel');
    if(!box){
      box=el('div',`<section id="smartMoneyObserverPanel" class="panel interpretation-center">
        <div class="center-title"><div><span class="eyebrow">OBSERVADOR EXPERIMENTAL</span><h2>Smart Money · Liquidez · Estrutura</h2></div><span class="pill watch">NÃO ALTERA SINAIS</span></div>
        <p>Liquidity Sweep / Stop Hunt → CHoCH/MSB → FVG → VWAP → Volume Profile/POC. Usa o histórico H1 96/80 apenas para estudo estatístico. O POC é aproximado por volume da vela no preço típico, não perfil tick-by-tick.</p>
        <div class="summary" id="smartMoneySummary"></div>
        <div class="table-wrap"><table><thead><tr><th>Mercado</th><th>Ativo</th><th>Dir.</th><th>Score</th><th>Sweep</th><th>CHoCH/MSB</th><th>FVG</th><th>VWAP</th><th>POC</th><th>OBV</th><th>Δ OI</th><th>Fluxo</th><th>Confluência</th><th>MFE</th><th>MAE</th><th>0,5%</th><th>1%</th><th>2%</th></tr></thead><tbody id="smartMoneyBody"></tbody></table></div>
      </section>`);
      const first=document.querySelector('.interpretation-center');
      (first?.parentNode||document.querySelector('main')||document.body).insertBefore(box,first||null);
    }
    document.getElementById('smartMoneySummary').innerHTML=`
      <article><span>Registros observados</span><strong>${s.obs.length}</strong></article>
      <article><span>Confluência completa</span><strong>${s.full.length}</strong></article>
      <article><span>MAE médio · geral</span><strong>${pct(s.baseMae)}</strong></article>
      <article><span>MAE médio · confluência</span><strong>${pct(s.fullMae)}</strong></article>
      <article><span>+0,5% primeiro · geral</span><strong>${pct(s.base05)}</strong></article>
      <article><span>+0,5% primeiro · confluência</span><strong>${pct(s.full05)}</strong></article>
      <article><span>+1% primeiro · geral</span><strong>${pct(s.base1)}</strong></article>
      <article><span>+1% primeiro · confluência</span><strong>${pct(s.full1)}</strong></article>
      <article><span>+2% primeiro · geral</span><strong>${pct(s.base2)}</strong></article>
      <article><span>+2% primeiro · confluência</span><strong>${pct(s.full2)}</strong></article>`;
    document.getElementById('smartMoneyBody').innerHTML=s.obs.slice(0,80).map(row).join('')||'<tr><td colspan="18">Aguardando enriquecimento do histórico automático.</td></tr>';
  }

  async function refresh(){try{render(await load())}catch(e){console.warn('[SmartMoneyObserver]',e)}}
  window.EPLabSmartMoneyObserver={refresh,load};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
  setInterval(refresh,5*60*1000);
})();
