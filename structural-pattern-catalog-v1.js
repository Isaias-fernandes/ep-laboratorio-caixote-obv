/* Laboratório isolado — catálogo estrutural v1
 * Classificação de pesquisa. NÃO altera os 5 motores do EP Whale.
 * Não gera sinal sozinho: padrões só ficam acionáveis após confirmação definida pelo detector/backtest.
 */
(function(){
  const P=[
    ['Bull Flag','CONTINUACAO','BUY'],['Bear Flag','CONTINUACAO','SELL'],
    ['Bull Pennant','CONTINUACAO','BUY'],['Bear Pennant','CONTINUACAO','SELL'],
    ['Ascending Triangle','CONTINUACAO','BUY'],['Descending Triangle','CONTINUACAO','SELL'],
    ['Cup and Handle','CONTINUACAO','BUY'],['Inverted Cup and Handle','CONTINUACAO','SELL'],
    ['Measured Move Bullish','CONTINUACAO','BUY'],['Measured Move Bearish','CONTINUACAO','SELL'],
    ['Ascending Price Channel','CONTINUACAO','BUY'],['Descending Price Channel','CONTINUACAO','SELL'],
    ['Double Bottom','REVERSAO','BUY'],['Double Top','REVERSAO','SELL'],
    ['Triple Bottom','REVERSAO','BUY'],['Triple Top','REVERSAO','SELL'],
    ['Head and Shoulders Bottom','REVERSAO','BUY'],['Head and Shoulders Top','REVERSAO','SELL'],
    ['Falling Wedge','REVERSAO','BUY'],['Rising Wedge','REVERSAO','SELL'],
    ['Rounding Bottom','REVERSAO','BUY'],['Rounding Top','REVERSAO','SELL'],
    ['Bump and Run Bottom','REVERSAO','BUY'],['Bump and Run Top','REVERSAO','SELL'],
    ['Diamond Bottom','REVERSAO','BUY'],['Diamond Top','REVERSAO','SELL'],
    ['V Bottom','REVERSAO','BUY'],['V Top','REVERSAO','SELL'],
    ['Three Rising Valleys','REVERSAO','BUY'],['Three Falling Peaks','REVERSAO','SELL'],
    ['Symmetrical Triangle','BILATERAL','BREAKOUT'],['Rectangle / Trading Range','BILATERAL','BREAKOUT'],
    ['Broadening Formation','BILATERAL','BREAKOUT'],['Broadening Wedge','BILATERAL','BREAKOUT']
  ].map(([name,family,bias])=>({name,family,bias,status:'RESEARCH'}));

  const policy={
    timeframe:'1h',contextCandles:96,futureEvaluationCandles:96,minimumScore:80,
    targetsPct:[5,10,20,30,50],
    lifecycle:['FORMATION','COMPRESSION','BREAKOUT','VOLUME_CONFIRMATION','OBV_CONFIRMATION','RETEST','CONTINUATION'],
    rule:'Padrão em formação não é entrada. BUY/SELL somente após confirmação; bilateral aguarda direção do rompimento.',
    validation:['sample_size','MFE','MAE','target_hit_rate','false_breakout','retest','volume','OBV']
  };
  window.EPStructuralPatternCatalog={version:'structural-catalog-v1',patterns:P,policy};
})();
