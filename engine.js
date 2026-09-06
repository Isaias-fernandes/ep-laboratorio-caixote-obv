/* Motor independente: não importa nem consulta qualquer outro projeto. */
(function(global){
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function normalize(rows){
    return rows.map((r,i)=>({time:r.time??r.timestamp??i,open:+r.open,high:+r.high,low:+r.low,close:+r.close,volume:+r.volume}))
      .filter(c=>[c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.high>=c.low&&c.volume>=0);
  }
  function trueRange(c,p){return Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close))}
  function atr(c,n=14){if(c.length<2)return 0;return avg(c.slice(-n).map((x,i,a)=>trueRange(x,i?a[i-1]:c[Math.max(0,c.length-n-1)])))}
  function calculateOBV(c){
    let value=0;const series=[0];
    for(let i=1;i<c.length;i++){if(c[i].close>c[i-1].close)value+=c[i].volume;else if(c[i].close<c[i-1].close)value-=c[i].volume;series.push(value)}
    const n=Math.min(10,series.length-1),slope=n?series.at(-1)-series.at(-1-n):0;
    const priceSlope=n?c.at(-1).close-c.at(-1-n).close:0;
    const divergence=priceSlope<0&&slope>0?"ALTA":priceSlope>0&&slope<0?"BAIXA":"NENHUMA";
    return {value:series.at(-1),slope,trend:slope>0?"SUBINDO":slope<0?"CAINDO":"LATERAL",divergence,series};
  }
  function detectBox(c,lookback=20){
    const w=c.slice(-lookback-1,-1);if(w.length<lookback)return {valid:false,state:"DADOS_INSUFICIENTES"};
    const resistance=Math.max(...w.map(x=>x.high)),support=Math.min(...w.map(x=>x.low)),mid=(resistance+support)/2;
    const rangePct=mid?100*(resistance-support)/mid:Infinity,tol=(resistance-support)*.12;
    const topTouches=w.filter(x=>x.high>=resistance-tol).length,bottomTouches=w.filter(x=>x.low<=support+tol).length;
    const a=atr(c),last=c.at(-1),volBase=avg(w.slice(-10).map(x=>x.volume)),volumeRatio=volBase?last.volume/volBase:0;
    const compression=rangePct<=8&&topTouches>=2&&bottomTouches>=2;
    const up=compression&&last.close>resistance+.15*a&&volumeRatio>=1.2;
    const down=compression&&last.close<support-.15*a&&volumeRatio>=1.2;
    return {valid:compression,state:up?"ROMPIMENTO_ALTA":down?"ROMPIMENTO_BAIXA":compression?"DENTRO_DO_CAIXOTE":"SEM_CAIXOTE",support,resistance,rangePct,topTouches,bottomTouches,volumeRatio};
  }
  function detectFlag(c){
    if(c.length<26)return {valid:false,state:"DADOS_INSUFICIENTES"};
    const pole=c.slice(-26,-14),flag=c.slice(-14,-1),last=c.at(-1),start=pole[0].close,end=pole.at(-1).close;
    const impulse=100*(end-start)/start,high=Math.max(...flag.map(x=>x.high)),low=Math.min(...flag.map(x=>x.low));
    const retracement=Math.abs(end-last.close)/Math.max(Math.abs(end-start),1e-9);
    const volRatio=last.volume/Math.max(avg(flag.map(x=>x.volume)),1);
    const bull=impulse>=6&&retracement<=.5,bear=impulse<=-6&&retracement<=.5;
    const breakUp=bull&&last.close>high&&volRatio>=1.2,breakDown=bear&&last.close<low&&volRatio>=1.2;
    return {valid:bull||bear,state:breakUp?"ROMPIMENTO_ALTA":breakDown?"ROMPIMENTO_BAIXA":bull||bear?"AGUARDANDO_ROMPIMENTO":"SEM_BANDEIRA",impulse,retracement,volumeRatio:volRatio};
  }
  function analyze(rows,lookback=20){
    const c=normalize(rows);if(c.length<Math.max(30,lookback+1))throw Error("São necessários pelo menos 30 candles válidos.");
    const box=detectBox(c,lookback),obv=calculateOBV(c),flag=detectFlag(c);
    const confirmedUp=box.state==="ROMPIMENTO_ALTA"||flag.state==="ROMPIMENTO_ALTA";
    const confirmedDown=box.state==="ROMPIMENTO_BAIXA"||flag.state==="ROMPIMENTO_BAIXA";
    const obvConfirm=confirmedUp?obv.trend==="SUBINDO":confirmedDown?obv.trend==="CAINDO":false;
    let score=0;if(confirmedUp||confirmedDown)score+=55;if(obvConfirm)score+=25;
    const vr=Math.max(box.volumeRatio||0,flag.volumeRatio||0);if(vr>=1.5)score+=20;else if(vr>=1.2)score+=10;
    score=clamp(score,0,100);
    const neutral=box.state==="DENTRO_DO_CAIXOTE"||flag.state==="AGUARDANDO_ROMPIMENTO"||(!confirmedUp&&!confirmedDown);
    let classification="DESCARTADO";
    if((confirmedUp||confirmedDown)&&obvConfirm&&score>=80)classification=confirmedUp?"SINAL_COMPRA":"SINAL_VENDA";
    else if(neutral)classification="EM_OBSERVACAO";
    else if(confirmedUp||confirmedDown)classification="INCONCLUSIVO";
    return {candles:c.length,box,obv,flag,score,classification,countAsSignal:classification.startsWith("SINAL_")};
  }
  global.LabEngine={normalize,calculateOBV,detectBox,detectFlag,analyze};
})(window);