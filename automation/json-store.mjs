import fs from 'node:fs';
import path from 'node:path';
// Recover the known legacy suffix only. Never silently replace corrupt history with an empty archive.
export function parseJson(text){
  try{return JSON.parse(text)}catch(original){
    const repaired=text.trimEnd().replace(/(?:\\n)+$/,'');
    if(repaired===text.trimEnd())throw original;
    return JSON.parse(repaired);
  }
}
export function readJson(file,fallback){
  try{return parseJson(fs.readFileSync(file,'utf8'))}
  catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw Error(`Histórico inválido preservado: ${file}: ${e.message}`)}
}
export function writeJson(file,data){
  const next=JSON.stringify(data)+'\n';
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===next)return;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',next);fs.renameSync(file+'.tmp',file);
}
export function repairDirectory(dir){
  if(!fs.existsSync(dir))return 0;let count=0;
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){
    const p=path.join(dir,file),text=fs.readFileSync(p,'utf8');
    try{JSON.parse(text)}catch{writeJson(p,parseJson(text));count++;}
  }return count;
}
