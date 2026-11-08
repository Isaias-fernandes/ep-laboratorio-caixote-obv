import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readJson,writeJson} from './json-store.mjs';
import {archiveEvents} from './experiment-storage.mjs';
// Incremental archives preserve records. Daily manifests replace repeated full-file copies.
// Existing daily snapshots are retained; this script never deletes historical backups.
const day=new Date().toISOString().slice(0,10),manifest={version:2,day,createdAt:new Date().toISOString(),files:[],archives:['data/experiment-history/','data/live-history/','data/quality/births/','data/quality/outcomes/']};
for(const [kind,file,key] of [['h1','data/h1-history.json','records'],['models-ab','data/modelos-ab-auto.json','events']]){
  if(!fs.existsSync(file))continue;
  const raw=fs.readFileSync(file),data=readJson(file,{}),records=data[key]||[];
  if(kind==='h1')archiveEvents(kind,records); // A/B has its own sole archive writer.
  manifest.files.push({path:file,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),records:records.length,archive:`data/experiment-history/${kind}/`});
}
const output=`data/daily-manifests/${day}.json`;
if(!fs.existsSync(output))writeJson(output,manifest);
console.log(JSON.stringify({manifest:output,files:manifest.files.map(x=>({path:x.path,records:x.records,bytes:x.bytes})),previousSnapshotsPreserved:true}));
