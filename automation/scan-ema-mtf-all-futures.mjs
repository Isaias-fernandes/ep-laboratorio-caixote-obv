import fs from 'node:fs';
import path from 'node:path';

const OUT=path.resolve('data/ema-mtf-auto.json');
const FUTURES_BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com','https://fapi3.binance.com','https://fapi4.binance.com'];
const SPOT_BASES=['https://data-api.binance.vision','https://api.binance.com'];
const INTERVALS=['5m','15m','1h'];
const LIMIT=260;
const TARGETS=[5,10,20,30,50];
const MAX_EVENTS=6000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const pct=(a,b)=>a?((b-a)/a)*100:null;

function ema(values,p){if(values.length<p)return null;const k=2/(p+1);let e=values.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<values.length;i++)e=values[i]*k+e*(1-k);return e}
function rsi(values,p=14){if(values.length<p+1)return null;let g=0,l=0;for(let i=values.length-p;i<values.length;i++){const d=values[i]-values[i-1];if(d>=0)g+=d;else l-=d}if(!l)return 100;const rs=(g/p)/(l/p);return 100-(100/(1+rs))}
function obv(c){let v=0,a=[0];for(let i=1;i<c.length;i++){if(c[i].c>c[i-1].c)v+=c[i].v;else if(c[i].c<c[i-1].c)v-=c[i].v;a.push(v)}return a}
function snapshot(c){const closes=c.map(x=>x.c),vols=c.map(x=>x.v),o=obv(c),last=c.at(-1),va=avg(vols.slice(-21,-1));return{close:last.c,e9:ema(closes,9),e21:ema(closes,21),e50:ema(closes,50),e200:ema(closes,200),rsi:rsi(closes),obv:o.at(-1),obvSlope:o.length>=11?o.at(-1)-o.at(-11):0,volRatio:va?last.v/va:null,time:last.t}}
function retest(c,s,dir){if(!s.e21)return false;return c.slice(-3).some(x=>dir==='BUY'?x.l<=s.e21*1.003&&x.c>=s.e21:x.h>=s.e21*.997&&x.c<=s.e21)}
function sideH1(s){if(s.close>s.e200&&s.e50>s.e200)return'BUY';if(s.close<s.e200&&s.e50<s.e200)return'SELL';return'NEUTRAL'}
function classify(c5,c15,c60){
  const m5=snapshot(c5),m15=snapshot(c15),h1=snapshot(c60),bias=sideH1(h1);
  const aBuy=bias==='BUY'&&m15.e9>m15.e21&&m5.e9>m5.e21&&m5.close>m5.e21&&retest(c5,m5,'BUY');
  const aSell=bias==='SELL'&&m15.e9<m15.e21&&m5.e9<m5.e21&&m5.close<m5.e21&&retest(c5,m5,'SELL');
  const aPrep=bias==='BUY'&&m15.e9>m15.e21?'PREPARAÇÃO_COMPRA':bias==='SELL'&&m15.e9<m15.e21?'PREPARAÇÃO_VENDA':'NEUTRO';
  const configA=aBuy?'COMPRA':aSell?'VENDA':aPrep;
  const bullStack=h1.close>h1.e200&&m15.e9>m15.e21&&m15.e21>m15.e50&&m5.e9>m5.e21;
  const bearStack=h1.close<h1.e200&&m15.e9<m15.e21&&m15.e21<m15.e50&&m5.e9<m5.e21;
  const bullConfirm=(m15.rsi??0)>=50&&m15.obvSlope>0&&(m5.volRatio??0)>=1.2;
  const bearConfirm=(m15.rsi??100)<=50&&m15.obvSlope<0&&(m5.volRatio??0)>=1.2;
  const bBuy=bullStack&&bullConfirm,bSell=bearStack&&bearConfirm;
  const configB=bBuy?'COMPRA':bSell?'VENDA':bullStack?'PREPARAÇÃO_COMPRA':bearStack?'PREPARAÇÃO_VENDA':'NEUTRO';
  return{configA,configB,h1,m15,m5};
}
async function j(url){const r=await fetch(url,{headers:{'User-Agent':'ep-laboratorio-caixote-obv/ema-test'}});if(!r.ok)throw Error(`${r.status} ${url}`);return r.json()}
async function firstJson(urls){const errs=[];for(const u of urls){try{return{data:await j(u),url:u}}catch(e){errs.push(e.message)}}throw Error(errs.join(' | '))}
async function universe(){
  const futuresUrls=FUTURES_BASES.map(b=>`${b}/fapi/v1/exchangeInfo`);
  try{
    const got=await firstJson(futuresUrls);
    const symbols=(got.data.symbols||[]).filter(s=>s.contractType==='PERPETUAL'&&s.quoteAsset==='USDT'&&s.status==='TRADING').map(s=>s.symbol).sort();
    if(!symbols.length)throw Error('universo Futures vazio');
    return{symbols,mode:'FUTURES',source:new URL(got.url).origin};
  }catch(futuresError){
    const spotUrls=SPOT_BASES.map(b=>`${b}/api/v3/exchangeInfo`);
    const got=await firstJson(spotUrls);
    const symbols=(got.data.symbols||[]).filter(s=>s.quoteAsset==='USDT'&&s.status==='TRADING'&&s.isSpotTradingAllowed!==false).map(s=>s.symbol).sort();
    if(!symbols.length)throw Error(`Futures indisponível (${futuresError.message}); universo spot também vazio`);
    console.warn('Futures exchangeInfo bloqueado; usando universo público USDT como fallback:',futuresError.message);
    return{symbols,mode:'SPOT_FALLBACK',source:new URL(got.url).origin,futuresError:futuresError.message};
  }
}
async function candles(symbol,interval,mode){
  await sleep(90);
  const futuresUrls=FUTURES_BASES.map(b=>`${b}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${LIMIT}`);
  if(mode==='FUTURES'){
    const got=await firstJson(futuresUrls);
    return{source:new URL(got.url).origin,rows:normalizeKlines(got.data)};
  }
  const spotUrls=SPOT_BASES.map(b=>`${b}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${LIMIT}`);
  const got=await firstJson(spotUrls);
  return{source:new URL(got.url).origin,rows:normalizeKlines(got.data)};
}
function normalizeKlines(x){return (Array.isArray(x)?x:[]).map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]})).filter(x=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite))}
function load(){try{return JSON.parse(fs.readFileSync(OUT,'utf8'))}catch{return{events:[],latest:[]}}}
function stateKey(r){return `${r.configA}|${r.configB}`}
function dirOf(v){return v==='COMPRA'||v==='PREPARAÇÃO_COMPRA'?'BUY':v==='VENDA'||v==='PREPARAÇÃO_VENDA'?'SELL':null}
function updateEventOutcomes(events,symbol,lastPrice,high,low){for(const e of events){if(e.symbol!==symbol||e.closed)continue;const dir=e.direction;if(dir==='BUY'){e.mfe=Math.max(e.mfe??0,pct(e.entry,high));e.mae=Math.min(e.mae??0,pct(e.entry,low));}else{e.mfe=Math.max(e.mfe??0,-pct(e.entry,low));e.mae=Math.min(e.mae??0,-pct(e.entry,high));}e.lastPrice=lastPrice;e.targets=e.targets||{};for(const t of TARGETS)if((e.mfe??0)>=t)e.targets[t]=true}}
async function main(){
  const prev=load(),events=Array.isArray(prev.events)?prev.events:[],prevLatest=new Map((prev.latest||[]).map(x=>[x.symbol,x]));
  const u=await universe(),symbols=u.symbols,latest=[],errors=[];let ok=0;
  console.log(`Universo: ${symbols.length} ativos | modo=${u.mode} | fonte=${u.source}`);
  for(const [i,symbol] of symbols.entries()){
    try{
      const k5=await candles(symbol,'5m',u.mode),k15=await candles(symbol,'15m',u.mode),k60=await candles(symbol,'1h',u.mode);
      const c5=k5.rows,c15=k15.rows,c60=k60.rows;
      if(c5.length<200||c15.length<200||c60.length<200)throw Error('candles insuficientes');
      const r=classify(c5,c15,c60),last=c5.at(-1),row={symbol,updatedAt:new Date().toISOString(),price:last.c,configA:r.configA,configB:r.configB,h1:r.h1,m15:r.m15,m5:r.m5,marketDataMode:u.mode,source:k5.source};
      latest.push(row);ok++;
      updateEventOutcomes(events,symbol,last.c,last.h,last.l);
      const before=prevLatest.get(symbol);if(!before||stateKey(before)!==stateKey(row)){
        for(const [config,label] of [['A',r.configA],['B',r.configB]]){const dir=dirOf(label),prevLabel=before?.[`config${config}`];if(dir&&label!==prevLabel){events.unshift({id:`${symbol}|${config}|${last.t}|${label}`,symbol,config,label,direction:dir,entry:last.c,entryTime:last.t,createdAt:new Date(last.t).toISOString(),mfe:0,mae:0,lastPrice:last.c,targets:{},marketDataMode:u.mode,source:k5.source,context:{h1:r.h1,m15:r.m15,m5:r.m5}})}}
      }
      if((i+1)%25===0)console.log(`Analisados ${i+1}/${symbols.length}`);
    }catch(e){errors.push({symbol,error:String(e.message||e)});if(errors.length<=20)console.warn(symbol,e.message)}
  }
  const out={schemaVersion:2,updatedAt:new Date().toISOString(),source:u.mode==='FUTURES'?'BINANCE_USDT_PERPETUAL_FUTURES':'BINANCE_USDT_PUBLIC_MARKET_FALLBACK',marketDataMode:u.mode,sourceHost:u.source,futuresDiscoveryError:u.futuresError||null,intervals:INTERVALS,universe:{contracts:symbols.length,analyzed:ok,errors:errors.length},rules:{configA:'H1 direção; M15 confirmação EMA 9/21; M5 gatilho/reteste EMA21',configB:'EMA 9/21/50/200 + RSI + OBV + volume',targetsPct:TARGETS},latest,events:events.slice(0,MAX_EVENTS),errors:errors.slice(0,200)};
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(out,null,2));
  console.log(`Concluído: ${ok}/${symbols.length} ativos | erros=${errors.length} | modo=${u.mode}`);
  if(ok===0)throw Error('Nenhum ativo pôde ser analisado');
}
main().catch(e=>{console.error(e);process.exitCode=1});
