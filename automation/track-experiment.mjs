export function trackExperiment(e,candles,ms,horizonMs=96*3600000,now=Date.now()){
  if(e.status==='CLOSED')return e;
  e.audit??={version:1,coverage:'COMPLETE',last:e.entryTime,observed:0,cells:Object.fromEntries([3,5,10,20,50].map(t=>[t,{outcome:'PENDING',target:t,stop:3}]))};
  const a=e.audit,end=e.entryTime+ms+horizonMs;
  for(const c of candles.filter(c=>c.t>a.last&&c.t<end)){
    if(c.t!==a.last+ms)a.coverage='PARTIAL';
    a.observed++;a.last=c.t;e.lastPrice=c.c;e.lastProcessedMs=c.t;
    const buy=(e.direction||e.side)==='BUY',fav=buy?(c.h/e.entry-1)*100:(1-c.l/e.entry)*100,adv=buy?(c.l/e.entry-1)*100:(1-c.h/e.entry)*100;
    e.mfe=Math.max(e.mfe||0,fav);e.mae=Math.min(e.mae||0,adv);e.targets??={};e.targetTimes??={};
    for(const t of [3,5,10,20,50])if(fav>=t&&!e.targets[t]){e.targets[t]=true;e.targetTimes[t]=new Date(c.t+ms).toISOString();}
    for(const cell of Object.values(a.cells)){
      if(cell.outcome!=='PENDING')continue;
      const opening=(buy?1:-1)*(c.o/e.entry-1)*100;
      if(opening<=-cell.stop)Object.assign(cell,{outcome:'STOP',time:c.t});
      else if(opening>=cell.target)Object.assign(cell,{outcome:'TARGET',time:c.t});
      else if(fav>=cell.target&&adv<=-cell.stop)Object.assign(cell,{outcome:'AMBIGUOUS',time:c.t+ms});
      else if(adv<=-cell.stop)Object.assign(cell,{outcome:'STOP',time:c.t+ms});
      else if(fav>=cell.target)Object.assign(cell,{outcome:'TARGET',time:c.t+ms});
    }
    e.fixedWindows??={};
    for(const hours of [1,4,24,168]){
      const boundary=e.entryTime+ms+hours*3600000;
      if(e.fixedWindows[hours]||c.t+ms<boundary)continue;
      const gross=(buy?1:-1)*(c.c/e.entry-1)*100;
      e.fixedWindows[hours]={time:c.t+ms,price:c.c,grossPct:gross,netPct:gross-.2,costPct:.2,valid:a.coverage==='COMPLETE'&&c.t+ms===boundary,mfe:e.mfe,mae:e.mae};
    }
  }
  if(now>=end){
    e.status='CLOSED';e.closedAt=new Date(now).toISOString();if(a.last+ms!==end)a.coverage='PARTIAL';
    for(const cell of Object.values(a.cells))if(cell.outcome==='PENDING')cell.outcome=a.coverage==='COMPLETE'?'TIMEOUT':'INCOMPLETE';
  }
  return e;
}
