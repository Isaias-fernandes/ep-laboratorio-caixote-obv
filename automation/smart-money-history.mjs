import fs from 'node:fs';
import path from 'node:path';

/*
  OBSERVADOR SMART MONEY / LIQUIDEZ — SOMENTE EXPERIMENTAL
  - Nao altera score, sinais, motores ou classificacao.
  - Enriquece data/h1-history.json com snapshot no momento da entrada.
  - Liquidity Sweep, CHoCH/MSB, FVG, VWAP e Volume Profile/POC aproximado.
  - Para CRIPTO tenta acrescentar OI, funding e agressao taker do candle futuro H1.
*/

const FILE=path.resolve('data/h1-history.json');
const VERSION=1;
const num=v=>Number.isFinite(+v)?+v:null;
const pct=(a,b)=>a?((b-a)/a)*100:null;
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function normalize(rows){return (rows||[]).map((r,i)=>({t:+(r.time??r.timestamp??i),o:+r.open,h:+r.high,l:+r.low,c:+r.close,v:+r.volume})).filter(x=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.h>=x.l&&x.v>=0).sort((a,b)=>a.t-b.t)}
async function json(url,headers={}){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),9000);try{const r=await fetch(url,{headers,signal:ctl.signal});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}}

async function spotCandles(market,symbol){
  if(market==='CRIPTO'){
    const errs=[];
    for(const base of ['https://data-api.binance.vision','https://api.binance.com']){
      try{const j=await json(`${base}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=1000`);return normalize(j.map(x=>({time:x[0],open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})))}catch(e){errs.push(`${base}:${e.message}`)}
    }
    try{const pair=symbol.replace(/USDT$/,'-USDT'),j=await json(`https://api.kucoin.com/api/v1/market/candles?type=1hour&symbol=${pair}`);return normalize((j?.data||[]).slice(0,1000).reverse().map(x=>({time:+x[0]*1000,open:x[1],close:x[2],high:x[3],low:x[4],volume:x[5]})))}catch(e){errs.push(`KUCOIN:${e.message}`)}
    throw Error(errs.join(' | '));
  }
  const errs=[];
  for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
    try{const u=`https://${host}/v8/finance/chart/${encodeURIComponent(symbol+'.SA')}?range=3mo&interval=1h&includePrePost=false&events=div%2Csplits`,j=await json(u,{'User-Agent':'Mozilla/5.0'}),d=j.chart?.result?.[0];if(!d)throw Error('sem resultado');const q=d.indicators?.quote?.[0],t=d.timestamp||[];return normalize(t.map((ts,i)=>({time:ts*1000,open:q.open[i],high:q.high[i],low:q.low[i],close:q.close[i],volume:q.volume[i]})))}catch(e){errs.push(`${host}:${e.message}`)}
  }
  throw Error(errs.join(' | '));
}

function liquiditySweep(c){
  let out={type:'NONE',time:null,level:null,close:null};
  for(let i=Math.max(20,c.length-12);i<c.length;i++){
    const prior=c.slice(i-20,i);if(prior.length<20)continue;
    const ph=Math.max(...prior.map(x=>x.h)),pl=Math.min(...prior.map(x=>x.l)),x=c[i];
    if(x.l<pl&&x.c>pl)out={type:'BULLISH_SWEEP',time:x.t,level:pl,close:x.c};
    if(x.h>ph&&x.c<ph)out={type:'BEARISH_SWEEP',time:x.t,level:ph,close:x.c};
  }
  return out;
}

function swings(c){
  const hi=[],lo=[];
  for(let i=2;i<c.length-2;i++){
    if(c[i].h>c[i-1].h&&c[i].h>=c[i+1].h&&c[i].h>c[i-2].h&&c[i].h>=c[i+2].h)hi.push({i,t:c[i].t,p:c[i].h});
    if(c[i].l<c[i-1].l&&c[i].l<=c[i+1].l&&c[i].l<c[i-2].l&&c[i].l<=c[i+2].l)lo.push({i,t:c[i].t,p:c[i].l});
  }
  return{hi,lo};
}

