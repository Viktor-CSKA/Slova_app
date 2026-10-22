import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  baseLengthFor,
  canForm,
  createLevelBook,
  goalFor,
  makeRng,
  normalize,
  shuffled,
  subWords,
} from '../js/logic.js';

const seedDict = [
  ...new Set(
    readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean),
  ),
];

test('normalize: регистр, ё и лишние символы', () => {
  assert.equal(normalize('ЁЖик!'), 'ежик');
  assert.equal(normalize(' Ко-т 1 '), 'кот');
  assert.equal(normalize(''), '');
});

test('canForm учитывает повторы букв', () => {
  assert.ok(canForm('канат', 'комната'));
  assert.ok(!canForm('каннат', 'комната')); // н только одна
  assert.ok(!canForm('кот', 'ком'));
  assert.ok(!canForm('', 'ком'));
});

test('subWords возвращает только слова из букв базы и не короче 3', () => {
  const words = subWords('комната', ['кот', 'ком', 'мак', 'мама', 'он', 'канат']);
  assert.deepEqual(words.sort(), ['канат', 'ком', 'кот', 'мак']);
});

test('makeRng и shuffled детерминированы и ничего не теряют', () => {
  const a = shuffled([1, 2, 3, 4, 5, 6], makeRng(7));
  const b = shuffled([1, 2, 3, 4, 5, 6], makeRng(7));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6]);
});

test('baseLengthFor растёт с уровнем', () => {
  assert.deepEqual([1, 5, 6, 15, 16, 40, 41].map(baseLengthFor), [5, 5, 6, 6, 7, 7, 8]);
});

test('goalFor: от 3 до 12 и не больше доступного', () => {
  assert.equal(goalFor(2), 2);
  assert.equal(goalFor(5), 3);
  assert.equal(goalFor(20), 10);
  assert.equal(goalFor(100), 12);
});

test('уровни из словаря: база частотная, цель достижима, уровни детерминированы', () => {
  const levelAt = createLevelBook(seedDict, { minSub: 8, baseLimit: 5000 });
  const common = new Set(seedDict.slice(0, 5000));
  const bases = new Set();
  for (let n = 1; n <= 80; n++) {
    const level = levelAt(n);
    assert.ok(level, `уровень ${n} должен существовать`);
    assert.equal(level.base.length, baseLengthFor(n), `уровень ${n}: длина базы`);
    assert.ok(common.has(level.base), `уровень ${n}: база не из частотных слов`);
    assert.ok(level.words.length >= level.goal, `уровень ${n}: слов меньше цели`);
    assert.ok(level.words.every((w) => canForm(w, level.base)));
    assert.deepEqual(levelAt(n).base, level.base, 'уровень детерминирован');
    assert.ok(!bases.has(level.base), `уровень ${n}: база повторяется`);
    bases.add(level.base);
  }
});

test('слова уровня идут в порядке частотности словаря', () => {
  const level = createLevelBook(seedDict, { minSub: 8, baseLimit: 5000 })(10);
  const positions = level.words.map((w) => seedDict.indexOf(w));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});
