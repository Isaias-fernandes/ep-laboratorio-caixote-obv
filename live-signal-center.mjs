import {reading,INTERVALS,SYMBOLS} from './lab-live-core.mjs';
import {analyze} from './lab-signal-engine.mjs';
const ENDPOINT='https://iayxjarkeefbzjbpfurl.supabase.co/functions/v1/ep-lab-live';
const panel=document.createElement('section');panel.className='panel interpretation-center';panel.id='labLiveSignals';
panel.innerHTML=`<span class="eyebrow">COLETA M5 · M15 · CONTEXTO H1</span><h2>Sinais atuais — Laboratório</h2>
<p>M5 e M15 antecipam; H1 fornece contexto. O score continua sendo uma pontuação experimental.</p>
<p id="labLiveHealth" class="notice" role="status">Carregando coleta…</p>
<div class="controls"><div><label for="labLiveAsset">Ativo</label><select id="labLiveAsset"></select></div>
<div><label for="labLiveInterval">Período</label><select id="labLiveInterval"><option value="5m">M5</option><option value="15m">M15</option><option value="1h">H1</option></select></div>
<div><label for="labLiveFilter">Radar</label><select id="labLiveFilter"><option value="active">Sinais e pré-sinais</option><option value="confirmed">Confirmados</option><option value="all">Todos os ativos</option></select></div>
<button id="labLiveRefresh" class="primary">Atualizar</button></div>
<article class="panel"><h3 id="labLiveNowTitle">Leitura direta da Binance</h3><p id="labLiveNow" role="status">Aguardando…</p><p id="labLiveContext"></p><button id="labLiveMonitor" disabled>Monitorar sinal confirmado</button></article>
<p id="labLiveIntra" class="small">Vela em formação: conectando…</p>
<p id="labLiveCount"></p><div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Período</th><th>Estado</th><th>Direção</th><th>Score</th><th>Padrão</th><th>Idade da vela</th></tr></thead><tbody id="labLiveRows"></tbody></table></div>
<div class="controls"><button id="labLivePrev">Anterior</button><span id="labLivePage"></span><button id="labLiveNext">Próxima</button></div>
<details><summary>Últimos eventos registrados</summary><p id="labLiveEventCount"></p><div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Período</th><th>Estado</th><th>Confirmação</th><th>Acompanhamento</th></tr></thead><tbody id="labLiveEvents"></tbody></table></div></details>
<p id="labLiveBackup" class="small"></p>
<small>A leitura direta funciona enquanto esta página está aberta. A coleta independente roda por agendamento; atrasos ficam visíveis. Pré-sinais e leitura da vela em formação podem ser invalidados.</small>`;
document.querySelector('main').prepend(panel);
const $=id=>document.getElementById(id),asset=$('labLiveAsset');
for(const symbol of SYMBOLS){const o=document.createElement('option');o.value=symbol;o.textContent=symbol;asset.append(o)}
const labels={PRE_SIGNAL:'PRÉ-SINAL',CONFIRMED:'CONFIRMADO',INVALIDATED:'INVALIDADO',COMPLETED:'CONCLUÍDO',NO_SIGNAL:'SEM SINAL'};
const direction=d=>d==='BUY'?'COMPRA':d==='SELL'?'VENDA':'NEUTRO';
const fmt=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:5}):'—';
const date=t=>t?new Date(t).toLocaleString('pt-BR'):'—';
let feed=null,page=0,busy=false,selected=null,socket=null,context=[],generation=0;
function cells(body,values){const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=v;tr.append(td)}body.append(tr);return tr}
function render(){
 const interval=$('labLiveInterval').value,filter=$('labLiveFilter').value;
 const rows=(feed?.state||[]).filter(s=>s.interval===interval&&(filter==='all'||filter==='confirmed'&&s.data.stage==='CONFIRMED'||filter==='active'&&s.data.stage!=='NO_SIGNAL')).sort((a,b)=>b.data.score-a.data.score||a.symbol.localeCompare(b.symbol));
 const pages=Math.max(1,Math.ceil(rows.length/10));page=Math.min(page,pages-1);const body=$('labLiveRows');body.replaceChildren();
 for(const s of rows.slice(page*10,page*10+10)){
  const age=Math.max(0,(Date.now()-s.data.closedAt)/60000),stale=age>INTERVALS[s.interval]/60000*2;
  const row=cells(body,[s.symbol,s.interval,stale?'DESATUALIZADO':labels[s.data.stage],direction(s.data.direction),s.data.score+'/100',s.data.pattern,fmt(age)+' min']);
  row.tabIndex=0;const choose=()=>{asset.value=s.symbol;readNow()};row.onclick=choose;row.onkeydown=e=>{if(e.key==='Enter')choose()};
 }
 if(!rows.length)cells(body,['Nenhum registro para este filtro.','—','—','—','—','—','—']);
 $('labLiveCount').textContent=rows.length+' registros no radar · clique no ativo para consultar agora.';
 $('labLivePage').textContent=`Página ${page+1} de ${pages}`;$('labLivePrev').disabled=page===0;$('labLiveNext').disabled=page===pages-1;
 const eventBody=$('labLiveEvents');eventBody.replaceChildren();
 for(const e of (feed?.events||[]).slice(0,10))cells(eventBody,[e.symbol,e.interval,labels[e.status]+(e.data.retroactive?' · recuperado retrospectivamente':''),date(e.data.confirmedAt),`${e.data.observedCandles}/96 · favorável ${fmt(e.data.mfe)}% · adverso ${fmt(e.data.mae)}%`]);
 $('labLiveEventCount').textContent='Exibindo até 10 eventos recentes; os arquivos de histórico preservam todos os registros coletados.';
}
async function getJson(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
async function load(){
 let source='servidor',serverError='';
 try{feed=await getJson(ENDPOINT)}catch(e){serverError=String(e);source='GitHub';try{feed=await getJson('data/live-signals.json?v='+Date.now())}catch(err){$('labLiveHealth').textContent='Coleta indisponível. A leitura direta abaixo continua disponível. '+String(err);return}}
 const time=feed.control?.last_finished_at,age=time?(Date.now()-Date.parse(time))/60000:Infinity;
 $('labLiveHealth').textContent=`Fonte: ${source} · última coleta: ${date(time)} · ${feed.state.length}/150 leituras · ${feed.control?.result?.errors?.length||0} falhas`+(age>10?` · ATENÇÃO: coleta atrasada ${fmt(age)} min`:'')+(serverError?' · servidor indisponível; usando coleta agendada do GitHub.':'');
 $('labLiveBackup').textContent=feed.archive?.archived_at?'Arquivamento mais recente: '+date(feed.archive.archived_at)+(source==='GitHub'?' · arquivos permanentes em data/live-history/.':' · backup verificado no GitHub.'):'Backup do novo coletor: aguardando primeira confirmação.';
 render();
}
async function readNow(){
 const symbol=asset.value,interval=$('labLiveInterval').value,g=++generation;
 if(socket){socket.close();socket=null}selected=null;$('labLiveMonitor').disabled=true;context=[];
 $('labLiveNow').textContent='Consultando '+symbol+' '+interval+'…';$('labLiveIntra').textContent='Vela em formação: aguardando conexão.';
 try{
  const raw=await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=120`);if(g!==generation)return;
  const now=Date.now(),rows=raw.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})),x=reading(rows,interval,now);
  context=rows.filter(c=>c.t+INTERVALS[interval]<=now).slice(-96);
  $('labLiveNowTitle').textContent=symbol+' · '+interval+' · '+labels[x.stage];
  $('labLiveNow').textContent=`${direction(x.direction)} · score ${x.score}/100 · ${x.pattern} · RSI ${fmt(x.indicators.rsi)} · CCI ${fmt(x.indicators.cci)} · MACD ${fmt(x.indicators.macdHistogram)} · volume ${fmt(x.indicators.volumeRatio)}× · OBV ${x.indicators.obv} · vela fechada ${date(x.closedAt)}.`;
  if(x.stage==='CONFIRMED'){selected={id:`LIVE|${symbol}|${interval}|${x.candleTime}|${x.direction}`,market:'CRIPTO',symbol,direction:direction(x.direction),entry:x.price,entryTime:x.candleTime,score:x.score,pattern:x.pattern};$('labLiveMonitor').disabled=false}
  if(interval!=='1h'){
   try{const h=await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1h&limit=120`);if(g!==generation)return;const hx=reading(h.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})),'1h');$('labLiveContext').textContent='Contexto H1: '+direction(hx.direction)+' · '+labels[hx.stage]+' · '+hx.score+'/100'+(x.direction!=='NEUTRAL'&&hx.direction!==x.direction?' · direções não alinhadas.':'.')}
   catch{$('labLiveContext').textContent='Contexto H1 indisponível.'}
  }else $('labLiveContext').textContent='Contexto de 96 velas H1 fechadas.';
  connect(symbol,interval,g);
 }catch(e){if(g===generation){$('labLiveNow').textContent='Falha na leitura atual: '+String(e);$('labLiveContext').textContent='';$('labLiveIntra').textContent='Vela em formação: sem dados.'}}
}
function connect(symbol,interval,g){
 socket=new WebSocket(`wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@kline_${interval}`);
 socket.onmessage=e=>{
  if(g!==generation)return;
  try{const k=JSON.parse(e.data).k;if(!k)return;if(k.x){readNow();return}
   const candle={t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v},r=analyze([...context.slice(-95),candle]);
   $('labLiveIntra').textContent=`EM FORMAÇÃO · ${symbol} ${interval} · ${direction(r.pattern.direction)} · score provisório ${r.score}/100 · ${r.pattern.name}. Aguarde o fechamento para confirmação; volume da vela ainda incompleto.`;
  }catch{}
 };
 socket.onerror=()=>{if(g===generation)$('labLiveIntra').textContent='Fluxo intravela indisponível. Leitura de velas fechadas atualiza a cada minuto.'};
 socket.onclose=()=>{if(g===generation)$('labLiveIntra').textContent='Fluxo intravela desconectado. Nova tentativa na próxima atualização.'};
}
$('labLiveMonitor').onclick=()=>{if(selected)window.dispatchEvent(new CustomEvent('lab-monitor-signal',{detail:selected}))};
asset.onchange=readNow;$('labLiveInterval').onchange=()=>{page=0;render();readNow()};$('labLiveFilter').onchange=()=>{page=0;render()};
$('labLivePrev').onclick=()=>{page--;render()};$('labLiveNext').onclick=()=>{page++;render()};
$('labLiveRefresh').onclick=()=>{load();readNow()};
setInterval(()=>{if(!document.hidden){load();readNow()}},60000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;if(socket)socket.close()}else{load();readNow()}});
load();readNow();