function structure(c){
  const {hi,lo}=swings(c),last=c.at(-1);if(hi.length<2||lo.length<2)return{type:'NONE',brokenLevel:null,time:null,priorStructure:'INDEFINIDA'};
  const h1=hi.at(-2),h2=hi.at(-1),l1=lo.at(-2),l2=lo.at(-1);
  const prior=h2.p>h1.p&&l2.p>l1.p?'ALTA':h2.p<h1.p&&l2.p<l1.p?'BAIXA':'LATERAL';
  if(last.c>h2.p)return{type:prior==='BAIXA'?'CHOCH_BULL':'MSB_BULL',brokenLevel:h2.p,time:last.t,priorStructure:prior};
  if(last.c<l2.p)return{type:prior==='ALTA'?'CHOCH_BEAR':'MSB_BEAR',brokenLevel:l2.p,time:last.t,priorStructure:prior};
  return{type:'NONE',brokenLevel:null,time:null,priorStructure:prior};
}

function fvg(c){
  let latest=null;
  for(let i=2;i<c.length;i++){
    const a=c[i-2],x=c[i];
    if(x.l>a.h){
      const low=a.h,high=x.l,after=c.slice(i+1),mitigated=after.some(k=>k.l<=high);
      latest={type:'BULLISH_FVG',time:x.t,low,high,sizePct:pct(low,high),mitigated};
    }else if(x.h<a.l){
      const low=x.h,high=a.l,after=c.slice(i+1),mitigated=after.some(k=>k.h>=low);
      latest={type:'BEARISH_FVG',time:x.t,low,high,sizePct:pct(low,high),mitigated};
    }
  }
  return latest||{type:'NONE',time:null,low:null,high:null,sizePct:null,mitigated:null};
}

function vwap(c){let pv=0,v=0;for(const x of c){const tp=(x.h+x.l+x.c)/3;pv+=tp*x.v;v+=x.v}return v?pv/v:null}
function profile(c,bins=24){
  const lo=Math.min(...c.map(x=>x.l)),hi=Math.max(...c.map(x=>x.h));if(!(hi>lo))return{poc:null,pocShare:null,bins};
  const step=(hi-lo)/bins,vol=Array(bins).fill(0);let total=0;
  for(const x of c){const tp=(x.h+x.l+x.c)/3,idx=Math.max(0,Math.min(bins-1,Math.floor((tp-lo)/step)));vol[idx]+=x.v;total+=x.v}
  let im=0;for(let i=1;i<vol.length;i++)if(vol[i]>vol[im])im=i;
  return{poc:lo+(im+.5)*step,pocShare:total?vol[im]/total*100:null,bins,method:'HLC3_VOLUME_BUCKET_APPROX'};
}

