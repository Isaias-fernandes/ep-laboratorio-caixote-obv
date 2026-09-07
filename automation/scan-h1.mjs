import fs from 'node:fs';
import path from 'node:path';

const CRYPTO=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','TRXUSDT','LTCUSDT','BCHUSDT','XLMUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','NEARUSDT','APTUSDT','FILUSDT','ICPUSDT','ARBUSDT','OPUSDT','SUIUSDT','AAVEUSDT'];
const B3=['PETR4','VALE3','ITUB4','BBDC4','BBAS3','WEGE3','ABEV3','B3SA3','RENT3','SUZB3','PRIO3','AXIA3','EQTL3','RADL3','GGBR4','CSNA3','MGLU3','LREN3','JBSS32','EMBJ3'];
const TARGETS=[10,20,30,40,50],OUT=path.resolve('data/auto-signals.json');
const CFG={rsi:14,cci:20,macd:[12,26,9]};
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0,clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));

function normalize(rows){return rows.map((r,i)=>({t:r.time??r.timestamp??i,o:+r.open,h:+r.high,l:+r.low,c:+r.close,v:+r.volume})).filter(x=>[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)&&x.h>=x.l&&x.v>=0)}
function ema(v,p){if(!v.length)return[];const k=2/(p+1),out=[v[0]];for(let i=1;i<v.length;i++)out.push(v[i]*k+out[i-1]*(1-k));return out}
function rsi(v,p){if(v.length<=p)return NaN;let g=0,l=0;for(let i=1;i<=p;i++){const d=v[i]-v[i-1];d>=0?g+=d:l-=d}let ag=g/p,al=l/p;for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1];ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p}return al?100-100/(1+ag/al):100}
function cci(c,p){if(c.length<p)return NaN;const t=c.slice(-p).map(x=>(x.h+x.l+x.c)/3),m=avg(t),d=avg(t.map(x=>Math.abs(x-m)));return d?(t.at(-1)-m)/(.015*d):0}
function macd(v,fast,slow,signal){if(v.length<Math.max(fast,slow,signal)+2)return{histogram:NaN,previousHistogram:NaN};const a=ema(v,fast),b=ema(v,slow),line=v.map((_,i)=>a[i]-b[i]),sig=ema(line,signal);return{line:line.at(-1),signal:sig.at(-1),histogram:line.at(-1)-sig.at(-1),previousHistogram:line.at(-2)-sig.at(-2)}}
function atr(c,p=14){if(c.length<p+1)return NaN;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return avg(tr.slice(-p))}
function slope(v){if(v.length<3)return 0;const center=(v.length-1)/2,mean=avg(v);let num=0,den=0;v.forEach((x,i)=>{const d=i-center;num+=d*(x-mean);den+=d*d});return den?num/den:0}
function swings(c,field,high){const out=[];for(let i=2;i<c.length-2;i++){const x=c[i][field],ok=high?x>c[i-1][field]&&x>=c[i+1][field]:x<c[i-1][field]&&x<=c[i+1][field];if(ok)out.push({i,x})}return out}

