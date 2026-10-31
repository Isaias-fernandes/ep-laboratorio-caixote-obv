import fs from 'node:fs';
import {VERSION,newStore,compareReading,advancePair,commitPair} from '../m6-parallel-core.mjs';
import {updateLong} from '../m6-long-tracking.mjs';
const OUT='data/m6-parallel.json';
export function loadParallel(){
  if(!fs.existsSync(OUT))return newStore();
  const store=JSON.parse(fs.readFileSync(OUT,'utf8'));
  if(store.version!==VERSION)throw Error('Versão do histórico paralelo incompatível; histórico preservado');
  // Recover retained episode identities from permanent archives during migration.
  store.longTracking??={};
  if(fs.existsSync('data/m6-parallel-history'))for(const file of fs.readdirSync('data/m6-parallel-history')){
    if(!file.endsWith('.json'))continue;
    const archive=JSON.parse(fs.readFileSync('data/m6-parallel-history/'+file,'utf8'));
    for(const ep of archive.episodes||[])if(!store.episodes.some(e=>e.id===ep.id))store.episodes.push(ep);
  }
  return store;
}
export function collectParallel(store,symbol,interval,rows,ms,detectedAt){
  const key=symbol+'|'+interval,previous=store.state[key];
  const checkpoint=previous?.lastCandleTime;
  if(checkpoint!=null&&rows.at(-1).t<=checkpoint)return;
  if(checkpoint!=null&&rows[95]?.t>checkpoint+ms)throw Error('Lacuna do paralelo excede candles disponíveis; checkpoint preservado');
  const first=checkpoint==null?rows.length-1:Math.max(95,rows.findIndex(c=>c.t>checkpoint));
  let pair=previous;const completed=[];
  for(let i=first;i<rows.length;i++){
    const reading=compareReading(rows.slice(i-95,i+1),ms,rows[i].t+ms);
    const next=advancePair(pair,symbol,interval,reading,rows[i],ms,detectedAt);
    pair=next.pair;if(next.completed)completed.push(next.completed);
  }
  // Commit only after every recovered candle passes validation.
  commitPair(store,key,pair,completed);
  updateLong(store,symbol,interval,rows,ms);
}
export function saveParallel(store,errors,at){
  // Persist observations with each permanent episode, even after trade completion.
  for(const ep of store.episodes)ep.longTracking=Object.values(store.longTracking||{}).filter(t=>t.episodeId===ep.id);
  const byDay=new Map();
  for(const ep of store.episodes){const day=ep.createdAt.slice(0,10);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(ep);}
  fs.mkdirSync('data/m6-parallel-history',{recursive:true});
  for(const [day,list] of byDay){
    const file=`data/m6-parallel-history/${day}.json`;
    const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:VERSION,episodes:[]};
    const merged=new Map(old.episodes.map(e=>[e.id,e]));for(const ep of list)merged.set(ep.id,ep);
    // Unchanged archives are not rewritten each tick.
    const next=JSON.stringify({version:VERSION,config:store.config,episodes:[...merged.values()]})+'\n';
    if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==next)fs.writeFileSync(file,next);
  }
  store.episodes=store.episodes.sort((a,b)=>b.startTime-a.startTime).slice(0,100);
  const cutoff=Date.parse(at)-10*86400000;
  for(const [id,t] of Object.entries(store.longTracking||{}))if(t.status==='COMPLETED'&&t.entryTime<cutoff)delete store.longTracking[id];
  store.generatedAt=at;store.errors=errors;
  const temp=OUT+'.tmp';fs.writeFileSync(temp,JSON.stringify(store)+'\n');fs.renameSync(temp,OUT);
}

