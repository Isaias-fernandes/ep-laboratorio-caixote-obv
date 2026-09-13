/* Central 3 — Antecipação Early Warning. Totalmente isolada das centrais atuais. */
(function(){
  let feed={generatedAt:null,signals:[],stats:{crypto:{ok:0,error:0},b3:{ok:0,error:0}}};
  const esc=s=>String(s??'—').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]));
  const num=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
  function band(p){return p>=85?'MUITO FORTE':p>=75?'FORTE':p>=65?'MODERADO':'OBSERVAR'}
  function windowText(x){const h=Number(x.historical?.avgLead);if(!Number.isFinite(h))return '—';if(h<=4)return '1–6h';if(h<=8)return '3–12h';return '6–24h'}
  function confluenceText(x){if((x.confluence||0)>=3)return `${x.confluence} padrões`;if((x.confluence||0)===2)return '2 padrões';return 'isolado'}
  async function load(){try{const r=await fetch(`data/early-warning-auto.json?ts=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);feed=await r.json()}catch(e){console.warn('Early Warning indisponível:',e.message)}render()}
  function render(){const body=document.getElementById('earlyWarningBody'),status=document.getElementById('earlyWarningStatus');if(status){const when=feed.generatedAt?new Date(feed.generatedAt).toLocaleString('pt-BR'):'aguardando primeira varredura',c=feed.stats?.crypto||{},b=feed.stats?.b3||{};status.textContent=`Early Warning H1 · última varredura: ${when} · Cripto ${c.ok||0} OK/${c.error||0} erro(s) · B3 ${b.ok||0} OK/${b.error||0} erro(s) · ${feed.signals?.length||0} pré-sinal(is)`}if(!body)return;const rows=(feed.signals||[]).slice(0,100);body.innerHTML=rows.map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString('pt-BR')}</td><td>${esc(x.market)}</td><td>${esc(x.symbol)}</td><td>${esc(x.name)}</td><td>${x.score}</td><td>${x.priority}</td><td>${band(x.priority)}</td><td>${confluenceText(x)}</td><td>${x.obvConfirm?'✓':'—'}</td><td>${x.compression?'✓':'—'}</td><td>${num(x.distanceToBreakoutPct,2)}%</td><td>${num(x.historical?.breakout24,1)}%</td><td>${windowText(x)}</td><td>+10% ${num(x.historical?.hit10,1)}% · +20% ${num(x.historical?.hit20,1)}%</td></tr>`).join('')||'<tr><td colspan="14">Nenhum pré-sinal Early Warning disponível.</td></tr>'}
  document.addEventListener('DOMContentLoaded',()=>{load();setInterval(load,300000)});
})();