function classifyPattern(candles){
  const w=candles.slice(-60);if(w.length<30)return{type:'NEUTRO',direction:'NEUTRAL',name:'Dados insuficientes',confirmed:false,strength:0};
  const b=w.at(-1),a=w.at(-2),d=w.at(-3),body=Math.abs(b.c-b.o),range=Math.max(b.h-b.l,1e-12),upper=b.h-Math.max(b.o,b.c),lower=Math.min(b.o,b.c)-b.l;
  const bullEng=b.c>b.o&&a.c<a.o&&b.c>=a.o&&b.o<=a.c,bearEng=b.c<b.o&&a.c>a.o&&b.o>=a.c&&b.c<=a.o;
  const hammer=lower>=body*2&&upper<=Math.max(body,range*.12)&&b.c>=b.o,shooting=upper>=body*2&&lower<=Math.max(body,range*.12)&&b.c<=b.o;
  const morning=d.c<d.o&&Math.abs(a.c-a.o)<Math.abs(d.c-d.o)*.45&&b.c>b.o&&b.c>(d.o+d.c)/2,evening=d.c>d.o&&Math.abs(a.c-a.o)<Math.abs(d.c-d.o)*.45&&b.c<b.o&&b.c<(d.o+d.c)/2;
  const prior=w.slice(-21,-1),high=Math.max(...prior.map(x=>x.h)),low=Math.min(...prior.map(x=>x.l)),close=w.map(x=>x.c),impulse=(close.at(-9)-close.at(-17))/(close.at(-17)||1),recent=w.slice(-8),recentRange=(Math.max(...recent.map(x=>x.h))-Math.min(...recent.map(x=>x.l)))/(b.c||1),flag=Math.abs(impulse)>=.025&&recentRange<=Math.abs(impulse)*.7;
  const highs=w.slice(-18).map(x=>x.h),lows=w.slice(-18).map(x=>x.l),converging=slope(highs)<0&&slope(lows)>0,ascending=Math.abs(slope(highs))<=Math.abs(slope(lows))*.25&&slope(lows)>0,descending=Math.abs(slope(lows))<=Math.abs(slope(highs))*.25&&slope(highs)<0;
  const currentAtr=atr(w),oldAtr=atr(w.slice(0,-8)),compression=Number.isFinite(currentAtr)&&Number.isFinite(oldAtr)&&currentAtr<oldAtr*.78,peaks=swings(w,'h',true),valleys=swings(w,'l',false),tol=Math.max((currentAtr||0)*.5,b.c*.003),p1=peaks.at(-2),p2=peaks.at(-1),v1=valleys.at(-2),v2=valleys.at(-1),topNeckline=p1&&p2?Math.min(...w.slice(p1.i,p2.i+1).map(x=>x.l)):NaN,bottomNeckline=v1&&v2?Math.max(...w.slice(v1.i,v2.i+1).map(x=>x.h)):NaN;
  const doubleTop=!!(p1&&p2&&p2.i-p1.i>=8&&p2.i>=w.length-18&&Math.abs(p2.x-p1.x)<=tol&&avg([p1.x,p2.x])-topNeckline>=(currentAtr||0)*1.2&&b.c<topNeckline),doubleBottom=!!(v1&&v2&&v2.i-v1.i>=8&&v2.i>=w.length-18&&Math.abs(v2.x-v1.x)<=tol&&bottomNeckline-avg([v1.x,v2.x])>=(currentAtr||0)*1.2&&b.c>bottomNeckline);
  if(doubleBottom)return{type:'REVERSÃO',direction:'BUY',name:'Fundo duplo',confirmed:true,strength:76};
  if(doubleTop)return{type:'REVERSÃO',direction:'SELL',name:'Topo duplo',confirmed:true,strength:76};
  if(b.c>high)return{type:'CONTINUAÇÃO',direction:'BUY',name:'Rompimento da máxima de 20 períodos',confirmed:true,strength:90};
  if(b.c<low)return{type:'CONTINUAÇÃO',direction:'SELL',name:'Rompimento da mínima de 20 períodos',confirmed:true,strength:90};
  if(morning||bullEng||hammer)return{type:'REVERSÃO',direction:'BUY',name:morning?'Estrela da manhã':bullEng?'Engolfo de alta':'Martelo',confirmed:false,strength:62};
  if(evening||bearEng||shooting)return{type:'REVERSÃO',direction:'SELL',name:evening?'Estrela da noite':bearEng?'Engolfo de baixa':'Estrela cadente',confirmed:false,strength:62};
  if(flag)return{type:'CONTINUAÇÃO',direction:impulse>0?'BUY':'SELL',name:impulse>0?'Bandeira de alta':'Bandeira de baixa',confirmed:false,strength:68};
  if(ascending)return{type:'CONTINUAÇÃO',direction:'BUY',name:'Triângulo ascendente',confirmed:false,strength:64};
  if(descending)return{type:'CONTINUAÇÃO',direction:'SELL',name:'Triângulo descendente',confirmed:false,strength:64};
  if(converging||compression)return{type:'NEUTRO',direction:'NEUTRAL',name:converging?'Triângulo simétrico aguardando saída':'Compressão aguardando saída',confirmed:false,strength:50};
  if(body/range<=.1||(b.h<a.h&&b.l>a.l))return{type:'NEUTRO',direction:'NEUTRAL',name:body/range<=.1?'Doji / indecisão':'Inside bar aguardando rompimento',confirmed:false,strength:42};
  return{type:'NEUTRO',direction:'NEUTRAL',name:'Sem padrão confirmado',confirmed:false,strength:20};
}

