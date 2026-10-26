import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DAILY_LEN, canForm, createDailyPicker, dailyGoalFor, hashString, normalize } from '../js/logic.js';
import {
  canShowInterstitial,
  dateKey,
  dayDiff,
  defaultSave,
  liveStreak,
  mergeSaves,
  nextStreak,
  normalizeSave,
} from '../js/progress.js';

const dict = [
  ...new Set(
    readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean),
  ),
];

test('ежедневный уровень один и тот же для одной даты и меняется по дням', () => {
  const a = createDailyPicker(dict, { baseLimit: 5000 });
  const b = createDailyPicker(dict, { baseLimit: 5000 });
  assert.deepEqual(a('2026-10-27'), b('2026-10-27'));
  const bases = new Set();
  for (let day = 1; day <= 14; day++) bases.add(a(`2026-11-${String(day).padStart(2, '0')}`).base);
  assert.ok(bases.size >= 10, `за 14 дней слишком много повторов: ${bases.size}`);
});

test('ежедневный уровень: длина слова, число слов и цель', () => {
  const pick = createDailyPicker(dict, { minSub: 15, baseLimit: 5000 });
  for (const key of ['2026-10-27', '2026-12-31', '2027-02-28']) {
    const level = pick(key);
    assert.equal(level.base.length, DAILY_LEN);
    assert.ok(level.words.length >= 15);
    assert.ok(level.words.every((w) => canForm(w, level.base)));
    assert.ok(level.goal >= 8 && level.goal <= 15 && level.goal <= level.words.length);
    assert.equal(level.daily, true);
    assert.equal(level.dateKey, key);
  }
});

test('ежедневный уровень: пустой словарь даёт null, цель считается по границам', () => {
  assert.equal(createDailyPicker([])('2026-10-27'), null);
  assert.equal(dailyGoalFor(15), 8);
  assert.equal(dailyGoalFor(100), 15);
  assert.equal(dailyGoalFor(5), 5);
});

test('hashString детерминирован и различает даты', () => {
  assert.equal(hashString('2026-10-27'), hashString('2026-10-27'));
  assert.notEqual(hashString('2026-10-27'), hashString('2026-10-28'));
});

test('dateKey и dayDiff работают через границы месяца и года', () => {
  assert.equal(dateKey(new Date(2026, 9, 5, 23, 59).getTime()), '2026-10-05');
  assert.equal(dayDiff('2026-10-31', '2026-11-01'), 1);
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayDiff('2026-03-28', '2026-03-30'), 2); // переход на летнее время не ломает счёт
  assert.equal(dayDiff('2026-10-27', '2026-10-27'), 0);
});

test('серия растёт по дням подряд и сбрасывается после пропуска', () => {
  let s = { count: 0, last: null };
  s = nextStreak(s, '2026-10-27');
  assert.deepEqual(s, { count: 1, last: '2026-10-27' });
  assert.deepEqual(nextStreak(s, '2026-10-27'), s); // повторное прохождение в тот же день не считается
  s = nextStreak(s, '2026-10-28');
  s = nextStreak(s, '2026-10-29');
  assert.deepEqual(s, { count: 3, last: '2026-10-29' });
  assert.deepEqual(nextStreak(s, '2026-10-31'), { count: 1, last: '2026-10-31' });
});

test('liveStreak: серия жива сегодня и на следующий день, потом гаснет', () => {
  const s = { count: 4, last: '2026-10-27' };
  assert.equal(liveStreak(s, '2026-10-27'), 4);
  assert.equal(liveStreak(s, '2026-10-28'), 4);
  assert.equal(liveStreak(s, '2026-10-29'), 0);
  assert.equal(liveStreak({ count: 0, last: null }, '2026-10-29'), 0);
});

test('normalizeSave чинит мусор и старые сохранения без новых полей', () => {
  assert.deepEqual(normalizeSave(null), defaultSave());
  assert.deepEqual(normalizeSave('x'), defaultSave());
  const old = normalizeSave({ level: 7, found: ['кот', 5], hints: 1 });
  assert.equal(old.level, 7);
  assert.deepEqual(old.found, ['кот']);
  assert.equal(old.hints, 1);
  assert.equal(old.daily, null);
  assert.deepEqual(old.streak, { count: 0, last: null });
  const bad = normalizeSave({ level: -3, hints: 'много', daily: { date: 'вчера' }, streak: { count: -1, last: '1' } });
  assert.equal(bad.level, 1);
  assert.equal(bad.hints, 3);
  assert.equal(bad.daily, null);
  assert.deepEqual(bad.streak, { count: 0, last: null });
});

test('mergeSaves: побеждает сохранение, где игрок дальше', () => {
  const local = { level: 5, found: ['кот'], hints: 2 };
  const cloud = { level: 9, found: [], hints: 1 };
  assert.equal(mergeSaves(local, cloud).level, 9);
  assert.equal(mergeSaves(cloud, local).level, 9);
  const sameLevel = mergeSaves({ level: 4, found: ['а'], hints: 0 }, { level: 4, found: ['кот', 'сок'], hints: 2 });
  assert.deepEqual(sameLevel.found, ['кот', 'сок']);
  assert.equal(sameLevel.hints, 2);
});

test('mergeSaves: серия и ежедневный уровень выбираются отдельно от уровня', () => {
  const local = {
    level: 12,
    streak: { count: 2, last: '2026-10-27' },
    daily: { date: '2026-10-27', found: ['кот'], done: false },
    seenHelp: true,
  };
  const cloud = {
    level: 3,
    streak: { count: 5, last: '2026-10-28' },
    daily: { date: '2026-10-27', found: ['кот', 'сок'], done: true },
  };
  const merged = mergeSaves(local, cloud);
  assert.equal(merged.level, 12);
  assert.deepEqual(merged.streak, { count: 5, last: '2026-10-28' });
  assert.equal(merged.daily.done, true);
  assert.equal(merged.seenHelp, true);
});

test('canShowInterstitial: не чаще одного ролика за интервал', () => {
  assert.equal(canShowInterstitial(1000, null, 90_000), true);
  assert.equal(canShowInterstitial(50_000, 1000, 90_000), false);
  assert.equal(canShowInterstitial(91_000, 1000, 90_000), true);
});

test('словарь: нет аббревиатур, имён и грубых слов из стоп-листа', () => {
  const stop = readFileSync(new URL('../tools/stoplist.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean);
  const set = new Set(dict);
  const leaked = stop.filter((w) => set.has(w));
  assert.deepEqual(leaked, []);
  for (const word of ['чурка', 'пво', 'нпо', 'ооо', 'нато', 'камаз', 'жопа', 'блядь']) {
    assert.ok(!set.has(word), word);
  }
});
