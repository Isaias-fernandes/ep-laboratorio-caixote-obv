/* LABORATORIO ISOLADO — observador MACD 12/26/9. Nao altera sinais, scores ou motores. */
(()=>{
  if(window.EPLabMacdObserver)return;
  const KEY='ep_lab_macd_observer_v1', MAX=3000;
  const ema=(v,p)=>{if(!v.length)return[];const k=2/(p+1),o=[v[0]];for(let i=1;i<v.length;i++)o.push(v[i]*k+o[i-1]*(1-k));return o};
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const save=r=>{try{localStorage.setItem(KEY,JSON.stringify(r.slice(-MAX)))}catch{}};
  function analyze(candles){
    const c=(candles||[]).filter(x=>Number.isFinite(+x.c));
    if(c.length<40)return null;
    const close=c.map(x=>+x.c),e12=ema(close,12),e26=ema(close,26),dif=close.map((_,i)=>e12[i]-e26[i]),dea=ema(dif,9),hist=dif.map((x,i)=>x-dea[i]);
    const i=close.length-1,p=i-1;
    const crossUp=dif[p]<=dea[p]&&dif[i]>dea[i],crossDown=dif[p]>=dea[p]&&dif[i]<dea[i];
    const zeroPos=dif[i]>0?'ACIMA':dif[i]<0?'ABAIXO':'ZERO';
    const histGrowing=Math.sign(hist[i])===Math.sign(hist[p])&&Math.abs(hist[i])>Math.abs(hist[p]);
    const histShrinking=Math.sign(hist[i])===Math.sign(hist[p])&&Math.abs(hist[i])<Math.abs(hist[p]);
    let divergence='NENHUMA';
    if(close.length>=36){
      const oldP=close.slice(-36,-18),newP=close.slice(-18),oldH=hist.slice(-36,-18),newH=hist.slice(-18);
      if(Math.max(...newP)>Math.max(...oldP)&&Math.max(...newH)<Math.max(...oldH))divergence='TOPO_BAIXISTA';
      else if(Math.min(...newP)<Math.min(...oldP)&&Math.min(...newH)>Math.min(...oldH))divergence='FUNDO_ALTISTA';
    }
    let state='NEUTRO';
    if(crossUp)state=zeroPos==='ACIMA'?'CRUZAMENTO_DOURADO_FORTE':'CRUZAMENTO_DOURADO';
    else if(crossDown)state=zeroPos==='ABAIXO'?'CRUZAMENTO_MORTE_FORTE':'CRUZAMENTO_MORTE';
    else if(hist[i]>0&&histGrowing)state='MOMENTUM_COMPRADOR_CRESCENTE';
    else if(hist[i]<0&&histGrowing)state='MOMENTUM_VENDEDOR_CRESCENTE';
    else if(histShrinking)state='MOMENTUM_ENFRAQUECENDO';
    return{dif:dif[i],dea:dea[i],hist:hist[i],histPrev:hist[p],crossUp,crossDown,zeroPos,histGrowing,histShrinking,divergence,state};
  }
  function motorSnapshot(c){
    try{
      const sigs=window.EPExperimentalMotors?.evaluate?.(c)||[],active=sigs.filter(x=>+x.score>=80),ids=new Set(active.map(x=>x.id));
      return{count:ids.size,signature:[1,2,3,4,5].map(id=>ids.has(id)?'1':'0').join(''),active:active.map(x=>`M${x.id} ${x.direction} ${x.score}`)};
    }catch{return{count:0,signature:'00000',active:[]}}
  }
  function record(symbol,interval,c,r){
    const m=motorSnapshot(c),rows=load(),price=+c.at(-1)?.c||0,key=[symbol,interval,r.state,r.divergence,m.signature].join('|'),last=rows.at(-1);
    if(last?.key===key&&Date.now()-last.at<5*60*1000)return m;
    rows.push({key,at:Date.now(),symbol,interval,price,macd:r,motors:m});save(rows);return m;
  }
  function ensure(){
    let el=document.getElementById('labMacdObserver');if(el)return el;
    el=document.createElement('section');el.id='labMacdObserver';el.className='panel interpretation-center';
    el.innerHTML='<div class="center-title"><div><span class="eyebrow">OBSERVADOR EXPERIMENTAL</span><h2>MACD 12/26/9 avançado</h2></div><span class="pill watch">NÃO INTERFERE NOS SINAIS</span></div><p>Observa cruzamentos, eixo zero, expansão/encolhimento do histograma e divergências. Registra também os motores experimentais ativos no mesmo instante.</p><div id="labMacdObserverBody" class="facts"><div class="fact"><span>Status</span><strong>Aguardando candles H1...</strong></div></div><div id="labMacdAutoSummary" class="notice">Sinais automáticos: aguardando leitura.</div>';
    const ref=document.querySelector('.interpretation-center');(ref?.parentNode||document.querySelector('main'))?.insertBefore(el,ref||null);return el;
  }
  const fmt=n=>Number.isFinite(+n)?(+n).toFixed(6):'—';
  async function render(){
    ensure();const c=window.LabData?.candles||[],body=document.getElementById('labMacdObserverBody');
    if(c.length>=40){
      const r=analyze(c),m=record(window.LabData?.symbol||'—',window.LabData?.interval||'—',c,r);
      body.innerHTML=`<div class="fact"><span>Ativo / período</span><strong>${window.LabData?.symbol||'—'} · ${window.LabData?.interval||'—'}</strong></div><div class="fact"><span>Estado</span><strong>${r.state.replaceAll('_',' ')}</strong></div><div class="fact"><span>DIF / DEA</span><strong>${fmt(r.dif)} / ${fmt(r.dea)}</strong></div><div class="fact"><span>Histograma</span><strong>${fmt(r.hist)} (${r.histGrowing?'expandindo':r.histShrinking?'encolhendo':'estável'})</strong></div><div class="fact"><span>Eixo zero</span><strong>${r.zeroPos}</strong></div><div class="fact"><span>Divergência</span><strong>${r.divergence.replaceAll('_',' ')}</strong></div><div class="fact"><span>Motores experimentais ≥80</span><strong>${m.count} · ${m.signature}</strong></div><div class="fact"><span>Motores ativos</span><strong>${m.active.join(' · ')||'nenhum'}</strong></div>`;
    }else body.innerHTML='<div class="fact"><span>Status</span><strong>Carregue pelo menos 40 candles; H1/96 é o protocolo preferido.</strong></div>';
    try{
      const j=await fetch('data/auto-signals.json?macdObs='+Date.now(),{cache:'no-store'}).then(x=>x.json()),s=Array.isArray(j.signals)?j.signals:[];
      const confirmed=s.filter(x=>x.patternConfirmed===true).length,unconfirmed=s.filter(x=>x.patternConfirmed===false).length,aligned=s.filter(x=>x.momentumAligned===true).length,buy=s.filter(x=>x.direction==='COMPRA').length,sell=s.filter(x=>x.direction==='VENDA').length;
      const e=document.getElementById('labMacdAutoSummary');if(e)e.innerHTML=`<b>Leitura dos sinais automáticos atuais:</b> ${s.length} sinais · ${buy} COMPRA · ${sell} VENDA · ${confirmed} padrão confirmado · ${unconfirmed} não confirmado · ${aligned} com momentum alinhado. <b>Somente observação.</b>`;
    }catch{}
  }
  window.EPLabMacdObserver={analyze,getHistory:load,render};
  document.addEventListener('click',e=>{if(e.target?.id==='analyze'||e.target?.id==='sample')setTimeout(render,100)});
  document.addEventListener('change',e=>{if(e.target?.id==='file'||e.target?.id==='symbol'||e.target?.id==='interval')setTimeout(render,150)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensure();setTimeout(render,800)});else{ensure();setTimeout(render,800)}
})();
