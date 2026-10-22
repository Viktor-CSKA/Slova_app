// Собирает data/words.txt из nouns.csv (Badestrand/russian-dictionary, CC BY-SA 4.0).
// Использование: node tools/build-dict.mjs <nouns.csv> <words.txt>
// Порядок слов сохраняется (в источнике сначала идут частотные слова), это важно для подсказок и выбора базовых слов.
import { readFileSync, writeFileSync } from 'node:fs';

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error('node build-dict.mjs <nouns.csv> <words.txt>');
  process.exit(1);
}

const MIN_LEN = 3;
const MAX_LEN = 8;

const lines = readFileSync(source, 'utf8').split(/\r?\n/).slice(1);
// Имена и аббревиатуры, просочившиеся в источник строчными буквами (список пополняем по ходу игры).
const stop = new Set(
  readFileSync(new URL('stoplist.txt', import.meta.url), 'utf8').split(/\r?\n/).filter(Boolean),
);
const seen = new Set(stop);
const words = [];
for (const line of lines) {
  const bare = line.split('\t')[0]?.trim();
  if (!bare || !/^[а-яё]+$/.test(bare)) continue; // без дефисов, пробелов, латиницы и заглавных (имена, аббревиатуры)
  const word = bare.replaceAll('ё', 'е');
  if (word.length < MIN_LEN || word.length > MAX_LEN || seen.has(word)) continue;
  if (!/[аеиоуыэюя]/.test(word)) continue; // без гласных — аббревиатура
  seen.add(word);
  words.push(word);
}

writeFileSync(target, `${words.join('\n')}\n`, 'utf8');
console.log(`Слов: ${words.length} → ${target}`);