function obvInfo(c){let value=0,series=[0];for(let i=1;i<c.length;i++){if(c[i].c>c[i-1].c)value+=c[i].v;else if(c[i].c<c[i-1].c)value-=c[i].v;series.push(value)}const n=Math.min(10,series.length-1),s=n?series.at(-1)-series.at(-1-n):0;return{trend:s>0?'SUBINDO':s<0?'CAINDO':'LATERAL'}}
function analyze(rows){
  const candles=normalize(rows);if(candles.length<96)throw Error(`menos de 96 candles (${candles.length})`);const c=candles.slice(-96),close=c.map(x=>x.c),pattern=classifyPattern(c),rv=rsi(close,CFG.rsi),cv=cci(c,CFG.cci),mv=macd(close,...CFG.macd),last=c.at(-1),volumeRatio=last.v/(avg(c.slice(-21,-1).map(x=>x.v))||last.v||1),sign=pattern.direction==='BUY'?1:pattern.direction==='SELL'?-1:0,aligned=sign&&(sign>0?rv>=50&&cv>0&&mv.histogram>0:rv<=50&&cv<0&&mv.histogram<0),ignition=sign&&(sign>0?cv>=100&&mv.histogram>mv.previousHistogram:cv<=-100&&mv.histogram<mv.previousHistogram);
  let score=pattern.strength+(aligned?14:0)+(ignition?10:0)+(volumeRatio>=2?12:volumeRatio>=1.5?8:volumeRatio>=1.2?4:0);if(pattern.type==='NEUTRO')score=Math.min(score,49);else if(volumeRatio<.8)score=Math.min(score,64);else if(volumeRatio<1.2)score=Math.min(score,79);score=clamp(Math.round(score));
  return{candles:c,pattern,score,rsi:rv,cci:cv,macd:mv,volumeRatio,momentumAligned:!!aligned,ignition:!!ignition,classification:pattern.direction!=='NEUTRAL'&&score>=80?(pattern.direction==='BUY'?'SINAL_COMPRA':'SINAL_VENDA'):'SEM_SINAL',obv:obvInfo(c)};
}

