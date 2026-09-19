import fs from 'node:fs';
import path from 'node:path';

/*
  SNAPSHOT DIARIO DOS DADOS EXPERIMENTAIS
  - Somente backup: nao calcula nem altera sinais.
  - Preserva H1 96/80 e Modelos A/B em arquivos datados.
  - Mantem 90 dias para cobrir os marcos 7/14/21/30 e validacao posterior.
*/
const DAY = new Date().toISOString().slice(0,10);
const DIR = path.resolve('data/daily-snapshots');
const SOURCES = [
  ['h1-history', path.resolve('data/h1-history.json')],
  ['modelos-ab-auto', path.resolve('data/modelos-ab-auto.json')]
];
fs.mkdirSync(DIR,{recursive:true});
for (const [name,src] of SOURCES) {
  if (!fs.existsSync(src)) { console.warn('ausente:',src); continue; }
  const dst=path.join(DIR,`${DAY}-${name}.json`);
  if (!fs.existsSync(dst)) {
    fs.copyFileSync(src,dst);
    console.log('snapshot criado:',dst);
  } else console.log('snapshot diario ja existe:',dst);
}
const cutoff=Date.now()-90*86400000;
for (const f of fs.readdirSync(DIR)) {
  const m=f.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (m && Date.parse(m[1]+'T00:00:00Z') < cutoff) fs.unlinkSync(path.join(DIR,f));
}
