/*
 * LABORATORIO EXPERIMENTAL EMA MULTI-TIMEFRAME
 * Isolado: nao altera engine.js, score, Centrais 1-3 ou outros experimentos.
 * Configuracao A: EMA por funcao (H1 21/50/200, M15 9/21/50/200, M5 9/21/50).
 * Configuracao B: EMA 9/21/50/200 + RSI + OBV + volume.
 */
(() => {
  'use strict';
  const KEY='lab_ema_mtf_tests_v1';
  const $=id=>document.getElementById(id);
  const fmt=(v,d=2)=>Number.isFinite(+v)?(+v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const cls=v=>v==='COMPRA'?'buy':v==='VENDA'?'sell':v==='PREPARAÇÃO'?'watch':'neutral';

  function ensureUI(){
    if($('emaMtfLab')) return;
    const main=document.querySelector('main'); if(!main) return;
    const sec=document.createElement('section');
    sec.id='emaMtfLab'; sec.className='panel interpretation-center';
    sec.innerHTML=`
      <div class="center-title"><div><span class="eyebrow">TESTE EXPERIMENTAL</span><h2>EMA Multi-Timeframe · duas configurações</h2></div><span class="pill watch">CRIPTO / FUTUROS</span></div>
      <p>Teste isolado. Busca candles públicos da Binance apenas para análise. Não altera score, sinais, Centrais 1–3 ou outros módulos do laboratório.</p>
      <div class="controls" style="margin:12px 0">
        <div><label>Ativo</label><input id="emaMtfSymbol" value="BTCUSDT" maxlength="20"></div>
        <button id="emaMtfRun" class="primary">Executar testes EMA</button>
      </div>
      <section id="emaMtfStatus" class="notice">Aguardando execução.</section>
      <div class="grid">
        <article class="panel"><h2>Configuração A · Tendência → confirmação → gatilho</h2><div id="emaConfigA" class="facts"></div></article>
        <article class="panel"><h2>Configuração B · EMA + RSI + OBV + volume</h2><div id="emaConfigB" class="facts"></div></article>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Ativo</th><th>Config.</th><th>Leitura</th><th>H1</th><th>M15</th><th>M5</th><th>RSI M15</th><th>OBV</th><th>Volume M5</th></tr></thead><tbody id="emaMtfHistory"></tbody></table></div>`;
    const ref=$('earlyWarningStatus')?.closest('.interpretation-center') || document.querySelector('.interpretation-center');
    if(ref?.parentNode) ref.parentNode.insertBefore(sec,ref.nextSibling); else main.appendChild(sec);
    $('emaMtfRun').addEventListener('click',run);
    renderHistory();
  }

  function fact(k,v){return `<div class="fact"><span>${k}</span><strong>${v}</strong></div>`}
  function ema(values,p){
    if(values.length<p) return null; const k=2/(p+1); let e=values.slice(0,p).reduce((a,b)=>a+b,0)/p;
    for(let i=p;i<values.length;i++) e=values[i]*k+e*(1-k); return e;
  }
  function rsi(values,p=14){
    if(values.length<p+1) return null; let g=0,l=0;
    for(let i=values.length-p;i<values.length;i++){const d=values[i]-values[i-1]; if(d>=0)g+=d; else l-=d;}
    if(!l) return 100; const rs=(g/p)/(l/p); return 100-(100/(1+rs));
  }
  function obv(c){
    let v=0, arr=[0]; for(let i=1;i<c.length;i++){if(c[i].c>c[i-1].c)v+=c[i].v;else if(c[i].c<c[i-1].c)v-=c[i].v;arr.push(v);} return arr;
  }
  function avg(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
  function snapshot(c){
    const closes=c.map(x=>x.c), vols=c.map(x=>x.v), o=obv(c), last=c.at(-1);
    const e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50),e200=ema(closes,200);
    const obvSlope=o.length>=11?o.at(-1)-o.at(-11):0;
    const volAvg=avg(vols.slice(-21,-1));
    return {last,close:last?.c,e9,e21,e50,e200,rsi:rsi(closes),obv:o.at(-1),obvSlope,volRatio:volAvg?last.v/volAvg:null};
  }
  function recentRetest(c,s,dir){
    const recent=c.slice(-3); if(!s.e21) return false;
    return dir==='BUY'
      ? recent.some(x=>x.l<=s.e21*1.003 && x.c>=s.e21)
      : recent.some(x=>x.h>=s.e21*.997 && x.c<=s.e21);
  }
  async function getKlines(symbol,interval,limit=260){
    const url=`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
    const r=await fetch(url); if(!r.ok) throw new Error(`Binance ${interval}: HTTP ${r.status}`);
    const j=await r.json(); if(!Array.isArray(j)) throw new Error('Resposta inválida da Binance.');
    return j.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})).filter(x=>Number.isFinite(x.c));
  }
  function sideH1(s){
    if(s.close>s.e200 && s.e50>s.e200) return 'BUY';
    if(s.close<s.e200 && s.e50<s.e200) return 'SELL';
    return 'NEUTRAL';
  }
  function configA(c5,c15,c60){
    const m5=snapshot(c5),m15=snapshot(c15),h1=snapshot(c60),bias=sideH1(h1);
    const m15Buy=m15.e9>m15.e21, m15Sell=m15.e9<m15.e21;
    const trigBuy=m5.e9>m5.e21 && m5.close>m5.e21 && recentRetest(c5,m5,'BUY');
    const trigSell=m5.e9<m5.e21 && m5.close<m5.e21 && recentRetest(c5,m5,'SELL');
    let verdict='NÃO ENTRAR';
    if(bias==='BUY'&&m15Buy&&trigBuy) verdict='COMPRA';
    else if(bias==='SELL'&&m15Sell&&trigSell) verdict='VENDA';
    else if((bias==='BUY'&&m15Buy)||(bias==='SELL'&&m15Sell)) verdict='PREPARAÇÃO';
    return {verdict,bias,m5,m15,h1,m15State:m15Buy?'ALTA':m15Sell?'BAIXA':'NEUTRO',m5State:trigBuy?'GATILHO ALTA':trigSell?'GATILHO BAIXA':'SEM GATILHO'};
  }
  function configB(c5,c15,c60){
    const a=configA(c5,c15,c60),dir=a.bias;
    const rsiOk=dir==='BUY'?a.m15.rsi>50&&a.m15.rsi<75:dir==='SELL'?a.m15.rsi<50&&a.m15.rsi>25:false;
    const obvOk=dir==='BUY'?a.m15.obvSlope>0:dir==='SELL'?a.m15.obvSlope<0:false;
    const volumeOk=(a.m5.volRatio||0)>=1.20;
    const emaOk=(dir==='BUY'&&a.m15.e9>a.m15.e21&&a.m15.e21>a.m15.e50)||(dir==='SELL'&&a.m15.e9<a.m15.e21&&a.m15.e21<a.m15.e50);
    const confirms=[emaOk,rsiOk,obvOk,volumeOk].filter(Boolean).length;
    let verdict='NÃO ENTRAR';
    const trigger=a.m5State.startsWith('GATILHO');
    if(dir!=='NEUTRAL'&&trigger&&confirms>=3) verdict=dir==='BUY'?'COMPRA':'VENDA';
    else if(dir!=='NEUTRAL'&&confirms>=2) verdict='PREPARAÇÃO';
    return {...a,verdict,rsiOk,obvOk,volumeOk,emaOk,confirms};
  }
  function store(symbol,name,r){
    const h=JSON.parse(localStorage.getItem(KEY)||'[]');
    h.unshift({ts:Date.now(),date:new Date().toLocaleString('pt-BR'),symbol,name,verdict:r.verdict,bias:r.bias,m15:r.m15State,m5:r.m5State,rsi:r.m15.rsi,obvSlope:r.m15.obvSlope,volRatio:r.m5.volRatio});
    localStorage.setItem(KEY,JSON.stringify(h.slice(0,300))); renderHistory();
  }
  function renderHistory(){
    const root=$('emaMtfHistory'); if(!root)return; const h=JSON.parse(localStorage.getItem(KEY)||'[]').slice(0,30);
    root.innerHTML=h.length?h.map(x=>`<tr><td>${x.date}</td><td>${x.symbol}</td><td>${x.name}</td><td><b class="${cls(x.verdict)}">${x.verdict}</b></td><td>${x.bias}</td><td>${x.m15}</td><td>${x.m5}</td><td>${fmt(x.rsi,1)}</td><td>${x.obvSlope>0?'SUBINDO':x.obvSlope<0?'CAINDO':'LATERAL'}</td><td>${fmt(x.volRatio,2)}×</td></tr>`).join(''):'<tr><td colspan="10">Nenhum teste executado.</td></tr>';
  }
  function renderA(r){
    $('emaConfigA').innerHTML=fact('Leitura',`<span class="${cls(r.verdict)}">${r.verdict}</span>`)+fact('H1 · direção principal',r.bias)+fact('H1 · preço / EMA200',`${fmt(r.h1.close)} / ${fmt(r.h1.e200)}`)+fact('H1 · EMA50 / EMA200',`${fmt(r.h1.e50)} / ${fmt(r.h1.e200)}`)+fact('M15 · EMA9 / EMA21',`${fmt(r.m15.e9)} / ${fmt(r.m15.e21)} · ${r.m15State}`)+fact('M5 · EMA9 / EMA21',`${fmt(r.m5.e9)} / ${fmt(r.m5.e21)} · ${r.m5State}`)+fact('Regra','H1 direção → M15 confirmação → M5 pullback/reteste + retomada 9/21');
  }
  function renderB(r){
    $('emaConfigB').innerHTML=fact('Leitura',`<span class="${cls(r.verdict)}">${r.verdict}</span>`)+fact('Confirmações',`${r.confirms}/4`)+fact('EMA M15 9/21/50',r.emaOk?'ALINHADA':'NÃO ALINHADA')+fact('RSI M15',`${fmt(r.m15.rsi,1)} · ${r.rsiOk?'CONFIRMA':'NÃO CONFIRMA'}`)+fact('OBV M15',`${r.m15.obvSlope>0?'SUBINDO':r.m15.obvSlope<0?'CAINDO':'LATERAL'} · ${r.obvOk?'CONFIRMA':'NÃO CONFIRMA'}`)+fact('Volume M5',`${fmt(r.m5.volRatio,2)}× média 20 · ${r.volumeOk?'CONFIRMA':'ABAIXO DE 1,20×'}`)+fact('Regra','EMA + RSI + OBV + volume; exige 3/4 confirmações e gatilho M5 para COMPRA/VENDA');
  }
  async function run(){
    const symbol=($('emaMtfSymbol')?.value||$('symbol')?.value||'BTCUSDT').trim().toUpperCase();
    $('emaMtfStatus').textContent=`Buscando M5, M15 e H1 de ${symbol}...`;
    try{
      const [c5,c15,c60]=await Promise.all([getKlines(symbol,'5m'),getKlines(symbol,'15m'),getKlines(symbol,'1h')]);
      if(c5.length<210||c15.length<210||c60.length<210) throw new Error('Histórico insuficiente para EMA 200.');
      const a=configA(c5,c15,c60),b=configB(c5,c15,c60); renderA(a);renderB(b);store(symbol,'A',a);store(symbol,'B',b);
      $('emaMtfStatus').textContent=`Teste concluído para ${symbol}. Resultado apenas experimental; duas configurações registradas localmente para comparação futura.`;
    }catch(e){$('emaMtfStatus').textContent=`Falha no teste EMA: ${e.message}`;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUI);else ensureUI();
  window.EMAMtfExperimentalLab={run,getHistory:()=>JSON.parse(localStorage.getItem(KEY)||'[]')};
})();
