const fs = require('node:fs');
const path = require('node:path');
const lab = require('../experimental-motors.js');

const SYMBOLS = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','TRXUSDT','LTCUSDT','BCHUSDT','XLMUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','NEARUSDT','APTUSDT','FILUSDT','ICPUSDT','ARBUSDT','OPUSDT','SUIUSDT','AAVEUSDT'];
const OUT = path.resolve('data/backtest-experimental-motors.json');
const HOUR = 3600000;
const HORIZON = 96;
const MIN_SCORE = 80;
const TARGETS = [5,10,20,30,50];
const COOLDOWN = 6;

async function getJSON(url) {
  const r = await fetch(url,{headers:{'User-Agent':'lab-motors-backtest/1.0'}});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function fetchHistory(symbol,wanted=1400){
  const all=[]; let endTime;
  while(all.length<wanted){
    const limit=Math.min(1000,wanted-all.length);
    const qs=new URLSearchParams({symbol,interval:'1h',limit:String(limit)});
    if(endTime) qs.set('endTime',String(endTime));
    let rows,lastErr;
    for(const base of ['https://data-api.binance.vision','https://api.binance.com']){
      try{rows=await getJSON(`${base}/api/v3/klines?${qs}`);break}catch(e){lastErr=e}
    }
    if(!rows) throw lastErr||new Error('sem dados');
    if(!rows.length) break;
    const mapped=rows.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));
    all.unshift(...mapped); endTime=mapped[0].t-1;
    if(mapped.length<limit) break;
    await new Promise(r=>setTimeout(r,80));
  }
  const now=Date.now();
  return [...new Map(all.map(x=>[x.t,x])).values()].sort((a,b)=>a.t-b.t).filter(x=>x.t+HOUR<=now).slice(-wanted);
}

function outcome(candles,i,signal){
  const entry=candles[i+1]?.o;
  if(!entry) return null;
  const f=candles.slice(i+1,i+1+HORIZON);
  if(f.length<HORIZON) return null;
  const hi=Math.max(...f.map(x=>x.h)), lo=Math.min(...f.map(x=>x.l));
  const buy=signal.direction==='BUY';
  const mfe=buy?(hi-entry)/entry*100:(entry-lo)/entry*100;
  const mae=buy?(lo-entry)/entry*100:(entry-hi)/entry*100;
  const mfePrice=buy?hi:lo;
  const mfeIndex=f.findIndex(x=>buy?x.h===hi:x.l===lo);
  return {entry,mfe:+mfe.toFixed(4),mae:+mae.toFixed(4),maxSwingPct:+((hi-lo)/entry*100).toFixed(4),timeToMfeCandles:mfeIndex+1,mfePrice,hits:Object.fromEntries(TARGETS.map(t=>[t,mfe>=t]))};
}

function summarize(rows){
  const groups=new Map();
  for(const r of rows){
    const key=`${r.motorId}:${r.direction}`;
    const g=groups.get(key)||{motorId:r.motorId,motor:r.motor,direction:r.direction,n:0,mfe:0,mae:0,swing:0,time:0,hits:Object.fromEntries(TARGETS.map(t=>[t,0]))};
    g.n++;g.mfe+=r.mfe;g.mae+=r.mae;g.swing+=r.maxSwingPct;g.time+=r.timeToMfeCandles;
    for(const t of TARGETS) if(r.hits[t]) g.hits[t]++;
    groups.set(key,g);
  }
  return [...groups.values()].map(g=>({motorId:g.motorId,motor:g.motor,direction:g.direction,signals:g.n,avgMfePct:+(g.mfe/g.n).toFixed(3),avgMaePct:+(g.mae/g.n).toFixed(3),avgMaxSwingPct:+(g.swing/g.n).toFixed(3),avgTimeToMfeCandles:+(g.time/g.n).toFixed(1),payoffExcursion:+((g.mfe/g.n)/Math.max(Math.abs(g.mae/g.n),0.0001)).toFixed(2),hitRates:Object.fromEntries(TARGETS.map(t=>[t,+(100*g.hits[t]/g.n).toFixed(1)])),hits:g.hits})).sort((a,b)=>b.hitRates[10]-a.hitRates[10]||b.avgMfePct-a.avgMfePct);
}

