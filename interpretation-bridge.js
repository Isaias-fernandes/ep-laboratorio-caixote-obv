/* Ponte local entre a análise existente e as duas centrais. */
(function(){
  function refreshCenters(){
    try{
      if(!window.LabData||!window.LabEngine||!window.InterpretationCenters)return;
      const rows=window.LabData.candles;
      if(!rows||!rows.length){window.InterpretationCenters.render();return;}
      const lookback=Number(document.getElementById("lookback")?.value||20);
      const result=window.LabEngine.analyze(rows,lookback);
      window.InterpretationCenters.ingest({
        symbol:window.LabData.symbol,
        interval:window.LabData.interval,
        candles:rows,
        result
      });
    }catch(e){
      window.InterpretationCenters&&window.InterpretationCenters.render();
    }
  }
  document.addEventListener("DOMContentLoaded",function(){
    const analyze=document.getElementById("analyze");
    if(analyze)analyze.addEventListener("click",function(){setTimeout(refreshCenters,0)});
    window.InterpretationCenters&&window.InterpretationCenters.render();
  });
})();