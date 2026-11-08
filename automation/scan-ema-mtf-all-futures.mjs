import {SYMBOLS} from '../lab-live-core.mjs';
import {classify,VERSION} from '../ema-mtf-core.mjs';
import {readJson,writeJson} from './json-store.mjs';
import {fetchClosedCandles} from './market-candles.mjs';
import {archiveEvents,loadActive,compactFeed} from './experiment-storage.mjs';
import {recoverCandles} from './recover-candles.mjs';
import {trackExperiment} from './track-experiment.mjs';
const OUT='data/ema-mtf-auto.json',now=Date.now(),at=new Date(now).toISOString(),prev=readJson(OUT,{events:[],latest:[]});
const previous=new Map(prev.latest.map(r=>[r.symbol,r])),quality=readJson('data/quality/state.json',{pairs:{}});
let events=loadActive('ema-mtf',prev.events||[],now,96*3600000);
// Freeze the legacy cohort; its former rules and partial candles must not mix with v3 outcomes.
for(const e of events)if(e.ruleVersion!==VERSION&&e.status!=='CLOSED'){e.status='CLOSED';e.closedReason='LEGACY_VERSION_ARCHIVED';}
const latest=[],errors=[];let requests=0,reused=0,cursor=0,analyzed=0;
async function get(symbol,tf,ms){
  if(tf==='1h'){const cached=quality.pairs[symbol]?.cache||[];if(cached.length>=260&&cached.at(-1).t===Math.floor(now/ms)*ms-ms){reused++;return cached.slice(-260);}}
  requests++;return fetchClosedCandles(symbol,tf,260,now,ms);
}
async function worker(){while(cursor<SYMBOLS.length){const symbol=SYMBOLS[cursor++];try{
  const [c5,c15,c60]=await Promise.all([get(symbol,'5m',300000),get(symbol,'15m',900000),get(symbol,'1h',3600000)]);
  const r=classify(c5,c15,c60,now),last=c5.at(-1),before=previous.get(symbol);
  const row={symbol,updatedAt:at,ruleVersion:VERSION,price:last.c,configA:r.configA,configB:r.configB,h1:r.h1,m15:r.m15,m5:r.m5,marketDataMode:'SPOT',source:'BINANCE_CLOSED'};latest.push(row);analyzed++;
  const open=events.filter(e=>e.symbol===symbol&&e.ruleVersion===VERSION&&e.status!=='CLOSED');
  const checkpoint=open.length?Math.min(...open.map(e=>e.audit?.last??e.entryTime)):null;
  let follow=c5;
  if(checkpoint!=null&&c5[0].t>checkpoint+300000){
    try{follow=await recoverCandles(symbol,'5m',300000,checkpoint,now);}
    catch(error){for(const e of open){e.auditGap=true;if(String(error).includes('RECOVERY_BUDGET')){e.status='CLOSED';e.closedReason='RECOVERY_BUDGET_EXCEEDED';}}errors.push({symbol,stage:'tracking',error:String(error)});follow=[];}
  }
  for(const e of open)trackExperiment(e,follow,300000,96*3600000,now);
  for(const config of ['A','B']){const label=row['config'+config],direction=label==='COMPRA'?'BUY':label==='VENDA'?'SELL':null;
    if(!direction||(before?.ruleVersion===VERSION&&before['config'+config]===label))continue;
    const id=`${VERSION}|${symbol}|${config}|${last.t}|${direction}`;if(events.some(e=>e.id===id))continue;
    events.push({id,symbol,config,label,direction,ruleVersion:VERSION,entry:last.c,entryTime:last.t,confirmedAt:new Date(last.t+300000).toISOString(),createdAt:at,status:'OPEN',mfe:0,mae:0,lastPrice:last.c,targets:{},marketDataMode:'SPOT',source:'BINANCE_CLOSED',context:{h1:r.h1,m15:r.m15,m5:r.m5},entryReference:'SIGNAL_CLOSE_SIMULATION'});
  }
}catch(e){errors.push({symbol,error:String(e)});const old=previous.get(symbol);if(old)latest.push({...old,stale:true,error:String(e)});}}}
await Promise.all(Array.from({length:3},worker));
archiveEvents('ema-mtf',events);
writeJson(OUT,{schemaVersion:3,ruleVersion:VERSION,updatedAt:at,source:'BINANCE_SPOT_CLOSED',marketDataMode:'SPOT',intervals:['5m','15m','1h'],
 universe:{contracts:SYMBOLS.length,analyzed,errors:errors.length},rules:{configA:'H1 EMA50/200 → M15 EMA9/21 → M5 reteste',configB:'Mesma regra da tela: gatilho + pelo menos 3/4 confirmações; RSI limitado',closedCandlesOnly:true},
 collection:{requests,reusedH1:reused,archive:'data/experiment-history/ema-mtf/',note:'Somente 50 ativos do laboratório; legado fora do universo preservado no arquivo.'},latest,events:compactFeed(events),errors});
console.log(JSON.stringify({version:VERSION,assets:latest.length,requests,reusedH1:reused,errors}));if(analyzed===0)process.exitCode=1;
