(async () => {
"use strict";
const {analyze}=await import('./lab-signal-engine.mjs');
const section=document.createElement("section");section.className="panel interpretation-center";section.id="labCurrentReading";
section.innerHTML='<h2>Leitura atual — padrões e indicadores</h2><p>Recalcula a lógica H1 do captador com os últimos 96 candles fechados. O sinal histórico permanece separado.</p><label for="labCurrentSymbol">Criptomoeda</label><input id="labCurrentSymbol" value="BTCUSDT" maxlength="20"><button id="labCurrentRun" class="primary">Analisar agora</button><button id="labCurrentMonitor" disabled>Monitorar esta leitura</button><p id="labCurrentStatus" role="status">Informe o ativo e clique em Analisar agora.</p><div id="labCurrentFacts" class="facts"></div><small>A análise atualiza a cada minuto enquanto a página estiver visível. Usa a última vela H1 fechada; não é leitura intravela. Estas consultas não são gravadas no histórico automático do GitHub.</small>';
document.querySelector("main").prepend(section);
let busy=false,selected=null,activeSymbol=null;
const status=document.getElementById("labCurrentStatus"),facts=document.getElementById("labCurrentFacts"),monitor=document.getElementById("labCurrentMonitor");
const fmt=n=>Number.isFinite(n)?n.toLocaleString("pt-BR",{maximumFractionDigits:8}):"—";
async function run(){
if(busy)return;
const symbol=document.getElementById("labCurrentSymbol").value.trim().toUpperCase();
if(!/^[A-Z0-9]{2,16}USDT$/.test(symbol)){status.textContent="Informe um par USDT, por exemplo BTCUSDT.";return;}
busy=true;selected=null;monitor.disabled=true;status.textContent="Consultando candles de "+symbol+"…";
const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
try{
const response=await fetch("https://data-api.binance.vision/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1h&limit=120",{signal:ctl.signal,cache:"no-store"});
if(!response.ok)throw Error("HTTP "+response.status);
const raw=await response.json(),now=Date.now();
const closed=raw.filter(x=>Number(x[6])<now).map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));
const result=analyze(closed),last=result.candles.at(-1);
if(now-(last.t+3600000)>7200000)throw Error("Candles desatualizados; leitura suspensa.");
activeSymbol=symbol;
facts.replaceChildren();
for(const [label,value] of [["Ativo",symbol],["Classificação",result.classification==="SEM_SINAL"?"SEM SINAL APROVADO":result.classification.replaceAll("_"," ")],["Padrão",result.pattern.name],["Score",result.score+"/100"],["Preço de fechamento",fmt(last.c)],["RSI (14)",fmt(result.rsi)],["CCI (20)",fmt(result.cci)],["MACD histograma",fmt(result.macd.histogram)],["Volume / média",fmt(result.volumeRatio)+"×"],["OBV",result.obv.trend],["Momentum alinhado",result.momentumAligned?"Sim":"Não"],["Ignição",result.ignition?"Sim":"Não"]]){
const line=document.createElement("div");line.className="fact";const a=document.createElement("span"),b=document.createElement("strong");a.textContent=label;b.textContent=value;line.append(a,b);facts.append(line);}
status.textContent="Consulta: "+new Date(now).toLocaleString("pt-BR")+" · última vela fechada: "+new Date(last.t+3600000).toLocaleString("pt-BR")+".";
if(result.classification.startsWith("SINAL_")){
const direction=result.classification==="SINAL_COMPRA"?"COMPRA":"VENDA";
selected={id:"ATUAL|"+symbol+"|"+last.t+"|"+direction,market:"CRIPTO",symbol,direction,entry:last.c,entryTime:last.t,score:result.score,pattern:result.pattern.name};monitor.disabled=false;
}
}catch(e){facts.replaceChildren();status.textContent="Falha na leitura atual: "+e.message+". Clique em Analisar agora para tentar novamente.";}finally{clearTimeout(timer);busy=false;}
}
document.getElementById("labCurrentRun").onclick=run;
document.getElementById("labCurrentSymbol").addEventListener("input",()=>{selected=null;activeSymbol=null;monitor.disabled=true;facts.replaceChildren();status.textContent="Ativo alterado. Clique em Analisar agora.";});
monitor.onclick=()=>{if(selected)window.dispatchEvent(new CustomEvent("lab-monitor-signal",{detail:selected}));};
setInterval(()=>{if(activeSymbol&&!document.hidden)run();},60000);
run();
})();