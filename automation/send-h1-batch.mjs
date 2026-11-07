import {readJson,writeJson} from './json-store.mjs';
import {recordHash} from './export-tidb-batch.mjs';
const token=process.env.EP_SIGNAL_INGEST_TOKEN;if(!token)throw Error('EP_SIGNAL_INGEST_TOKEN ausente');
const batch=readJson(process.env.EP_TIDB_BATCH_PATH||'/tmp/ep-h1-batch.json',{candles:[],signals:[]});
const checkpointFile='data/tidb-export-checkpoint.json',checkpoint=readJson(checkpointFile,{candles:{},signals:{}});
for(const key of ['candles','signals']){
  for(let i=0;i<batch[key].length;){
    const page=[];while(i<batch[key].length&&page.length<500){const record=batch[key][i];const proposed={...batch,candles:key==='candles'?[...page,record]:[],signals:key==='signals'?[...page,record]:[]};if(Buffer.byteLength(JSON.stringify(proposed))>850000){if(!page.length)throw Error('Registro excede tamanho máximo');break;}page.push(record);i++;}
    const body={source:'ep-lab-h1-v1',observedAt:batch.observedAt,candles:key==='candles'?page:[],signals:key==='signals'?page:[]};
    const r=await fetch('https://ep-whale-api.isaiasf59.workers.dev/ingest/h1',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    const result=await r.json();if(!r.ok||result.ok!==true)throw Error('Falha de ingestão H1: HTTP '+r.status+' '+JSON.stringify(result));
    for(const record of page){if(key==='candles')checkpoint.candles[record.symbol]=Math.max(checkpoint.candles[record.symbol]||0,Date.parse(record.candleTime));else checkpoint.signals[record.id]=recordHash(record);}
    writeJson(checkpointFile,checkpoint);
  }
}
console.log(JSON.stringify({sentCandles:batch.candles.length,sentSignals:batch.signals.length}));
