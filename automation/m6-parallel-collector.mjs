import fs from 'node:fs';
import {VERSION,newStore,compareReading,advancePair,commitPair} from '../m6-parallel-core.mjs';
const OUT='data/m6-parallel.json';
export function loadParallel(){
  if(!fs.existsSync(OUT))return newStore();
  const store=JSON.parse(fs.readFileSync(OUT,'utf8'));
  if(store.version!==VERSION)throw Error('Versão do histórico paralelo incompatível; histórico preservado');
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
}
export function saveParallel(store,errors,at){
  const byDay=new Map();
  for(const ep of store.episodes){const day=ep.createdAt.slice(0,10);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(ep);}
  fs.mkdirSync('data/m6-parallel-history',{recursive:true});
  for(const [day,list] of byDay){
    const file=`data/m6-parallel-history/${day}.json`;
    const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:VERSION,episodes:[]};
    const merged=new Map(old.episodes.map(e=>[e.id,e]));for(const ep of list)merged.set(ep.id,ep);
    // Unchanged archives are not rewritten each tick.
    if(merged.size!==old.episodes.length)fs.writeFileSync(file,JSON.stringify({version:VERSION,config:store.config,episodes:[...merged.values()]})+'\n');
  }
  store.episodes=store.episodes.sort((a,b)=>b.startTime-a.startTime).slice(0,100);
  store.generatedAt=at;store.errors=errors;
  const temp=OUT+'.tmp';fs.writeFileSync(temp,JSON.stringify(store)+'\n');fs.renameSync(temp,OUT);
}
