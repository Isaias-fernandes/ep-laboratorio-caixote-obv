import fs from 'node:fs';
import path from 'node:path';

const CRYPTO=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','TRXUSDT','LTCUSDT','BCHUSDT','XLMUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','NEARUSDT','APTUSDT','FILUSDT','ICPUSDT','ARBUSDT','OPUSDT','SUIUSDT','AAVEUSDT'];
const B3=['PETR4','VALE3','ITUB4','BBDC4','BBAS3','WEGE3','ABEV3','B3SA3','RENT3','SUZB3','PRIO3','AXIA3','EQTL3','RADL3','GGBR4','CSNA3','MGLU3','LREN3','JBSS32','EMBJ3'];
const OUT=path.resolve('data/modelos-ab-auto.json');
const TARGETS=[5,10,20,30,50];
const TF=['1m','5m','15m','30m','1h'];
const MAX_EVENTS=5000;
const MAX_AGE_MS=7*24*3600e3;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const pct=(a,b)=>a?((b-a)/a)*100:null;

function ema(v,p){if(v.length<p)return null;const k=2/(p+1);let e=avg(v.slice(0,p));for(let i=p;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
function rsi(v,p=14){if(v.length<p+1)return null;let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}if(!l)return 100;return 100-(100/(1+(g/p)/(l/p)))}
function atr(c,p=14){if(c.length<p+1)return null;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return avg(tr.slice(-p))}
function obv(c){let v=0,a=[0];for(let i=1;i<c.length;i++){if(c[i].c>c[i-1].c)v+=c[i].v;else if(c[i].c<c[i-1].c)v-=c[i].v;a.push(v)}return a}
function vwap(c){let pv=0,v=0;for(const x of c){const tp=(x.h+x.l+x.c)/3;pv+=tp*x.v;v+=x.v}return v?pv/v:null}
function boll(v,p=20,m=2){const a=v.slice(-p);if(a.length<p)return{};const mid=avg(a),sd=Math.sqrt(avg(a.map(x=>(x-mid)**2))),up=mid+m*sd,lo=mid-m*sd;return{mid,up,lo,bbw:mid?(up-lo)/mid*100:null}}
function adx(c,p=14){if(c.length<p*2+1)return null;const tr=[],plus=[],minus=[];for(let i=1;i<c.length;i++){const up=c[i].h-c[i-1].h,dn=c[i-1].l-c[i].l;plus.push(up>dn&&up>0?up:0);minus.push(dn>up&&dn>0?dn:0);tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)))}const dx=[];for(let i=p-1;i<tr.length;i++){const T=tr.slice(i-p+1,i+1).reduce((a,b)=>a+b,0),P=plus.slice(i-p+1,i+1).reduce((a,b)=>a+b,0),M=minus.slice(i-p+1,i+1).reduce((a,b)=>a+b,0),pi=T?100*P/T:0,mi=T?100*M/T:0;dx.push(pi+mi?100*Math.abs(pi-mi)/(pi+mi):0)}return avg(dx.slice(-p))}
function macd(v){if(v.length<35)return{hist:null};const seq=p=>{const k=2/(p+1),o=[v[0]];for(let i=1;i<v.length;i++)o.push(v[i]*k+o[i-1]*(1-k));return o};const a=seq(12),b=seq(26),d=v.map((_,i)=>a[i]-b[i]),k=2/10;let s=d[0];for(let i=1;i<d.length;i++)s=d[i]*k+s*(1-k);return{dif:d.at(-1),signal:s,hist:d.at(-1)-s}}
function snapshot(c){const close=c.map(x=>x.c),o=obv(c),last=c.at(-1),A=atr(c),B=boll(close),vw=vwap(c.slice(-Math.min(c.length,240)));return{time:last.t,price:last.c,e9:ema(close,9),e21:ema(close,21),e50:ema(close,50),e200:ema(close,200),rsi:rsi(close),atr:A,atrPct:last.c&&A!=null?100*A/last.c:null,vwap:vw,vwapSide:vw==null?'NA':last.c>vw?'ACIMA':last.c<vw?'ABAIXO':'NA',obvSlope:o.length>10?o.at(-1)-o.at(-11):0,bbw:B.bbw,macd:macd(close),adx:adx(c),volumeRatio:(()=>{const m=avg(c.slice(-21,-1).map(x=>x.v));return m?last.v/m:null})()}}
function cats(tf,mode,side='BUY'){
  const dir=side==='SELL'?-1:1;let C={};
  if(mode==='A'){
    const a=[tf.m1,tf.m5,tf.m15];
    C.tendencia=a.filter(x=>dir>0?(x.price>x.vwap&&x.e9>x.e21):(x.price<x.vwap&&x.e9<x.e21)).length/3;
    C.momentum=a.filter(x=>dir>0?(x.rsi>=50&&x.rsi<80):(x.rsi<=50&&x.rsi>20)).length/3;
    C.fluxo=a.filter(x=>dir>0?x.obvSlope>0:x.obvSlope<0).length/3;
    const bbw=[tf.m5.bbw,tf.m15.bbw].filter(Number.isFinite);C.volatilidade=bbw.length?1:0;
    const exp=Number.isFinite(tf.m5.bbw)&&Number.isFinite(tf.m15.bbw)&&(tf.m5.bbw>tf.m15.bbw*.65);C.estrutura=exp?1:.5;
  } else {
    const a=[tf.m15,tf.m30,tf.h1];
    C.tendencia=a.filter(x=>dir>0?(x.price>x.e200&&x.e21>x.e50):(x.price<x.e200&&x.e21<x.e50)).length/3;
    C.momentum=a.filter(x=>dir>0?x.macd.hist>0:x.macd.hist<0).length/3;
    C.fluxo=a.filter(x=>dir>0?x.obvSlope>0:x.obvSlope<0).length/3;
    C.volatilidade=a.filter(x=>Number.isFinite(x.adx)&&x.adx>=20&&Number.isFinite(x.atrPct)).length/3;
    C.estrutura=a.filter(x=>Number.isFinite(x.bbw)).length/3;
  }
  const total=Math.round(Object.values(C).reduce((a,b)=>a+b,0)/5*100);
  return{side,total,state:total>=80?'FORTE':total>=60?'PROMISSOR':total>=40?'OBSERVACAO':'NEUTRO',categorias:C};
}
function choose(tf,mode){const buy=cats(tf,mode,'BUY'),sell=cats(tf,mode,'SELL');return buy.total>=sell.total?buy:sell}
async function json(url,headers={}){const r=await fetch(url,{headers});if(!r.ok)throw Error(`${r.status} ${url}`);return r.json()}
async function crypto(symbol,interval){const errs=[];for(const base of ['https://data-api.binance.vision','https://api.binance.com']){try{await sleep(70);const j=await json(`${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=260`);return{source:base.includes('vision')?'BINANCE_DATA':'BINANCE',rows:j.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}))}}catch(e){errs.push(e.message)}}throw Error(errs.join(' | '))}
const yahooInterval=x=>x==='1h'?'60m':x;
const yahooRange=x=>x==='1m'?'5d':x==='5m'?'5d':'1mo';
async function b3(symbol,interval){const errs=[];for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){try{await sleep(100);const j=await json(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol+'.SA')}?range=${yahooRange(interval)}&interval=${yahooInterval(interval)}&includePrePost=false&events=div%2Csplits`,{'User-Agent':'Mozilla/5.0'}),d=j.chart?.result?.[0];if(!d)throw Error('sem resultado');const q=d.indicators?.quote?.[0],t=d.timestamp||[],rows=t.map((z,i)=>({t:z*1000,o:+q.open[i],h:+q.high[i],l:+q.low[i],c:+q.close[i],v:+q.volume[i]})).filter(x=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite));if(rows.length<60)throw Error(`candles insuficientes ${rows.length}`);return{source:host.startsWith('query1')?'YAHOO1':'YAHOO2',rows:rows.slice(-260)}}catch(e){errs.push(e.message)}}throw Error(errs.join(' | '))}
function load(){try{return JSON.parse(fs.readFileSync(OUT,'utf8'))}catch{return{events:[],latest:[]}}}
function eventKey(symbol,model,r){return`${symbol}|${model}|${r.side}|${r.state}`}
function track(events,symbol,last){const now=Date.now();for(const e of events){if(e.symbol!==symbol||e.status==='CLOSED')continue;if(now-e.createdMs>MAX_AGE_MS){e.status='CLOSED';e.closedAt=new Date(now).toISOString();continue}const dir=e.side;if(dir==='BUY'){e.mfe=Math.max(e.mfe??0,pct(e.entry,last.h)??0);e.mae=Math.min(e.mae??0,pct(e.entry,last.l)??0)}else{e.mfe=Math.max(e.mfe??0,-(pct(e.entry,last.l)??0));e.mae=Math.min(e.mae??0,-(pct(e.entry,last.h)??0))}e.lastPrice=last.c;e.lastUpdate=new Date(last.t).toISOString();e.targets=e.targets||{};e.targetTimes=e.targetTimes||{};for(const t of TARGETS)if((e.mfe??0)>=t&&!e.targets[t]){e.targets[t]=true;e.targetTimes[t]=new Date(last.t).toISOString()}}}
async function analyzeAsset(market,symbol,fetcher){const raw={};const src={};for(const interval of TF){const g=await fetcher(symbol,interval);raw[interval]=g.rows;src[interval]=g.source}if(raw['1h'].length<200||raw['15m'].length<200||raw['5m'].length<200)throw Error('historico insuficiente para EMA200');const tf={m1:snapshot(raw['1m']),m5:snapshot(raw['5m']),m15:snapshot(raw['15m']),m30:snapshot(raw['30m']),h1:snapshot(raw['1h'])},A=choose(tf,'A'),B=choose(tf,'B'),last=raw['1m'].at(-1);return{market,symbol,updatedAt:new Date().toISOString(),price:last.c,A,B,tf,sources:src,last}}
async function main(){const prev=load(),events=Array.isArray(prev.events)?prev.events:[],prevMap=new Map((prev.latest||[]).map(x=>[`${x.market}|${x.symbol}`,x])),latest=[],errors=[];let ok=0;
for(const [market,list,fetcher] of [['CRIPTO',CRYPTO,crypto],['B3',B3,b3]])for(const symbol of list){try{const row=await analyzeAsset(market,symbol,fetcher);latest.push(row);ok++;track(events,symbol,row.last);const before=prevMap.get(`${market}|${symbol}`);for(const model of ['A','B']){const r=row[model],prior=before?.[model];if(['PROMISSOR','FORTE'].includes(r.state)&&(!prior||eventKey(symbol,model,prior)!==eventKey(symbol,model,r))){events.unshift({id:`${market}|${symbol}|${model}|${row.last.t}|${r.side}|${r.state}`,market,symbol,model,state:r.state,side:r.side,score:r.total,entry:row.last.c,entryTime:row.last.t,createdAt:new Date(row.last.t).toISOString(),createdMs:row.last.t,status:'OPEN',mfe:0,mae:0,lastPrice:row.last.c,targets:{},targetTimes:{},categories:r.categorias,context:{m1:row.tf.m1,m5:row.tf.m5,m15:row.tf.m15,m30:row.tf.m30,h1:row.tf.h1},sources:row.sources})}}
console.log(`${market} ${symbol} OK A=${row.A.state}/${row.A.total} B=${row.B.state}/${row.B.total}`)}catch(e){errors.push({market,symbol,error:String(e.message||e)});console.warn(`${market} ${symbol}: ${e.message}`)}}
const pairs=[];for(const a of events.filter(x=>x.model==='A')){const b=events.find(x=>x.model==='B'&&x.symbol===a.symbol&&x.side===a.side&&x.entryTime>=a.entryTime&&x.entryTime-a.entryTime<=24*3600e3);if(b)pairs.push({symbol:a.symbol,market:a.market,side:a.side,aId:a.id,bId:b.id,leadMinutes:Math.round((b.entryTime-a.entryTime)/60000),aScore:a.score,bScore:b.score,aMfe:a.mfe,aMae:a.mae,targets:a.targets})}
const out={schemaVersion:1,updatedAt:new Date().toISOString(),scope:{crypto:CRYPTO.length,b3:B3.length,timeframes:TF,targetsPct:TARGETS,eventMaxAgeDays:7},rules:{A:'Antecipacao M1/M5/M15 por categorias Tendencia/Momentum/Fluxo/Volatilidade/Estrutura',B:'Confirmacao M15/M30/H1 por categorias; ADX>=20 na volatilidade',event:'Novo evento em transicao para PROMISSOR ou FORTE; acompanhamento ate 7 dias'},universe:{total:CRYPTO.length+B3.length,analyzed:ok,errors:errors.length},latest,events:events.slice(0,MAX_EVENTS),pairs:pairs.slice(0,3000),errors:errors.slice(0,200)};fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(out,null,2));console.log(`Concluido ${ok}/${CRYPTO.length+B3.length}; eventos ${events.length}; pares A->B ${pairs.length}`)}
main().catch(e=>{console.error(e);process.exitCode=1});
