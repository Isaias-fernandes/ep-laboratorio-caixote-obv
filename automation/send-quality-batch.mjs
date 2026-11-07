import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readJson,writeJson} from './json-store.mjs';
const token=process.env.EP_SIGNAL_INGEST_TOKEN;if(!token)throw Error('EP_SIGNAL_INGEST_TOKEN ausente');
const endpoint=process.env.EP_API_URL||'https://ep-whale-api.isaiasf59.workers.dev';
const ledgerFile='data/quality/ingest-checkpoint.json',ledger=readJson(ledgerFile,{births:{},evaluations:{}});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const files=dir=>fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).flatMap(f=>readJson(`${dir}/${f}`,{records:[]}).records):[];
const births=files('data/quality/births'),state=readJson('data/quality/state.json',{active:{}});
const evaluations=[...files('data/quality/outcomes'),...Object.values(state.active)];
const changedBirths=births.filter(b=>ledger.births[b.id]!==b.birthHash),changedEvaluations=evaluations.filter(e=>ledger.evaluations[e.id]!==hash(e));
// Births are acknowledged before their evaluations. Checkpoints advance only after an explicit successful response.
for(const [key,records] of [['births',changedBirths],['evaluations',changedEvaluations]]){
  for(let i=0;i<records.length;){
    const page=[];while(i<records.length&&page.length<200){const candidate=records[i];const proposed={source:'ep-quality-v1',births:key==='births'?[...page,candidate]:[],evaluations:key==='evaluations'?[...page,candidate]:[]};if(Buffer.byteLength(JSON.stringify(proposed))>850000){if(!page.length)throw Error('Registro maior que limite de ingestão');break;}page.push(candidate);i++;}
    const body={source:'ep-quality-v1',births:key==='births'?page:[],evaluations:key==='evaluations'?page:[]};
    const r=await fetch(endpoint+'/ingest/quality',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    const result=await r.json();if(!r.ok||result.ok!==true)throw Error('Falha de ingestão qualidade: HTTP '+r.status+' '+JSON.stringify(result));
    for(const record of page)ledger[key][record.id]=key==='births'?record.birthHash:hash(record);
    writeJson(ledgerFile,ledger);
  }
}
if(state.health){const r=await fetch(endpoint+'/ingest/quality',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({source:'ep-quality-v1',births:[],evaluations:[],health:state.health}),signal:AbortSignal.timeout(60000)});const result=await r.json();if(!r.ok||result.ok!==true)throw Error('Falha ao gravar saúde da qualidade');}
console.log(JSON.stringify({sentBirths:changedBirths.length,sentEvaluations:changedEvaluations.length}));
