/* Duas centrais de interpretação exclusivas do ep-laboratorio-caixote-obv. */
(function(global){
  const RADAR_KEY="labRadarH1V1";
  const TRACK_KEY="labTrackingH1V1";
  const TARGETS=[5,10,20,30,50];
  const load=k=>{try{return JSON.parse(localStorage.getItem(k)||"[]")}catch{return []}};
  const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v.slice(0,200)));
  const esc=s=>String(s??"—").replace(/[&<>\"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
  const pct=(a,b)=>a?((b-a)/a)*100:0;

  function gate({interval,candles,result}){
    const reasons=[];
    if(interval!=="1h") reasons.push("Exige H1");
    if(candles.length<96) reasons.push("Exige 96 candles");
    if(result.score<80) reasons.push("Score abaixo de 80");
    if(!result.countAsSignal) reasons.push("Sem sinal confirmado");
    return {eligible:reasons.length===0,reasons};
  }

  function ingest({symbol,interval,candles,result}){
    const g=gate({interval,candles,result});
    updateTracking(symbol,candles);
    if(!g.eligible){render();return g;}
    const last=candles.at(-1);
    const direction=result.classification==="SINAL_COMPRA"?"COMPRA":"VENDA";
    const id=[symbol,last?.time??Date.now(),direction].join("|");
    const radar=load(RADAR_KEY);
    if(!radar.some(x=>x.id===id)){
      const item={
        id,createdAt:new Date().toISOString(),symbol,interval,direction,score:result.score,
        entry:+last.close,box:result.box?.state||"—",flag:result.flag?.state||"—",
        obv:result.obv?.trend||"—",divergence:result.obv?.divergence||"—",
        volumeRatio:Math.max(result.box?.volumeRatio||0,result.flag?.volumeRatio||0)
      };
      radar.unshift(item);save(RADAR_KEY,radar);
      const tr=load(TRACK_KEY);
      tr.unshift({...item,best:0,worst:0,lastPrice:+last.close,targets:{}});save(TRACK_KEY,tr);
    }
    render();return g;
  }

  function updateTracking(symbol,candles){
    if(!candles?.length)return;
    const last=candles.at(-1), high=Math.max(...candles.slice(-96).map(x=>x.high)), low=Math.min(...candles.slice(-96).map(x=>x.low));
    const tr=load(TRACK_KEY);let changed=false;
    for(const x of tr){
      if(x.symbol!==symbol)continue;
      const favorable=x.direction==="COMPRA"?pct(x.entry,high):pct(x.entry,low)*-1;
      const adverse=x.direction==="COMPRA"?pct(x.entry,low):pct(x.entry,high)*-1;
      x.best=Math.max(x.best||0,favorable);x.worst=Math.min(x.worst||0,adverse);x.lastPrice=+last.close;
      x.targets=x.targets||{};for(const t of TARGETS)if((x.best||0)>=t)x.targets[t]=true;changed=true;
    }
    if(changed)save(TRACK_KEY,tr);
  }

  function render(){
    const rBody=document.getElementById("radarCenterBody"),tBody=document.getElementById("trackingCenterBody");
    if(rBody){const rows=load(RADAR_KEY);rBody.innerHTML=rows.map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString("pt-BR")}</td><td>${esc(x.symbol)}</td><td>${x.direction}</td><td>${x.score}</td><td>${esc(x.box).replaceAll("_"," ")}</td><td>${esc(x.flag).replaceAll("_"," ")}</td><td>${esc(x.obv)}</td><td>${Number(x.volumeRatio||0).toFixed(2)}x</td></tr>`).join("")||'<tr><td colspan="8">Nenhum sinal H1/96/score ≥ 80 registrado.</td></tr>';}
    if(tBody){const rows=load(TRACK_KEY);tBody.innerHTML=rows.map(x=>`<tr><td>${esc(x.symbol)}</td><td>${x.direction}</td><td>${x.score}</td><td>${Number(x.entry).toFixed(4)}</td><td>${Number(x.best||0).toFixed(2)}%</td><td>${Number(x.worst||0).toFixed(2)}%</td><td>${TARGETS.map(t=>x.targets?.[t]?`✓ ${t}%`:`· ${t}%`).join(" ")}</td></tr>`).join("")||'<tr><td colspan="7">Nenhum sinal em acompanhamento.</td></tr>';}
  }

  global.InterpretationCenters={ingest,render};
  document.addEventListener("DOMContentLoaded",render);
})(window);