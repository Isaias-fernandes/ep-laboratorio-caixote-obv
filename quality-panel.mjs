const ROOT='https://isaias-fernandes.github.io/ep-laboratorio-caixote-obv/';
const names={TRV_CONFIRMED:'Three Rising Valleys',BULL_FLAG_BREAKOUT:'Bull Flag rompido',MIN30_FLOW:'Mínima 30D + fluxo'};
const number=(n,d=2)=>n==null||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:d});
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const root=document.createElement('section');root.id='epQualityPanel';root.className='panel interpretation-center';
root.style.cssText='margin:18px 0;padding:20px;border:1px solid #44869b;border-radius:14px;scroll-margin-top:20px';
root.append(el('h2','EP · Qualidade dos sinais e objetivo de até +50%'));
root.append(el('p','Validação paralela dos três gatilhos. Os motores atuais continuam disponíveis. As taxas abaixo são observações históricas; ainda não há probabilidade aprovada.'));
const health=el('p','Carregando acompanhamento…','notice');health.setAttribute('role','status');root.append(health);
const controls=el('div',null,'controls'),asset=el('select'),strategy=el('select'),objective=el('select'),arm=el('select');
function option(select,value,text){const o=el('option',text);o.value=value;select.append(o);}
option(asset,'','Todos os ativos');option(strategy,'','Todos os gatilhos');for(const [key,name] of Object.entries(names))option(strategy,key,name);
for(const [key,text] of [['30d_stop10','30 dias · stop −10%'],['30d_stop3','30 dias · stop −3%'],['96h_stop3','96 horas · stop −3%']])option(objective,key,text);
for(const [key,text] of [['BASE','Regra-base'],['BOLLINGER','Teste: dentro de Bollinger'],['NO_PRELEG_24H','Teste: sem pré-pernada']])option(arm,key,text);
for(const [select,text] of [[asset,'Ativo'],[strategy,'Gatilho'],[objective,'Avaliação'],[arm,'Comparação']]){const label=el('label',text);label.append(select);controls.append(label);}root.append(controls);
const performance=el('div');root.append(performance);
const settings=el('details'),settingsTitle=el('summary','Custos por plataforma e alvos líquidos estimados');settings.append(settingsTitle);
settings.append(el('p','Os preços são referências Binance Spot em USDT. A cotação em reais e o preço executado no banco podem ser diferentes. Campos vazios deixam o retorno líquido indisponível.'));
const broker=el('select');for(const [k,t] of [['custom','Configuração manual'],['binanceReference','Binance · referência 0,1% por lado'],['nubank','Nubank · informar cotação e custos'],['itau','Itaú · informar cotação e custos']])option(broker,k,t);settings.append(broker);
const inputs={};for(const [key,text] of [['buyPct','Compra (%)'],['sellPct','Venda (%)'],['slippagePct','Desvio de execução por lado (%)'],['spreadPct','Spread adicional por lado (%)']]){const label=el('label',text),input=el('input');input.type='number';input.min='0';input.max='99';input.step='0.01';input.placeholder='Informar';label.append(input);settings.append(label);inputs[key]=input;}
const costResult=el('p');settings.append(costResult);root.append(settings);
const cards=el('div');root.append(cards);const exportButton=el('button','Baixar registros exibidos (JSON)');exportButton.type='button';root.append(exportButton);
const main=document.querySelector('main');if(main)main.prepend(root);else document.body.append(root);
let data=null;
function costs(){const values=Object.fromEntries(Object.entries(inputs).map(([k,input])=>[k,input.value===''?null:Number(input.value)]));return Object.values(values).every(v=>v!=null&&Number.isFinite(v)&&v>=0&&v<100)?values:null;}
function net(gross,c){const extra=(c.slippagePct+c.spreadPct)/100;return ((1+gross/100)*(1-c.sellPct/100-extra)/(1+c.buyPct/100+extra)-1)*100;}
function renderCosts(){const c=costs();costResult.textContent=c?[5,10,20,50].map(t=>`Alta de +${t}% → líquido estimado ${number(net(t,c))}%`).join(' · '):'Informe os quatro custos para calcular. Não some novamente um spread já incluído no preço de execução.';renderCards();}
function renderCards(){if(!data)return;cards.replaceChildren();const records=data.signals.filter(r=>(!asset.value||r.birth.symbol===asset.value)&&(!strategy.value||r.birth.strategy===strategy.value));
  if(!records.length){cards.append(el('p','Nenhum sinal desses gatilhos registrado neste recorte.'));return;}
  for(const {birth:b,evaluation:e} of records.slice(0,30)){
    const card=el('article',null,'panel');card.style.margin='12px 0';card.append(el('h3',`${b.symbol} · ${names[b.strategy]||b.pattern}`));
    const labels={PENDING:'Confirmado · aguardando abertura seguinte',COLLECTING:'Em acompanhamento',COMPLETED:'Acompanhamento encerrado',INVALID_DATA:'Dados incompletos · fora da taxa'};
    card.append(el('p',`${labels[e.status]||e.status} · SOMBRA${b.retroactive?' · recuperado após atraso':''} · ${new Date(b.closedAt).toLocaleString('pt-BR')}`));
    card.append(el('p',Object.entries(b.checklist||{}).map(([k,v])=>`${({pattern:'Padrão',breakout:'Rompimento',volume:'Volume',obv:'OBV',notStretched:'Dentro de Bollinger',buyerFlow:'Fluxo comprador'})[k]} ${v==null?'indisponível':v?'✔':'✖'}`).join(' · ')));
    card.append(el('p',`Entrada simulada: ${number(e.entry,8)} USDT · Volume: ${number(b.features.volumeRatio)}x · Agressão: ${number(b.features.aggression==null?null:b.features.aggression*100)}% · Mínima 30D: ${number(b.features.minimum30,8)} USDT`));
    const prefix=objective.value;card.append(el('p',[3,5,10,20,50].map(t=>`+${t}%: ${({PENDING:'aguardando',TARGET:'alvo primeiro',STOP:'stop primeiro',TIMEOUT:'prazo encerrado',AMBIGUOUS:'ordem indeterminada',INCOMPLETE:'incompleto'})[e.cells[`${prefix}_target${t}`]?.outcome]||'—'}`).join(' · ')));
    card.append(el('p',`Melhor variação observada: ${number(e.mfe)}% · Pior: ${number(e.mae)}% · Cobertura: ${e.coverage==='COMPLETE'?'sem lacuna observada':'incompleta'}. Excursão não é lucro realizado.`));
    const c=costs();for(const [key,x] of Object.entries(e.exits||{})){
      const netPct=c&&x.grossPct!=null&&Math.abs(x.fills.reduce((sum,f)=>sum+f.weight,0)-1)<1e-8?x.fills.reduce((sum,f)=>sum+f.weight*net(f.grossPct,c),0):null;
      card.append(el('small',`${({fixed10_3:'Alvo 10% / stop 3%',fixed20_5:'Alvo 20% / stop 5%',structural20:'Stop estrutural / alvo 20%',trailing3atr:'Stop móvel 3 ATR',partials5_10_trailing:'Parciais + stop móvel'})[key]}: ${x.status} · líquido ${number(netPct)}%. `));
    }
    cards.append(card);
  }
}
function render(){if(!data)return;performance.replaceChildren();const table=el('table'),thead=el('thead'),head=el('tr');for(const title of ['Gatilho','Alvo','Amostra madura','Alvo primeiro','Referência pareada','Vantagem','Ambíguos / incompletos'])head.append(el('th',title));thead.append(head);table.append(thead);const body=el('tbody');
  for(const row of data.stats.filter(r=>r.arm===arm.value&&(!strategy.value||r.strategy===strategy.value))){for(const target of [3,5,10,20,50]){const cell=row.cells[`${objective.value}_target${target}`],tr=el('tr');
    for(const text of [names[row.strategy],`+${target}%`,`${cell.n} (${cell.hits} acertos)`,cell.n?`${number(cell.pct)}%`:'Aguardando amostra',cell.baselinePct==null?'Sem controles maduros':`${number(cell.baselinePct)}%`,cell.lift==null?'—':`${number(cell.lift)}x`,`${cell.ambiguous} / ${cell.partial}`])tr.append(el('td',text));body.append(tr);
  }}table.append(body);const wrap=el('div',null,'table-wrap');wrap.append(table);performance.append(wrap);performance.append(el('p','Tabela: universo completo de ativos. O filtro de ativo seleciona somente os cartões. Taxas incluem apenas janelas maduras, sem lacunas e com ordem conhecida; a referência usa o mesmo ativo, mês UTC e faixa de horário. Não há teste de significância aprovado.'));
  if(arm.value==='NO_PRELEG_24H')performance.append(el('p','O filtro exige histórico completo de pré-pernada. Ausência de dados permanece indisponível e nunca significa “sem alerta”.'));
  renderCards();
}
for(const input of [asset,strategy,objective,arm])input.addEventListener('change',render);
for(const input of Object.values(inputs))input.addEventListener('input',()=>{try{localStorage.setItem('ep-quality-costs',JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]))));}catch{}renderCosts();});
broker.addEventListener('change',()=>{for(const [k,input] of Object.entries(inputs))input.value=broker.value==='binanceReference'?(k==='buyPct'||k==='sellPct'?'0.1':'0'):'';renderCosts();});
try{const saved=JSON.parse(localStorage.getItem('ep-quality-costs')||'null');if(saved)for(const [k,v] of Object.entries(saved))if(inputs[k])inputs[k].value=v;}catch{}
exportButton.addEventListener('click',()=>{if(!data)return;const records=data.signals.filter(r=>(!asset.value||r.birth.symbol===asset.value)&&(!strategy.value||r.birth.strategy===strategy.value));const url=URL.createObjectURL(new Blob([JSON.stringify({version:data.version,at:data.at,records},null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ep-qualidade-sinais.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
async function load(){try{const r=await fetch(ROOT+'data/quality/summary.json',{cache:'no-cache'});if(r.status===404){health.textContent='Aguardando a primeira coleta automática da validação. Nenhuma taxa foi estimada.';return;}if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();
  const h=data.health,stale=Date.now()-Date.parse(data.at)>2*3600000;health.textContent=`${h.ok&&!stale?'Coleta atualizada':'Atenção à coleta'} · ${h.available}/${h.expected} ativos · ${new Date(data.at).toLocaleString('pt-BR')} · ${h.errors.length} falhas · ${h.stale.length} ativos atrasados.`;
  const current=asset.value;asset.replaceChildren();option(asset,'','Todos os ativos');for(const symbol of [...new Set(data.signals.map(r=>r.birth.symbol))].sort())option(asset,symbol,symbol);asset.value=current;render();renderCosts();
}catch(e){health.textContent='Não foi possível ler a validação: '+e.message;}}
load();setInterval(load,3600000);
