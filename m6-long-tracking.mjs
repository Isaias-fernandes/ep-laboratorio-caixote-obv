// Price observation is independent of the frozen 96-candle trade result.
export const LONG_CONFIG=Object.freeze({days:10,checkpointsHours:[1,6,12,24,48,72,120,168,240],targetsPct:[2,5,10,20]});
const HOUR=3600000,END=240*HOUR;
export function updateLong(store,symbol,interval,rows,ms){
  store.longConfig=LONG_CONFIG;store.longTracking??={};
  const episodes=[...store.episodes,...Object.values(store.state).map(p=>p.episode).filter(Boolean)];
  for(const ep of episodes){
    if(ep.symbol!==symbol||ep.interval!==interval)continue;
    for(const name of ['baseline','candidate']){
      const arm=ep[name];if(arm?.entryTime==null||!Number.isFinite(arm.entry)||arm.entry<=0)continue;
      const id=ep.id+'|'+name;
      if(rows.at(-1)?.t+ms>arm.entryTime+END&&!store.longTracking[id])continue;
      store.longTracking[id]??={id,episodeId:ep.id,symbol,interval,model:name,entry:arm.entry,entryTime:arm.entryTime,
        status:'COLLECTING',coverage:'COMPLETE',lastCloseTime:arm.entryTime,mfe:0,mae:0,returnPct:null,checkpoints:{},targets:{}};
    }
  }
  for(const track of Object.values(store.longTracking)){
    if(track.symbol!==symbol||track.interval!==interval||track.status==='COMPLETED')continue;
    const end=track.entryTime+END;
    for(const c of rows){
      const close=c.t+ms;if(close<=track.lastCloseTime||c.t<track.entryTime||close>end)continue;
      if(c.t!==track.lastCloseTime)track.coverage='PARTIAL';
      track.mfe=Math.max(track.mfe,(c.h/track.entry-1)*100);
      track.mae=Math.min(track.mae,(c.l/track.entry-1)*100);
      track.returnPct=(c.c/track.entry-1)*100;track.lastCloseTime=close;
      for(const pct of LONG_CONFIG.targetsPct)if(!track.targets[pct]&&c.h>=track.entry*(1+pct/100))
        track.targets[pct]={hours:(close-track.entryTime)/HOUR,withinCandle:true,maeThroughHitCandle:track.mae,coverage:track.coverage};
      for(const hours of LONG_CONFIG.checkpointsHours){
        const due=track.entryTime+hours*HOUR;
        if(!track.checkpoints[hours]&&close>=due)track.checkpoints[hours]=close===due?
          {returnPct:track.returnPct,mfe:track.mfe,mae:track.mae,coverage:track.coverage}:
          {returnPct:null,mfe:null,mae:null,coverage:'MISSING'};
      }
      if(close===end){track.status='COMPLETED';break;}
    }
    if(rows.at(-1)?.t+ms>end&&track.lastCloseTime<end){track.status='COMPLETED';track.coverage='PARTIAL';}
  }
}
