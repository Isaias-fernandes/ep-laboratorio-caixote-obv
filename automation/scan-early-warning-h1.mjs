import fs from 'node:fs';
import path from 'node:path';
import early from '../early-warning-patterns-v1.js';

const CRYPTO=['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','TRXUSDT','LTCUSDT','BCHUSDT','XLMUSDT','UNIUSDT','ATOMUSDT','ETCUSDT','NEARUSDT','APTUSDT','FILUSDT','ICPUSDT','ARBUSDT','OPUSDT','SUIUSDT','AAVEUSDT','TIAUSDT','XTZUSDT','LDOUSDT','SEIUSDT','INJUSDT','RUNEUSDT','ALGOUSDT','FETUSDT','GALAUSDT','SANDUSDT','MANAUSDT','CRVUSDT','DYDXUSDT','JUPUSDT','WIFUSDT','BONKUSDT','SHIBUSDT','TONUSDT','STXUSDT','IMXUSDT','RENDERUSDT','THETAUSDT','VETUSDT','ZECUSDT'];
const B3=[]; // B3 desativada: foco exclusivo em criptomoedas; motores/regras preservados
const OUT=path.resolve('data/early-warning-auto.json');
const HOUR=3600000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJSON(url){const r=await fetch(url,{headers:{'User-Agent':'laboratorio-early-warning/1.0'}});if(!r.ok)throw Error(`${r.status} ${r.statusText}`);return r.json()}
async function cryptoHistory(symbol){let lastErr;for(const base of ['https://data-api.binance.vision','https://api.binance.com']){try{const j=await getJSON(`${base}/api/v3/klines?symbol=${symbol}&interval=1h&limit=180`);return j.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]})).filter(x=>x.t+HOUR<=Date.now())}catch(e){lastErr=e}}throw lastErr||Error('sem dados')}
async function b3History(symbol){let lastErr;for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){try{const j=await getJSON(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol+'.SA')}?range=1mo&interval=1h&includePrePost=false&events=div%2Csplits`),d=j.chart?.result?.[0],q=d?.indicators?.quote?.[0],t=d?.timestamp||[];if(!d||!q)throw Error('sem resultado');return t.map((ts,i)=>({t:ts*1000,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]})).filter(x=>[x.t,x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)).slice(-180)}catch(e){lastErr=e}}throw lastErr||Error('sem dados B3')}
const rank={
 'Three Rising Valleys':{breakout24:63.7,avgLead:6.69,hit10:24.3,hit20:12.2},
 'Bull Pennant':{breakout24:58.1,avgLead:6.63,hit10:45.6,hit20:23.5},
 'Falling Wedge':{breakout24:56.2,avgLead:8.03,hit10:15.7,hit20:7.5},
 'Bull Flag':{breakout24:47.5,avgLead:7.62,hit10:36.1,hit20:21.3},
 'Double Bottom':{breakout24:49.7,avgLead:7.97,hit10:16.6,hit20:7.1},
 'Rectangle Accumulation':{breakout24:46.4,avgLead:8.29,hit10:15.9,hit20:7.8}
};
function priority(s,confluence){const hist=rank[s.name]||{};let p=s.score+(hist.breakout24||0)*.25+(hist.hit10||0)*.2+Math.max(0,confluence-1)*10;if(s.obvConfirm)p+=7;if(s.compression)p+=5;if(s.distanceToBreakoutPct<=1)p+=6;return Math.round(Math.min(100,p))}
(async()=>{const signals=[],stats={crypto:{ok:0,error:0},b3:{ok:0,error:0}},errors=[];for(const [market,list,fetcher,key] of [['CRIPTO',CRYPTO,cryptoHistory,'crypto'],['B3',B3,b3History,'b3']]){for(const symbol of list){try{const candles=await fetcher(symbol);const found=early.detect(candles);const confluence=found.length;for(const s of found){const h=rank[s.name]||{};signals.push({...s,market,symbol,timeframe:'H1',contextCandles:96,createdAt:new Date(candles.at(-1)?.t||Date.now()).toISOString(),confluence,priority:priority(s,confluence),historical:h});}stats[key].ok++;}catch(e){stats[key].error++;errors.push({market,symbol,error:e.message})}await sleep(40)}}signals.sort((a,b)=>b.priority-a.priority||b.score-a.score);const result={generatedAt:new Date().toISOString(),version:early.VERSION,timeframe:'H1',minimumEarlyScore:early.MIN_EARLY_SCORE,signals:signals.slice(0,250),stats,errors};fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({signals:signals.length,top:signals.slice(0,20),stats},null,2))})();