async function json(url,headers={}){const r=await fetch(url,{headers});if(!r.ok)throw Error(`${r.status}`);return r.json()}
async function cryptoCandles(symbol){const errs=[];for(const base of ['https://data-api.binance.vision','https://api.binance.com']){try{const j=await json(`${base}/api/v3/klines?symbol=${symbol}&interval=1h&limit=120`);return{source:base.includes('vision')?'BINANCE_DATA':'BINANCE',rows:j.map(x=>({time:x[0],open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}))}}catch(e){errs.push(`${base}:${e.message}`)}}try{const pair=symbol.replace(/USDT$/,'-USDT'),j=await json(`https://api.kucoin.com/api/v1/market/candles?type=1hour&symbol=${pair}`),a=j?.data||[];return{source:'KUCOIN',rows:a.slice(0,120).reverse().map(x=>({time:+x[0]*1000,open:x[1],close:x[2],high:x[3],low:x[4],volume:x[5]}))}}catch(e){errs.push(`KUCOIN:${e.message}`)}throw Error(errs.join(' | '))}
async function b3Candles(symbol){const errs=[];for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){try{const u=`https://${host}/v8/finance/chart/${encodeURIComponent(symbol+'.SA')}?range=1mo&interval=1h&includePrePost=false&events=div%2Csplits`,j=await json(u,{'User-Agent':'Mozilla/5.0'}),d=j.chart?.result?.[0];if(!d)throw Error('sem resultado');const q=d.indicators?.quote?.[0],t=d.timestamp||[],rows=t.map((ts,i)=>({time:ts*1000,open:q.open[i],high:q.high[i],low:q.low[i],close:q.close[i],volume:q.volume[i]})).filter(x=>[x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite));if(rows.length<96)throw Error(`somente ${rows.length} candles`);return{source:host.startsWith('query1')?'YAHOO1':'YAHOO2',rows}}catch(e){errs.push(`${host}:${e.message}`)}}throw Error(errs.join(' | '))}
const pct=(entry,v)=>entry?((v-entry)/entry)*100:0;function load(){try{return JSON.parse(fs.readFileSync(OUT,'utf8'))}catch{return{signals:[]}}}
function updateTracking(signals,symbol,candles){if(!candles.length)return;for(const s of signals){if(s.symbol!==symbol)continue;const after=candles.filter(c=>c.t>=s.entryTime);if(!after.length)continue;const hi=Math.max(...after.map(c=>c.h)),lo=Math.min(...after.map(c=>c.l)),fav=s.direction==='COMPRA'?pct(s.entry,hi):-pct(s.entry,lo),adv=s.direction==='COMPRA'?pct(s.entry,lo):-pct(s.entry,hi);s.best=Math.max(s.best||0,fav);s.worst=Math.min(s.worst||0,adv);s.lastPrice=after.at(-1).c;s.targets=s.targets||{};for(const t of TARGETS)if(s.best>=t)s.targets[t]=true}}

async function main(){
  const prev=load(),signals=Array.isArray(prev.signals)?prev.signals:[],stats={crypto:{ok:0,error:0},b3:{ok:0,error:0}},errors={crypto:[],b3:[]},sources={};
  for(const [market,list,fetcher] of [['CRIPTO',CRYPTO,cryptoCandles],['B3',B3,b3Candles]])for(const symbol of list){const k=market==='CRIPTO'?'crypto':'b3';try{const got=await fetcher(symbol),r=analyze(got.rows);sources[symbol]=got.source;updateTracking(signals,symbol,r.candles);if(r.classification.startsWith('SINAL_')){const last=r.candles.at(-1),direction=r.classification==='SINAL_COMPRA'?'COMPRA':'VENDA',id=`${market}|${symbol}|${last.t}|${direction}`;if(!signals.some(s=>s.id===id))signals.unshift({id,market,symbol,interval:'1h',candles:96,direction,score:r.score,entry:last.c,entryTime:last.t,createdAt:new Date(last.t).toISOString(),pattern:r.pattern.name,patternType:r.pattern.type,patternConfirmed:r.pattern.confirmed,rsi:r.rsi,cci:r.cci,macdHistogram:r.macd.histogram,momentumAligned:r.momentumAligned,ignition:r.ignition,box:'—',flag:r.pattern.name.includes('Bandeira')?r.pattern.name:'—',obv:r.obv.trend,divergence:'—',volumeRatio:r.volumeRatio,dataSource:got.source,best:0,worst:0,lastPrice:last.c,targets:{}})}stats[k].ok++}catch(e){stats[k].error++;errors[k].push({symbol,error:e.message});console.error(market,symbol,e.message)}}
  fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify({generatedAt:new Date().toISOString(),parameters:{interval:'1h',candles:96,minScore:80,logic:'INDICADORES_PADROES_CANDIDATA',rsi:14,cci:20,macd:[12,26,9],targets:TARGETS},stats,errors,sources,signals:signals.slice(0,200)},null,2)+'\n');console.log(`salvos ${signals.length} sinais; cripto ${stats.crypto.ok}/${CRYPTO.length}; B3 ${stats.b3.ok}/${B3.length}`)
}
await main();
