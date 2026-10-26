// Убирает слова из tools/stoplist.txt из готового data/words.txt, сохраняя порядок.
// Результат тот же, что у build-dict.mjs, но не нужен исходный nouns.csv.
// Использование: node tools/apply-stoplist.mjs [words.txt]
import { readFileSync, writeFileSync } from 'node:fs';

const target = process.argv[2] ?? new URL('../data/words.txt', import.meta.url);
const stop = new Set(
  readFileSync(new URL('stoplist.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean),
);
const words = readFileSync(target, 'utf8').split(/\r?\n/).filter(Boolean);
const kept = words.filter((w) => !stop.has(w));
writeFileSync(target, `${kept.join('\n')}\n`, 'utf8');
console.log(`Было ${words.length}, стало ${kept.length} (убрано ${words.length - kept.length})`);
