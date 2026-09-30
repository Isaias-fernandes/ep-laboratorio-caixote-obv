/* Experimental market-cycle reader. Isolated from official motors, Supabase and pharmacy app. */
(function(root){
'use strict';
const KEY='ep_market_cycle_history_v1';
const PLANS=[
  {label:'M1',source:'1m',group:1},{label:'M5',source:'5m',group:1},
  {label:'M15',source:'15m',group:1},{label:'M30',source:'30m',group:1},
  {label:'H1',source:'1h',group:1},{label:'H2',source:'1h',group:2},
  {label:'H3',source:'1h',group:3},{label:'H5',source:'1h',group:5},
  {label:'H6',source:'1h',group:6},{label:'H24',source:'1d',group:1},
  {label:'2D',source:'1d',group:2},{label:'3D',source:'1d',group:3},
  {label:'7D',source:'1d',group:7}
];
const $=id=>document.getElementById(id);
function readHistory(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
function writeHistory(rows){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-300)));return true}catch(_){return false}}
function fmt(x,d){return Number.isFinite(x)?x.toFixed(d==null?2:d):'—'}
function esc(s){return String(s==null?'—':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function normalize(raw){return raw.map(x=>({t:+x[0],end:+x[6]+1,o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})).filter(x=>x.end<=Date.now()&&[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite))}
async function fetchBars(symbol,interval){
 let last;
 for(const host of ['https://data-api.binance.vision','https://api.binance.com']){
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   const r=await fetch(host+'/api/v3/klines?symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit=1000',{signal:controller.signal,cache:'no-store'});
   clearTimeout(timer);
   if(!r.ok)throw Error('HTTP '+r.status);
   return normalize(await r.json());
  }catch(e){last=e}
 }
 throw last||Error('Fonte indisponível');
}
function aggregate(rows,hours){
 if(hours===1)return rows;
 const ms=hours*3600000,groups=new Map();
 for(const x of rows){const k=Math.floor(x.t/ms)*ms;let g=groups.get(k);if(!g){g={t:k,end:k+ms,o:x.o,h:x.h,l:x.l,c:x.c,v:0,n:0};groups.set(k,g)}g.h=Math.max(g.h,x.h);g.l=Math.min(g.l,x.l);g.c=x.c;g.v+=x.v;g.n++}
 return [...groups.values()].filter(x=>x.n===hours).sort((a,b)=>a.t-b.t)
}
function aggregateDays(rows,days){
 if(days===1)return rows;
 const ms=days*86400000,groups=new Map();
 for(const x of rows){const k=Math.floor(x.t/ms)*ms;let g=groups.get(k);if(!g){g={t:k,end:k+ms,o:x.o,h:x.h,l:x.l,c:x.c,v:0,n:0};groups.set(k,g)}g.h=Math.max(g.h,x.h);g.l=Math.min(g.l,x.l);g.c=x.c;g.v+=x.v;g.n++}
 return [...groups.values()].filter(x=>x.n===days).sort((a,b)=>a.t-b.t)
}
function ema(rows,n){let v=null,a=2/(n+1);for(const x of rows)v=v==null?x.c:v+a*(x.c-v);return v}
function pct(a,b){return a?((b/a)-1)*100:0}
function assess(rows,label,prior){
 if(rows.length<24)return{label:label,ready:false,phase:'DADOS INSUFICIENTES',direction:'—',price:rows.at(-1)?.c,change:null,vol:null,range:null,note:'São necessárias pelo menos 24 velas fechadas.'};
 const last=rows.at(-1),hist=rows.slice(-20),before=rows.slice(-21,-1),high=Math.max(...before.map(x=>x.h)),low=Math.min(...before.map(x=>x.l));
 const volumeBase=before.reduce((a,x)=>a+x.v,0)/before.length,vol=volumeBase?last.v/volumeBase:0;
 const range=last.c?((Math.max(...hist.map(x=>x.h))-Math.min(...hist.map(x=>x.l)))/last.c)*100:0;
 const change=pct(rows.at(-21).c,last.c),short=pct(rows.at(-6).c,last.c),e9=ema(rows.slice(-40),9),e20=ema(rows.slice(-40),20);
 const dir=e9>e20&&last.c>e20?'ALTA':e9<e20&&last.c<e20?'BAIXA':'LATERAL';
 const candleRange=Math.max(last.h-last.l,Number.EPSILON),upper=(last.h-Math.max(last.o,last.c))/candleRange,lower=(Math.min(last.o,last.c)-last.l)/candleRange;
 const breakUp=last.c>high&&vol>=1.15,breakDown=last.c<low&&vol>=1.15;
 let phase='CONSOLIDAÇÃO',note='Preço ainda sem confirmação clara de rompimento ou mudança de tendência.';
 if(Math.abs(change)>=8&&((change>0&&short<0&&upper>=.35)||(change<0&&short>0&&lower>=.35)||vol>=2.4)){
  phase='EXAUSTÃO';note='Movimento amplo com perda de força, rejeição ou pico de volume; risco de correção elevado.';
 }else if(breakUp||breakDown){
  phase='ROMPIMENTO';note='Fechamento além da faixa recente com volume acima da média; acompanhar aceitação do nível.';
 }else if(prior==='ROMPIMENTO'&&((dir==='ALTA'&&Math.abs(pct(high,last.c))<1.2)||(dir==='BAIXA'&&Math.abs(pct(low,last.c))<1.2))){
  phase='RETESTE';note='Preço retornou próximo da região rompida; ainda precisa confirmar sustentação.';
 }else if(Math.abs(change)>=4&&Math.sign(short)!==Math.sign(change)&&Math.abs(short)>=1.2){
  phase='RETRAÇÃO';note='Movimento curto contra a direção das últimas velas; observar suporte/resistência.';
 }else if(Math.abs(change)>=4&&Math.sign(short)===Math.sign(change)&&vol>=1.05){
  phase='ACELERAÇÃO';note='Direção e volume acompanham o movimento recente; verificar distância até resistência/suporte.';
 }else if((high-last.c)/last.c*100<1.2&&dir==='ALTA'&&vol>=1.05){
  phase='PRESSÃO NA RESISTÊNCIA';note='Preço próximo da máxima recente; rompimento ainda não confirmado.';
 }else if((last.c-low)/last.c*100<1.2&&dir==='BAIXA'&&vol>=1.05){
  phase='PRESSÃO NO SUPORTE';note='Preço próximo da mínima recente; perda do suporte ainda não confirmada.';
 }else if(range<=3.5){
  phase='COMPRESSÃO';note='Faixa recente estreita; pode anteceder expansão, sem indicar por si só a direção.';
 }
 return{label:label,ready:true,phase:phase,direction:dir,price:last.c,change:change,vol:vol,range:range,note:note,time:last.end,high:high,low:low}
}
function loadPrior(symbol,label){return readHistory().filter(x=>x.symbol===symbol&&x.timeframe===label).at(-1)?.phase||''}
function record(symbol,rows){
 const history=readHistory(),seen=new Set(history.map(x=>x.id)),now=new Date().toISOString();
 const fresh=rows.filter(x=>x.ready).map(x=>{const id=[symbol,x.label,x.time].join('|');return seen.has(id)?null:{id,symbol,timeframe:x.label,phase:x.phase,direction:x.direction,price:x.price,change20:x.change,volumeRatio:x.vol,rangePct:x.range,candleTime:x.time,recordedAt:now}}).filter(Boolean);
 if(!fresh.length)return {count:0,saved:true};
 const saved=writeHistory(history.concat(fresh));return{count:fresh.length,saved:saved}
}
function render(symbol,rows,message){
 const tbody=$('marketCycleBody'),summary=$('marketCycleSummary'),status=$('marketCycleStatus');
 if(status)status.textContent=message;
 if(!tbody)return;
 const up=rows.filter(x=>x.ready&&x.direction==='ALTA').length,down=rows.filter(x=>x.ready&&x.direction==='BAIXA').length,flat=rows.filter(x=>x.ready&&x.direction==='LATERAL').length;
 if(summary)summary.textContent=rows.some(x=>x.ready)?symbol+' · MTF: '+up+' períodos em alta / '+down+' em baixa / '+flat+' laterais. Divergências entre períodos são mantidas visíveis.':'Aguardando leitura.';
 tbody.innerHTML=rows.map(x=>'<tr><td>'+esc(x.label)+'</td><td><strong>'+esc(x.phase)+'</strong></td><td>'+esc(x.direction)+'</td><td>'+fmt(x.price,6)+'</td><td>'+ (x.change==null?'—':fmt(x.change)+'%')+'</td><td>'+(x.vol==null?'—':fmt(x.vol)+'x')+'</td><td>'+(x.range==null?'—':fmt(x.range)+'%')+'</td><td>'+esc(x.note)+'</td></tr>').join('');
}
async function analyze(){
 const btn=$('marketCycleRun'),input=$('marketCycleSymbol'),symbol=String(input?.value||'BTCUSDT').trim().toUpperCase();
 if(!/^[A-Z0-9]{5,20}$/.test(symbol)){render(symbol,[],'Use o símbolo de mercado, por exemplo BTCUSDT.');return}
 if(btn?.disabled)return;
 if(btn)btn.disabled=true;
 render(symbol,[],'Buscando candles fechados da Binance…');
 try{
  const names=['1m','5m','15m','30m','1h','1d'],raw={};
  await Promise.all(names.map(async tf=>{raw[tf]=await fetchBars(symbol,tf)}));
  const rows=PLANS.map(p=>{
   const base=raw[p.source]||[];
   const bars=p.source==='1h'?aggregate(base,p.group):p.source==='1d'?aggregateDays(base,p.group):base;
   return assess(bars,p.label,loadPrior(symbol,p.label));
  });
  const result=record(symbol,rows);
  render(symbol,rows,'Leitura concluída · '+new Date().toLocaleTimeString('pt-BR')+' · '+result.count+' novo(s) registro(s) · histórico '+(result.saved?'salvo neste navegador':'sem espaço disponível no navegador')+'.');
 }catch(e){render(symbol,[],'Não foi possível carregar os dados: '+(e?.message||'erro de conexão')+'. Tente novamente.')}
 finally{if(btn)btn.disabled=false}
}
function exportHistory(){
 const rows=readHistory(),blob=new Blob([JSON.stringify({version:1,generatedAt:new Date().toISOString(),history:rows},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ep-leitura-de-ciclo-historico.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function init(){
 if(!$('marketCycleRun'))return;
 $('marketCycleRun').addEventListener('click',analyze);
 $('marketCycleExport').addEventListener('click',exportHistory);
 $('marketCycleSymbol').addEventListener('keydown',e=>{if(e.key==='Enter')analyze()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
root.EPMarketCycleExperimental={assess:assess,aggregate:aggregate,aggregateDays:aggregateDays,plans:PLANS,historyKey:KEY};
})(typeof window!=='undefined'?window:globalThis);
