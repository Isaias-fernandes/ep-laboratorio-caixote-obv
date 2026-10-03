import {analyze,closedCandles,contiguous} from './lab-signal-engine.mjs';
export const INTERVALS={'5m':300000,'15m':900000,'1h':3600000};
export const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','BCHUSDT','TRXUSDT','UNIUSDT','AAVEUSDT','SUIUSDT','NEARUSDT','APTUSDT','ARBUSDT','OPUSDT','XLMUSDT','HBARUSDT','PEPEUSDT','ETCUSDT','ATOMUSDT','TIAUSDT','XTZUSDT','LDOUSDT','SEIUSDT','FILUSDT','INJUSDT','RUNEUSDT','ALGOUSDT','FETUSDT','GALAUSDT','SANDUSDT','MANAUSDT','CRVUSDT','DYDXUSDT','JUPUSDT','WIFUSDT','BONKUSDT','SHIBUSDT','TONUSDT','STXUSDT','IMXUSDT','RENDERUSDT','THETAUSDT','VETUSDT','ZECUSDT'];
export function reading(rows,interval,now=Date.now()){
  const ms=INTERVALS[interval];if(!ms)throw Error('Período inválido');
  const c=closedCandles(rows,ms,now).slice(-96);
  if(c.length<96||!contiguous(c,ms))throw Error('96 velas consecutivas fechadas são necessárias');
  const last=c.at(-1);if(now-last.t-ms>ms*2)throw Error('Dados de mercado desatualizados');
  const r=analyze(c),direction=r.pattern.direction;
  const stage=r.classification.startsWith('SINAL_')?'CONFIRMED':direction!=='NEUTRAL'&&r.score>=65?'PRE_SIGNAL':'NO_SIGNAL';
  return {candleTime:last.t,closedAt:last.t+ms,price:last.c,direction,stage,score:r.score,pattern:r.pattern.name,patternConfirmed:r.pattern.confirmed,
    indicators:{rsi:r.rsi,cci:r.cci,macdHistogram:r.macd.histogram,volumeRatio:r.volumeRatio,obv:r.obv.trend,momentumAligned:r.momentumAligned,ignition:r.ignition}};
}
export function eventId(symbol,interval,candleTime,direction){return `lab-v1|${symbol}|${interval}|${candleTime}|${direction}`}
// Signals are closed-candle observations; reconstructed intervals are explicitly marked.
export function advance(events,symbol,interval,x,candle,detectedAt){
  if(events.some(e=>e.data.lastProcessedCandleTime>=x.candleTime))return [];
  const ms=INTERVALS[interval],changed=[],directional=x.direction!=='NEUTRAL';
  for(const original of events){
    const e=structuredClone(original),d=e.data;
    if(d.lastProcessedCandleTime>=x.candleTime)continue;
    if(d.confirmedAt&&d.observedCandles<96&&x.candleTime>d.entryCandleTime){
      const sign=e.direction==='BUY'?1:-1,entry=d.entry;
      const fav=sign===1?(candle.h/entry-1)*100:(1-candle.l/entry)*100;
      const adv=sign===1?(candle.l/entry-1)*100:(1-candle.h/entry)*100;
      d.mfe=Math.max(d.mfe||0,fav);d.mae=Math.min(d.mae||0,adv);d.observedCandles++;
      if(x.candleTime-d.lastProcessedCandleTime>ms)d.coverage='PARTIAL';
      if(d.observedCandles===96){d.trackingStatus='COMPLETED';d.completedAt=new Date(x.closedAt).toISOString();if(e.status==='CONFIRMED')e.status='COMPLETED';}
    }
    if(['PRE_SIGNAL','CONFIRMED'].includes(e.status)){
      if(!directional||x.direction!==e.direction||x.stage==='NO_SIGNAL'||(e.status==='CONFIRMED'&&x.stage!=='CONFIRMED')){
        e.status='INVALIDATED';d.invalidatedAt=new Date(x.closedAt).toISOString();d.reason='Condições de validação deixaram de existir na vela fechada';
      }else if(e.status==='PRE_SIGNAL'&&x.stage==='CONFIRMED'){
        e.status='CONFIRMED';d.confirmedAt=new Date(x.closedAt).toISOString();d.entry=x.price;d.entryCandleTime=x.candleTime;d.trackingStatus='COLLECTING';d.confirmationScore=x.score;
      }
    }
    d.lastProcessedCandleTime=x.candleTime;d.lastPrice=x.price;e.updated_at=detectedAt;changed.push(e);
  }
  const active=changed.find(e=>['PRE_SIGNAL','CONFIRMED'].includes(e.status)&&e.direction===x.direction);
  if(!active&&x.stage!=='NO_SIGNAL'){
    const confirmed=x.stage==='CONFIRMED';
    changed.push({id:eventId(symbol,interval,x.candleTime,x.direction),symbol,interval,direction:x.direction,status:x.stage,score:x.score,candle_time:new Date(x.candleTime).toISOString(),created_at:detectedAt,updated_at:detectedAt,
      data:{version:'lab-live-v1',pattern:x.pattern,indicators:x.indicators,detectedAt,retroactive:Date.parse(detectedAt)-x.closedAt>ms*2,
        signalClosedAt:new Date(x.closedAt).toISOString(),confirmedAt:confirmed?new Date(x.closedAt).toISOString():null,entry:confirmed?x.price:null,entryCandleTime:confirmed?x.candleTime:null,
        lastPrice:x.price,lastProcessedCandleTime:x.candleTime,observedCandles:0,trackingStatus:confirmed?'COLLECTING':'WAITING',mfe:0,mae:0,coverage:'COMPLETE'}});
  }
  return changed;
}
