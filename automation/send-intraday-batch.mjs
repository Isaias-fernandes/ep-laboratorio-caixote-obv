import {readJson,writeJson} from './json-store.mjs';
const token=process.env.EP_SIGNAL_INGEST_TOKEN;if(!token)throw Error('Token intraday ausente');
const state=readJson('data/intraday/buffer.json',{rows:{}}),file='data/intraday/checkpoint.json',checkpoint=readJson(file,{sent:{}});
const records=Object.values(state.rows).filter(c=>Date.parse(c.candleTime)>(checkpoint.sent[c.symbol+'|'+c.interval]??-Infinity)).sort((a,b)=>(a.symbol+'|'+a.interval).localeCompare(b.symbol+'|'+b.interval)||Date.parse(a.candleTime)-Date.parse(b.candleTime));
let sent=0;for(let i=0;i<records.length;){const candles=[];while(i<records.length&&candles.length<500){const c=records[i];if(Buffer.byteLength(JSON.stringify([...candles,c]))>800000){if(!candles.length)throw Error('Candle excede tamanho máximo');break;}candles.push(c);i++;}
  const r=await fetch('https://ep-whale-api.isaiasf59.workers.dev/ingest/intraday',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({source:'ep-intraday-v1',observedAt:new Date().toISOString(),candles}),signal:AbortSignal.timeout(60000)});
  const result=await r.json();if(!r.ok||result.ok!==true||result.accepted!==candles.length)throw Error('Ingestão intraday sem confirmação: '+JSON.stringify(result));
  for(const c of candles){const k=c.symbol+'|'+c.interval;checkpoint.sent[k]=Math.max(checkpoint.sent[k]??-Infinity,Date.parse(c.candleTime));}
  writeJson(file,checkpoint);sent+=candles.length;
}
console.log(JSON.stringify({sentIntraday:sent,pairs:Object.keys(checkpoint.sent).length}));
