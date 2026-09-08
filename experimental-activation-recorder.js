/* LABORATÓRIO ISOLADO — registrador observacional dos 5 motores experimentais.
 * NÃO altera a lógica dos motores, score, sinais ou o EP Whale.
 * Registra preço/horário da primeira ativação de cada motor e de cada padrão observado.
 */
(function(root){
'use strict';
const KEY='ep_lab_experimental_activation_v1', LIMIT=160, EVENT_LIMIT=500;
const MOTOR_NAMES={1:'Padrões/Breakout',2:'Tendência/Estrutura',3:'Volume/Acumulação',4:'Volatilidade/Expansão',5:'Fluxo/Baleias'};
const now=()=>Date.now();
const load=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&typeof x==='object'?{open:x.open||{},closed:Array.isArray(x.closed)?x.closed:[],patternEvents:Array.isArray(x.patternEvents)?x.patternEvents:[]}:{open:{},closed:[],patternEvents:[]}}catch{return{open:{},closed:[],patternEvents:[]}}};
let db=load();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch{}};
const priceOf=c=>{const x=c?.at?.(-1);return +(x?.c??x?.close)};
const timeOf=c=>{const x=c?.at?.(-1);let t=+(x?.t??x?.time??x?.timestamp);return Number.isFinite(t)&&t>0?t:now()};
const symbolOf=()=>String(root.LabData?.symbol||'UNKNOWN').toUpperCase();
const intervalOf=()=>String(root.LabData?.interval||'').toLowerCase();
const id=(sym,dir)=>`${sym}|${dir}`;
const active=sigs=>Array.isArray(sigs)?sigs.filter(x=>Number(x.score)>=80&&(x.direction==='BUY'||x.direction==='SELL')):[];
const fmt=n=>Number.isFinite(+n)?(+n).toLocaleString('pt-BR',{maximumFractionDigits:+n<10?6:2}):'—';
const dt=t=>t?new Date(t).toLocaleString('pt-BR'):'—';
const esc=s=>String(s??'—').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]));