async function futuresContext(symbol,entryTime){
  const out={available:false,source:'BINANCE_USDM_PUBLIC',openInterest:null,oiChangePct:null,fundingRate:null,takerBuyRatio:null,aggression:'UNAVAILABLE'};
  try{
    const start=entryTime-3600000,end=entryTime+3600000;
    const [k,oi,fr]=await Promise.all([
      json(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&startTime=${entryTime}&limit=1`).catch(()=>null),
      json(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=1h&startTime=${start}&endTime=${end}&limit=3`).catch(()=>null),
      json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&startTime=${entryTime-28800000}&endTime=${entryTime+28800000}&limit=10`).catch(()=>null)
    ]);
    if(Array.isArray(k)&&k[0]){const vol=+k[0][5],buy=+k[0][9];if(vol>0){out.takerBuyRatio=buy/vol;out.aggression=out.takerBuyRatio>=.55?'COMPRADORA':out.takerBuyRatio<=.45?'VENDEDORA':'NEUTRA'}}
    if(Array.isArray(oi)&&oi.length){const sorted=oi.map(x=>({t:+x.timestamp,oi:+x.sumOpenInterest})).filter(x=>Number.isFinite(x.oi)).sort((a,b)=>a.t-b.t);const near=sorted.reduce((a,b)=>Math.abs(b.t-entryTime)<Math.abs(a.t-entryTime)?b:a,sorted[0]);out.openInterest=near?.oi??null;if(sorted.length>=2){const a=sorted.at(-2)?.oi,b=sorted.at(-1)?.oi;if(a)out.oiChangePct=(b/a-1)*100}}
    if(Array.isArray(fr)&&fr.length){const near=fr.reduce((a,b)=>Math.abs(+b.fundingTime-entryTime)<Math.abs(+a.fundingTime-entryTime)?b:a,fr[0]);out.fundingRate=num(near?.fundingRate)}
    out.available=[out.openInterest,out.takerBuyRatio,out.fundingRate].some(v=>v!=null);
  }catch{}
  return out;
}

function buildSnapshot(rec,c,fut){
  const context=c.filter(x=>x.t<=rec.entryTime).slice(-96);if(context.length<30)return null;
  const liq=liquiditySweep(context),st=structure(context),gap=fvg(context.slice(-60)),vw=vwap(context),vp=profile(context),entry=num(rec.entry),obv=rec.indicators?.obv??null;
  const bullStructure=['CHOCH_BULL','MSB_BULL'].includes(st.type),bearStructure=['CHOCH_BEAR','MSB_BEAR'].includes(st.type);
  const oiUp=(fut?.oiChangePct??0)>0,flowBuy=fut?.aggression==='COMPRADORA',flowSell=fut?.aggression==='VENDEDORA';
  const fullBull=liq.type==='BULLISH_SWEEP'&&bullStructure&&obv==='SUBINDO'&&oiUp&&flowBuy;
  const fullBear=liq.type==='BEARISH_SWEEP'&&bearStructure&&obv==='CAINDO'&&oiUp&&flowSell;
  return{version:VERSION,capturedForEntryTime:rec.entryTime,contextCandles:context.length,liquiditySweep:liq,structure:st,fvg:gap,vwap:{value:vw,entryDistancePct:vw!=null&&entry!=null?pct(vw,entry):null,side:vw==null||entry==null?'UNKNOWN':entry>=vw?'ABOVE':'BELOW'},volumeProfile:vp,futures:fut||{available:false,source:null},confluence:{fullBull,fullBear,fullAny:fullBull||fullBear,coreBull:(liq.type==='BULLISH_SWEEP'||bullStructure)&&obv==='SUBINDO',coreBear:(liq.type==='BEARISH_SWEEP'||bearStructure)&&obv==='CAINDO'},notes:['Volume Profile/POC e aproximacao por volume da vela alocado ao preco tipico; nao e perfil tick-by-tick.','CHoCH/MSB, Sweep e FVG sao detectores heurísticos experimentais e nao alteram sinais.']};
}

async function main(){
  const h=readJson(FILE,null);if(!h||!Array.isArray(h.records))throw Error('data/h1-history.json indisponivel');
  const todo=h.records.filter(r=>!r.smartMoneyObserver||r.smartMoneyObserver.version!==VERSION),groups=new Map();
  for(const r of todo){const key=`${r.market}|${r.symbol}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  const errors=[];let updated=0;
  for(const [key,recs] of groups){const [market,symbol]=key.split('|');try{const candles=await spotCandles(market,symbol);for(const r of recs){let fut={available:false,source:null};if(market==='CRIPTO')fut=await futuresContext(symbol,r.entryTime);const snap=buildSnapshot(r,candles,fut);if(snap){r.smartMoneyObserver=snap;updated++}await sleep(40)}}catch(e){errors.push({market,symbol,error:e.message})}await sleep(80)}
  const usable=h.records.filter(r=>r.smartMoneyObserver),full=usable.filter(r=>r.smartMoneyObserver?.confluence?.fullAny);
  const mae=a=>avg(a.map(r=>Math.abs(num(r.tracking?.mae)||0))),favFirst=(a,t='1')=>{const done=a.filter(r=>r.tracking?.order?.[t]);return done.length?done.filter(r=>String(r.tracking.order[t]).startsWith('FAVORAVEL_PRIMEIRO')).length/done.length*100:null};
  h.smartMoneySummary={version:VERSION,updatedAt:new Date().toISOString(),recordsWithObserver:usable.length,fullConfluence:full.length,fullAvgAbsMae:mae(full),baselineAvgAbsMae:mae(usable),fullFavFirst1Pct:favFirst(full,'1'),baselineFavFirst1Pct:favFirst(usable,'1'),errors};
  fs.writeFileSync(FILE,JSON.stringify(h,null,2)+'\n');console.log(`Smart Money observer: ${updated} enriquecidos; total ${usable.length}; confluencia completa ${full.length}; erros ${errors.length}`);
}
await main();
