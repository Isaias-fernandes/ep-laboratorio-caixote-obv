export const CONFIG = Object.freeze({
  version: 'ep-quality-v1', mode: 'SHADOW', intervalMs: 3_600_000,
  warmup: 96, minimumWindow: 720, horizon: 720, cooldown: 24,
  volumeMinimum: 1.2, aggressionMinimum: 0.55, breakoutAtr: 0.15,
  minimumDistancePct: 0.5, confirmationHours: 6, confirmationExtensionPct: 3,
  targets: [3, 5, 10, 20, 50],
  experiments: ['BASE', 'BOLLINGER', 'NO_PRELEG_24H'],
  objectives: [{name:'96h_stop3', bars:96, stop:3},
    {name:'30d_stop3', bars:720, stop:3}, {name:'30d_stop10', bars:720, stop:10}],
  fees: {binanceReference: {buyPct:0.1, sellPct:0.1, slippagePct:0, spreadPct:0},
    nubank:null, itau:null},
  baseline: 'One seeded UTC hour per symbol/day, selected without future prices',
});
export type Candle = {t:number;o:number;h:number;l:number;c:number;v:number;q?:number;tq?:number};
export type Json = Record<string, any>;
