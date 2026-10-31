import {compareReading,CONFIG,VERSION,statsView} from './m6-parallel-core.mjs';

const panel=document.createElement('section');panel.className='panel interpretation-center';panel.id='m6ParallelPanel';
panel.innerHTML=`<span class="eyebrow">MOTOR PARALELO · EXPERIMENTO DE COMPRA</span>
<h2>M6 Paralelo — Estrutura Confirmada v1</h2>
<p>Compara o Motor 6 atual com três vales ascendentes e flâmula de alta, volume, OBV e momentum. Nenhuma ordem é enviada.</p>
<p id="m6ParallelStatus" role="status">Carregando acompanhamento…</p>
<div class="notice" id="m6ParallelCurrent" role="status">Selecione um ativo na central de sinais atuais para comparar as duas leituras.</div>
<div class="table-wrap"><table><thead><tr><th>Modelo</th><th>Entradas concluídas</th><th>Alvo antes do stop</th><th>Resultado líquido médio¹</th><th>Alta / queda máxima média</th><th>Ambíguos / parciais</th></tr></thead><tbody id="m6ParallelSummary"></tbody></table></div>
<p class="small">Compra · entrada na abertura seguinte · alvo +5% · stop −3% · custo hipotético total 0,20% · horizonte 96 velas por entrada. As duas versões têm até 24 velas para entrar no mesmo episódio. O motor paralelo exige RSI abaixo de 74 e avanço em 6 velas abaixo de 5%.</p>
<p class="small">¹ Taxa de alvo e média líquida excluem velas que atingiram alvo e stop sem ordem conhecida e episódios com lacunas. Não é retorno de carteira. As excursões usam todas as 96 velas, inclusive após a saída simulada. Resultados de períodos diferentes não são somados nesta tabela.</p>
<div class="controls"><label>Comparação por período <select id="m6ParallelInterval"><option value="5m">M5</option><option value="15m">M15</option><option value="1h" selected>H1</option></select></label><button id="m6ParallelExport" class="ghost" disabled>Exportar episódios JSON</button></div>
<h3>Observador de preços — até 10 dias</h3>
<p class="small">Variação desde a entrada original, independente do alvo, stop ou fim das 96 velas. Marcos: 1h, 6h, 12h, 24h, 2, 3, 5, 7 e 10 dias. Usa a coleta existente, sem novas consultas. Lacunas são identificadas; tempo até alvos tem precisão de uma vela.</p>
<div class="table-wrap"><table><thead><tr><th>Ativo / modelo</th><th>Tempo / cobertura</th><th>Última variação</th><th>Máxima / mínima</th><th>Marcos desde a entrada</th><th>Primeira alta atingida</th></tr></thead><tbody id="m6LongRows"></tbody></table></div>
<p id="m6ParallelCount"></p>
<div class="table-wrap"><table><thead><tr><th>Episódio / ativo</th><th>Período</th><th>Motor 6 atual</th><th>M6 paralelo</th><th>Acompanhamento</th></tr></thead><tbody id="m6ParallelEpisodes"></tbody></table></div>
<small>A coleta usa os candles do agendamento existente. Resultados persistem no GitHub; a leitura direta funciona com a página aberta. Experimento prospectivo: ainda não há eficácia comprovada. <a href="https://github.com/Isaias-fernandes/ep-laboratorio-caixote-obv/tree/main/data/m6-parallel-history" target="_blank" rel="noopener">Histórico completo de episódios concluídos</a>.</small>`;
const host=document.getElementById('labLiveSignals');if(host)host.after(panel);else document.querySelector('main').prepend(panel);
const $=id=>document.getElementById(id),fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:d}):'—';
const names={baseline:'Motor 6 atual',candidate:'M6 paralelo'},outcomes={TARGET:'ALVO',STOP:'STOP',TIMEOUT:'FIM DO PRAZO',AMBIGUOUS:'ORDEM INDETERMINADA'};
let feed=null;
function row(body,values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td)}body.append(tr)}
function armText(a){return !a?'Sem entrada':a.entry==null?'Aguardando abertura':`${a.pattern} · entrada ${fmt(a.entry,8)} · ${outcomes[a.outcome]||'ACOMPANHANDO'} · líquido ${fmt(a.netPct)}% · ${a.observed}/96 velas`;}
function render(){
  const interval=$('m6ParallelInterval').value,summary=$('m6ParallelSummary');summary.replaceChildren();
  const stats=feed?.statsByInterval?.[interval];
  const view=stats?statsView(stats):null;
  for(const name of ['baseline','candidate']){const s=view?.[name];row(summary,[names[name],s?.signals??0,
    `${fmt(s?.targetFirstPct)}% (${s?.targets??0})`,`${fmt(s?.netMeanPct)}%`,`${fmt(s?.mfeMeanPct)}% / ${fmt(s?.maeMeanPct)}%`,`${s?.ambiguous??0} / ${s?.partial??0}`]);}
  const active=Object.values(feed?.state||{}).map(s=>s.episode).filter(Boolean);
  const all=[...active,...(feed?.episodes||[])].filter(e=>e.interval===interval).sort((a,b)=>b.startTime-a.startTime);
  $('m6ParallelCount').textContent=`${active.filter(e=>e.interval===interval).length} episódios em acompanhamento · ${stats?.completedEpisodes??0} concluídos · exibindo até 20 recentes. Reinício após 3 velas sem sinal e conclusão do episódio anterior.`;
  const body=$('m6ParallelEpisodes');body.replaceChildren();
  for(const e of all.slice(0,20))row(body,[`${e.symbol} · ${new Date(e.startTime).toLocaleString('pt-BR')} · ${e.id}`,e.interval,armText(e.baseline),armText(e.candidate),`${e.status==='COMPLETED'?'CONCLUÍDO':'EM ACOMPANHAMENTO'}${e.coverage==='PARTIAL'?' · LACUNA':''}${e.retroactive?' · RECONSTRUÍDO':''}`]);
  const longBody=$('m6LongRows');longBody.replaceChildren();
  const tracks=Object.values(feed?.longTracking||{}).filter(t=>t.interval===interval).sort((a,b)=>b.entryTime-a.entryTime);
  for(const t of tracks.slice(0,50))row(longBody,[`${t.symbol} · ${names[t.model]}`,
    `${fmt((t.lastCloseTime-t.entryTime)/3600000,1)}h / 240h · ${t.status==='COMPLETED'?'CONCLUÍDO':'ACOMPANHANDO'} · ${t.coverage==='PARTIAL'?'LACUNA':'COMPLETO ATÉ AQUI'}`,
    `${fmt(t.returnPct)}%`,`${fmt(t.mfe)}% / ${fmt(t.mae)}%`,
    Object.entries(t.checkpoints).map(([h,v])=>`${h}h: ${fmt(v.returnPct)}%${v.coverage!=='COMPLETE'?' (lacuna)':''}`).join(' · ')||'Aguardando primeiro marco',
    Object.entries(t.targets).map(([pct,v])=>`+${pct}% até ${fmt(v.hours,1)}h`).join(' · ')||'Ainda não atingiu +2%']);
  if(!tracks.length)row(longBody,['Aguardando coleta do observador de 10 dias.','—','—','—','—','—']);
  if(!all.length)row(body,['Aguardando novos episódios.','—','—','—','—']);
}
async function load(){
  try{const r=await fetch('data/m6-parallel.json',{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);const next=await r.json();
    if(next.version!==VERSION)throw Error('Versão incompatível');feed=next;
    const age=feed.generatedAt?(Date.now()-Date.parse(feed.generatedAt))/60000:Infinity;
    $('m6ParallelStatus').textContent=feed.generatedAt?`Última coleta: ${new Date(feed.generatedAt).toLocaleString('pt-BR')} · ${Object.keys(feed.state||{}).length}/150 leituras${age>15?' · COLETA ATRASADA':''} · ${feed.errors?.length||0} falha(s).`:'Instalado. Aguardando a primeira coleta automática; nenhuma taxa de acerto disponível.';
    $('m6ParallelExport').disabled=false;render();
  }catch(e){$('m6ParallelStatus').textContent='Acompanhamento indisponível: '+String(e)+'. A leitura direta permanece independente.';render();}
}
window.addEventListener('lab-closed-candles',event=>{
  const {symbol,interval,candles,now}=event.detail;
  try{const ms={'5m':300000,'15m':900000,'1h':3600000}[interval],r=compareReading(candles,ms,now),c=r.candidate;
    const missing=Object.entries(c.gates).filter(([,v])=>!v).map(([k])=>({pattern:'padrão preferencial',breakout:'rompimento',momentum:'momentum',volume:'volume',obv:'OBV',antiStretch:'preço sem esticamento'}[k]));
    $('m6ParallelCurrent').textContent=`${symbol} ${interval} · Motor 6 atual: ${r.baseline.approved?'COMPRA':r.baseline.direction==='SELL'?'VENDA (fora desta comparação)':'SEM COMPRA'} ${r.baseline.score}/100 · M6 paralelo: ${c.approved?'COMPRA':'OBSERVAÇÃO'} ${c.score}/100 · ${c.pattern||'Sem padrão preferencial'} · ${c.stage}${missing.length?' · Falta: '+missing.join(', '):''}. Leitura direta; o registro permanente é feito pelo coletor.`;
  }catch(e){$('m6ParallelCurrent').textContent='Comparação direta indisponível: '+String(e);}
});
$('m6ParallelInterval').onchange=render;
$('m6ParallelExport').onclick=()=>{if(!feed)return;const blob=new Blob([JSON.stringify({...feed,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`m6-paralelo-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
load();setInterval(()=>{if(!document.hidden)load()},300000);