function patternSnapshot(c){
  const out=[];
  try{for(const p of (root.EPStructuralPatternDetectors?.detect?.(c)||[])){if(p.breakout&&Number(p.score)>=80)out.push({source:'ESTRUTURAL',name:p.name,direction:p.direction,score:+p.score||0,stage:p.stage||'',family:p.family||''})}}catch{}
  try{for(const p of (root.EPCandlestickPatternsLab?.detect?.(c)||[])){if(Number(p.score)>=80)out.push({source:'CANDLE',name:p.name,direction:p.direction,score:+p.score||0,stage:'DETECTADO',family:p.type||''})}}catch{}
  return out;
}
function recordPatterns(sym,c,p,ts,motors){
  const pats=patternSnapshot(c); const seen=new Set(db.patternEvents.slice(0,120).map(x=>x.key));
  for(const x of pats){const key=[sym,x.source,x.name,x.direction,ts].join('|');if(seen.has(key))continue;db.patternEvents.unshift({key,symbol:sym,time:ts,price:p,...x,activeMotorIds:motors.map(m=>m.id),activeMotors:motors.map(m=>({id:m.id,name:m.name,score:m.score}))});}
  db.patternEvents=db.patternEvents.slice(0,EVENT_LIMIT);
  return pats;
}
function closeEpisode(k,e,p,ts,reason){e.endTs=ts;e.finalPrice=p;e.reason=reason;delete db.open[k];db.closed.unshift(e);db.closed=db.closed.slice(0,LIMIT)}
function process(candles){
  if(intervalOf()!=='1h'||!Array.isArray(candles)||candles.length<96||!root.EPExperimentalMotors?.evaluate)return;
  const sym=symbolOf(),p=priceOf(candles),ts=timeOf(candles);if(!Number.isFinite(p)||p<=0)return;
  const raw=root.EPExperimentalMotors.evaluate(candles),sigs=active(raw),dirs=['BUY','SELL'];
  for(const dir of dirs){
    const m=sigs.filter(x=>x.direction===dir).sort((a,b)=>a.id-b.id),k=id(sym,dir);let e=db.open[k];
    if(!m.length){if(e)closeEpisode(k,e,p,ts,'sem motor score>=80 na direção');continue}
    if(!e){e={id:`${k}|${ts}`,symbol:sym,direction:dir,startTs:ts,startPrice:p,currentPrice:p,peakMotors:m.length,motorFirst:{},stages:{},events:[],patternFirst:{}};db.open[k]=e}
    e.currentPrice=p;e.peakMotors=Math.max(e.peakMotors||0,m.length);e.lastTs=ts;
    for(const x of m){if(!e.motorFirst[x.id])e.motorFirst[x.id]={motorId:x.id,motor:x.name||MOTOR_NAMES[x.id],time:ts,price:p,score:x.score,reason:x.reason,features:x.features||{}}}
    if(!e.stages[m.length])e.stages[m.length]={time:ts,price:p,activeMotorIds:m.map(x=>x.id),activeMotors:m.map(x=>({id:x.id,name:x.name,score:x.score,reason:x.reason}))};
    const sig=m.map(x=>x.id).join(',');const prev=e.events.at(-1);if(!prev||prev.signature!==sig)e.events.push({time:ts,price:p,signature:sig,activeMotorIds:m.map(x=>x.id),activeMotors:m.map(x=>({id:x.id,name:x.name,score:x.score}))});e.events=e.events.slice(-80);
    const pats=recordPatterns(sym,candles,p,ts,m);
    for(const pat of pats){const pk=[pat.source,pat.name,pat.direction].join('|');if(!e.patternFirst[pk])e.patternFirst[pk]={...pat,time:ts,price:p,activeMotorIds:m.map(x=>x.id)}}
  }
  save();render();
}
function stage(e,n){const s=e.stages?.[n];if(!s)return'<span class="ear-empty">não observado</span>';return `<b>${fmt(s.price)}</b><small>${dt(s.time)}</small><small>${s.activeMotorIds.map(x=>'M'+x).join(' + ')}</small>`}
function row(e){return `<tr><td><b>${esc(e.symbol)}</b><small>${esc(e.direction)}</small></td><td>${stage(e,1)}</td><td>${stage(e,2)}</td><td>${stage(e,3)}</td><td>${stage(e,4)}</td><td>${stage(e,5)}</td><td><b>${e.peakMotors||0}/5</b><small>${fmt(e.currentPrice)}</small></td></tr>`}
function patternRows(){return db.patternEvents.slice(0,30).map(x=>`<tr><td>${dt(x.time)}</td><td>${esc(x.symbol)}</td><td>${esc(x.direction)}</td><td>${esc(x.name)}</td><td>${esc(x.source)}</td><td><b>${fmt(x.price)}</b></td><td>${x.score}</td><td>${(x.activeMotorIds||[]).map(i=>'M'+i).join(' + ')||'—'}</td></tr>`).join('')||'<tr><td colspan="8">Nenhum padrão score ≥80 registrado ainda.</td></tr>'}
function ensure(){
  if(document.getElementById('experimentalActivationRecorder'))return;
  const host=document.querySelector('main');if(!host)return;
  const sec=document.createElement('section');sec.id='experimentalActivationRecorder';sec.className='panel interpretation-center';
  sec.innerHTML=`<div class="center-title"><div><span class="eyebrow">ESTUDO OBSERVACIONAL</span><h2>Ativação dos 5 motores experimentais + preço dos padrões</h2></div><span class="pill safe">SEM ALTERAR MOTORES</span></div><p>Registra a primeira observação de M1–M5, preço, horário e quais padrões score ≥80 estavam ativos. H1 · 96 candles.</p><div id="earBody"></div>`;
  const central=document.getElementById('decisionCenter')?.closest('section');if(central)central.before(sec);else host.appendChild(sec);
  const st=document.createElement('style');st.textContent=`#experimentalActivationRecorder small{display:block;opacity:.75;margin-top:2px}.ear-wrap{overflow:auto}.ear-table{width:100%;min-width:1100px;border-collapse:collapse}.ear-table th,.ear-table td{padding:8px;border-bottom:1px solid #26384d;text-align:left;vertical-align:top}.ear-empty{opacity:.55}`;document.head.appendChild(st)
}
function render(){ensure();const rootEl=document.getElementById('earBody');if(!rootEl)return;const episodes=[...Object.values(db.open),...db.closed.slice(0,12)].slice(0,20);rootEl.innerHTML=`<div class="ear-wrap"><table class="ear-table"><thead><tr><th>Ativo</th><th>1 motor</th><th>2 motores</th><th>3 motores</th><th>4 motores</th><th>5 motores</th><th>Pico/Preço</th></tr></thead><tbody>${episodes.length?episodes.map(row).join(''):'<tr><td colspan="7">Aguardando ativações experimentais H1/96/score ≥80.</td></tr>'}</tbody></table></div><h3>Padrões ativados — preço no momento observado</h3><div class="ear-wrap"><table class="ear-table"><thead><tr><th>Momento</th><th>Ativo</th><th>Direção</th><th>Padrão</th><th>Origem</th><th>Preço</th><th>Score</th><th>Motores ativos</th></tr></thead><tbody>${patternRows()}</tbody></table></div>`}
function scan(){try{const candles=root.LabData?.candles;process(candles)}catch{} }
document.addEventListener('DOMContentLoaded',()=>{render();const btn=document.getElementById('analyze');if(btn)btn.addEventListener('click',()=>setTimeout(scan,0));setTimeout(scan,1200)});
root.addEventListener('lab-experimental-scan',scan);
root.EPExperimentalActivationRecorder={scan,get:()=>db,KEY};
})(window);