function overallByMotor(rows){
  const out=[];
  for(let id=1;id<=5;id++){
    const x=rows.filter(r=>r.motorId===id);
    if(!x.length){out.push({motorId:id,motor:id===5?'Fluxo/Baleias':'sem amostra',signals:0,status:id===5?'SEM HISTORICO DE CVD/OI/BOOK — NAO FABRICADO':'SEM AMOSTRA'});continue}
    const mfe=x.reduce((s,r)=>s+r.mfe,0)/x.length, mae=x.reduce((s,r)=>s+r.mae,0)/x.length, sw=x.reduce((s,r)=>s+r.maxSwingPct,0)/x.length;
    out.push({motorId:id,motor:x[0].motor,signals:x.length,buySignals:x.filter(r=>r.direction==='BUY').length,sellSignals:x.filter(r=>r.direction==='SELL').length,avgMfePct:+mfe.toFixed(3),avgMaePct:+mae.toFixed(3),avgMaxSwingPct:+sw.toFixed(3),payoffExcursion:+(mfe/Math.max(Math.abs(mae),0.0001)).toFixed(2),hitRates:Object.fromEntries(TARGETS.map(t=>[t,+(100*x.filter(r=>r.hits[t]).length/x.length).toFixed(1)]))});
  }
  return out.sort((a,b)=>(b.hitRates?.[10]||0)-(a.hitRates?.[10]||0)||(b.avgMfePct||0)-(a.avgMfePct||0));
}

function leadAnalysis(assetSignals,candles){
  const counts={1:0,2:0,3:0,4:0,5:0}; let episodes=0;
  // Episodios nao sobrepostos: movimento futuro >=10% em qualquer direcao. Busca primeiro motor nos 24 candles anteriores.
  for(let i=120;i<candles.length-HORIZON;i+=12){
    const entry=candles[i].c, f=candles.slice(i+1,i+1+HORIZON), hi=Math.max(...f.map(x=>x.h)), lo=Math.min(...f.map(x=>x.l));
    const up=(hi-entry)/entry*100, down=(entry-lo)/entry*100;
    if(Math.max(up,down)<10) continue;
    const dir=up>=down?'BUY':'SELL';
    const start=candles[Math.max(0,i-24)].t, end=candles[i].t;
    const prior=assetSignals.filter(s=>s.direction===dir&&s.t>=start&&s.t<=end).sort((a,b)=>a.t-b.t||a.motorId-b.motorId);
    if(prior.length){counts[prior[0].motorId]++;episodes++;}
  }
  return {episodesWithLead:episodes,firstMotorCounts:counts};
}

(async()=>{
  const rows=[],assets=[],errors=[]; const leadTotal={episodesWithLead:0,firstMotorCounts:{1:0,2:0,3:0,4:0,5:0}};
  for(const symbol of SYMBOLS){
    try{
      const candles=await fetchHistory(symbol,1400), lastSeen=new Map(), assetSignals=[];
      for(let i=95;i<candles.length-HORIZON-1;i++){
        const history=candles.slice(0,i+1);
        const signals=lab.evaluate(history).filter(s=>s.score>=MIN_SCORE);
        for(const s of signals){
          const key=`${s.id}:${s.direction}`; const prev=lastSeen.get(key)??-9999;
          if(i-prev<COOLDOWN) continue;
          const o=outcome(candles,i,s); if(!o) continue;
          lastSeen.set(key,i);
          const row={symbol,t:candles[i].t,motorId:s.id,motor:s.name,direction:s.direction,score:s.score,reason:s.reason,features:s.features,...o};
          rows.push(row); assetSignals.push(row);
        }
      }
      const lead=leadAnalysis(assetSignals,candles); leadTotal.episodesWithLead+=lead.episodesWithLead;
      for(const k of Object.keys(leadTotal.firstMotorCounts)) leadTotal.firstMotorCounts[k]+=lead.firstMotorCounts[k];
      assets.push({symbol,candles:candles.length,signals:assetSignals.length,first:candles[0]?.t||null,last:candles.at(-1)?.t||null,lead});
      console.log(symbol,candles.length,assetSignals.length);
    }catch(e){errors.push({symbol,error:e.message});console.error(symbol,e.message)}
  }
  const result={generatedAt:new Date().toISOString(),labVersion:lab.VERSION,market:'CRIPTO',timeframe:'H1',contextCandles:96,horizonCandles:HORIZON,minimumScore:MIN_SCORE,cooldownCandles:COOLDOWN,targets:TARGETS,assetsTested:assets.length,errors,totalSignals:rows.length,rankingOverall:overallByMotor(rows),rankingByDirection:summarize(rows),leadAnalysis:leadTotal,assets,sample:rows.slice(0,250)};
  fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({totalSignals:result.totalSignals,rankingOverall:result.rankingOverall,leadAnalysis:result.leadAnalysis},null,2));
})();
