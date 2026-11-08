import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readJson,writeJson} from './json-store.mjs';
export function archiveEvents(kind,events,dir='data/experiment-history'){
  if(!/^[a-z0-9-]+$/.test(kind))throw Error('Arquivo experimental inválido');
  const grouped=new Map();for(const e of events){if(typeof e.id!=='string')throw Error('Evento sem identidade');const t=e.createdAt??new Date(e.entryTime).toISOString();const day=t.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Data de evento inválida');if(!grouped.has(day))grouped.set(day,[]);grouped.get(day).push(e);}
  for(const [day,rows] of grouped){const file=`${dir}/${kind}/${day}.json`,previous=readJson(file,{records:[]}),map=new Map(previous.records.map(e=>[e.id,e]));for(const e of rows){
    const fields=['id','symbol','market','model','config','side','direction','score','entry','entryTime','createdAt','ruleVersion'];
    const birth=Object.fromEntries(fields.map(k=>[k,e[k]??null]));
    const birthHash=createHash('sha256').update(JSON.stringify(birth)).digest('hex');
    const prior=map.get(e.id);if(prior){const old=Object.fromEntries(fields.map(k=>[k,prior[k]??null]));if(JSON.stringify(old)!==JSON.stringify(birth))throw Error('Nascimento experimental imutável em conflito: '+e.id);}
    map.set(e.id,{...e,birthHash});
  }writeJson(file,{version:1,kind,records:[...map.values()]});}
}
export function loadActive(kind,feed,now=Date.now(),maxAge=7*86400000){
  const all=new Map(feed.map(e=>[e.id,e])),dir=`data/experiment-history/${kind}`;
  if(fs.existsSync(dir))for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&Date.parse(f.slice(0,10)+'T00:00:00Z')>=now-maxAge-86400000)){
    for(const e of readJson(`${dir}/${file}`,{records:[]}).records)if(!all.has(e.id)&&e.status!=='CLOSED'&&Date.parse(e.createdAt)>=now-maxAge)all.set(e.id,e);
  }
  return [...all.values()];
}
export function compactFeed(events,closedLimit=300){
  const ordered=[...events].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  return [...ordered.filter(e=>e.status!=='CLOSED'),...ordered.filter(e=>e.status==='CLOSED').slice(0,closedLimit)];
}
