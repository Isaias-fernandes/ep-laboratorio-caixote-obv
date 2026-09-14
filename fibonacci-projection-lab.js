/* Projeção observacional independente. Não modifica candles ou sinais. */
(() => {
  const periods = { "15m":900000, "30m":1800000, "1h":3600000, "4h":14400000, "1d":86400000 };
  let snapshot = null, source = "local", busy = false;
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
  function normalize(rows, interval, now = Date.now()) {
    const duration = periods[interval];
    if (!duration || !Array.isArray(rows)) return [];
    return rows.map(r => {
      let time = Number(r.time ?? r.t);
      if (!Number.isFinite(time)) time = Date.parse(r.time ?? r.t);
      if (time > 0 && time < 1e12) time *= 1000;
      return { time, open:Number(r.open ?? r.o), high:Number(r.high ?? r.h),
        low:Number(r.low ?? r.l), close:Number(r.close ?? r.c) };
    }).filter(r => Number.isFinite(r.time) && r.time > 0 && r.time + duration <= now &&
      [r.open,r.high,r.low,r.close].every(n => Number.isFinite(n) && n > 0) &&
      r.high >= Math.max(r.open,r.close,r.low) && r.low <= Math.min(r.open,r.close,r.high))
      .sort((a,b) => a.time-b.time).filter((r,i,a) => i === a.length-1 || r.time !== a[i+1].time);
  }
  function calculate(c, duration) {
    // Um pivô só fica disponível após o fechamento de dois candles à direita.
    const pivots = [];
    for (let i=2; i<c.length-2; i++) {
      const w=c.slice(i-2,i+3);
      if (w.some((r,k) => k && r.time-w[k-1].time !== duration)) continue;
      const others=w.filter((_,k)=>k!==2);
      const hi=others.every(r=>c[i].high>r.high), lo=others.every(r=>c[i].low<r.low);
      if (hi===lo) continue;
      const p={type:hi?"HIGH":"LOW",price:hi?c[i].high:c[i].low,time:c[i].time,
        confirmedAt:c[i+2].time+duration};
      const prev=pivots.at(-1);
      if (prev?.type===p.type) {
        if ((hi && p.price>prev.price)||(!hi && p.price<prev.price)) pivots[pivots.length-1]=p;
      } else pivots.push(p);
    }
    if (pivots.length<3) return null;
    const [a,b,d]=pivots.slice(-3), up=a.type==="LOW";
    const amplitude=Math.abs(b.price-a.price), sign=up?1:-1;
    if (!amplitude || sign*(b.price-a.price)<=0 ||
      sign*(b.price-d.price)<=0 || sign*(d.price-a.price)<=0) return null;
    const after=c.filter(r=>r.time>=d.time);
    const invalid=after.some(r=>up?r.low<d.price:r.high>d.price);
    return {direction:up?"ALTA":"BAIXA",anchors:{a,b,c:d},confirmedAt:d.confirmedAt,
      invalid,reference:c.at(-1).close,referenceAt:c.at(-1).time+duration,
      retracementPct:Math.abs(b.price-d.price)/amplitude*100,
      retracements:[.236,.382,.5,.618,.786].map(r=>({ratio:r,price:b.price-sign*r*amplitude})),
      projections:[1,1.272,1.618,2].map(r=>({ratio:r,price:d.price+sign*r*amplitude}))
        .filter(r=>r.price>0)};
  }
  function render() {
    if (!$("fibStatus")) return;
    try {
      const symbol=$("symbol").value.toUpperCase().trim(), interval=$("interval").value;
      const matching=snapshot?.symbol===symbol && snapshot?.interval===interval;
      const rows=matching?snapshot.rows:window.LabData?.candles;
      const c=normalize(rows,interval), r=calculate(c,periods[interval]);
      const origin=matching?"Binance Spot": "Candles locais / importados";
      $("fibRows").innerHTML="";
      $("fibAnchors").textContent="";
      $("fibStatus").textContent=symbol+" • "+interval+" • "+origin+" • "+c.length+" candles fechados";
      if (!r) { $("fibAnchors").textContent="Aguardando sequência confirmada de impulso e correção (A–B–C)."; return; }
      const {a,b,c:d}=r.anchors;
      $("fibAnchors").textContent=r.direction+" • "+(r.invalid?"PROJEÇÃO INVALIDADA":"REFERÊNCIA ATIVA")+
        " • A "+fmt(a.price)+" → B "+fmt(b.price)+" → C "+fmt(d.price)+
        " • Correção "+fmt(r.retracementPct)+"% do impulso"+
        " • Confirmada em "+new Date(r.confirmedAt).toLocaleString("pt-BR")+
        " • Preço de referência "+fmt(r.reference)+" • Último fechamento "+new Date(r.referenceAt).toLocaleString("pt-BR")+
        " • Invalidação: ultrapassar C contra a projeção. Não representa ordem ou stop operacional.";
      for (const [label,levels] of [["Retração A–B",r.retracements],["Projeção a partir de C",r.projections]]) {
        for (const level of levels) {
          const tr=document.createElement("tr");
          for (const text of [label,fmt(level.ratio*100)+"%",fmt(level.price),
            (level.price/r.reference-1>=0?"+":"")+fmt((level.price/r.reference-1)*100)+"%"]) {
            const td=document.createElement("td");td.textContent=text;tr.appendChild(td);
          }
          $("fibRows").appendChild(tr);
        }
      }
    } catch (error) { $("fibStatus").textContent="Não foi possível calcular: "+error.message; }
  }
  async function fetchCandles() {
    if (busy) return;
    const symbol=$("symbol").value.toUpperCase().trim(), interval=$("interval").value;
    if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !periods[interval]) {
      $("fibStatus").textContent="Informe um par Spot Binance, por exemplo BTCUSDT.";return;
    }
    busy=true;$("fibFetch").disabled=true;$("fibStatus").textContent="Buscando candles fechados na Binance Spot...";
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+
        "&interval="+encodeURIComponent(interval)+"&limit=500",{signal:controller.signal});
      if (!response.ok) throw Error("Fonte indisponível (HTTP "+response.status+")");
      const data=await response.json();
      if (!Array.isArray(data)) throw Error("Histórico inválido");
      snapshot={symbol,interval,rows:data.map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4]}))};
      source="Binance Spot";render();
    } catch (error) { $("fibStatus").textContent="Falha na consulta. Pode importar candles e usar Atualizar projeção local."; }
    finally {clearTimeout(timeout);busy=false;$("fibFetch").disabled=false;}
  }
  function init() {
    const section=document.createElement("section");section.className="panel interpretation-center";
    section.innerHTML='<h2>Projeção de Fibonacci — experimental</h2><p>Leitura informativa para alta e baixa. Use Ativo e Período no topo. Pivôs confirmados após dois candles fechados; não gera ou bloqueia sinais. Projeção = C + proporção do impulso A–B, com direção. Percentuais dos níveis são proporções do impulso, não previsão de retorno.</p><button id="fibFetch">Carregar projeção Binance</button> <button id="fibLocal">Atualizar projeção local</button><div id="fibStatus" class="notice"></div><p id="fibAnchors"></p><div class="table-wrap"><table><thead><tr><th>Referência</th><th>Proporção</th><th>Preço</th><th>Distância do último fechamento</th></tr></thead><tbody id="fibRows"></tbody></table></div><p>Os níveis são hipóteses de preço. Uma projeção ativa não confirma entrada nem probabilidade de atingir o nível. Consulta manual; nenhum novo banco ou monitor de rede contínuo.</p>';
    document.querySelector("main").appendChild(section);
    $("fibFetch").onclick=fetchCandles;
    $("fibLocal").onclick=()=>{snapshot=null;source="local";render();};
    $("symbol").addEventListener("change",render);$("interval").addEventListener("change",render);
    document.addEventListener("click",e=>{if(["sample","analyze"].includes(e.target.id))setTimeout(render,0)});
    render();
  }
  window.LabFibonacciProjection={normalize,calculate};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
