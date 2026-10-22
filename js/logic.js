// Чистая логика игры «Слова из слова»: без DOM и SDK, проверяется тестами в Node.

export const MIN_WORD_LEN = 3;

/** Нижний регистр, ё → е, только буквы а-я. */
export function normalize(text) {
  return String(text).toLowerCase().replaceAll('ё', 'е').replace(/[^а-я]/g, '');
}

function counts(word) {
  const map = new Map();
  for (const ch of word) map.set(ch, (map.get(ch) ?? 0) + 1);
  return map;
}

/** Можно ли составить `word` из букв `base` (каждую букву не чаще, чем в base). */
export function canForm(word, base) {
  if (word.length === 0 || word.length > base.length) return false;
  const have = counts(base);
  for (const ch of word) {
    const left = have.get(ch) ?? 0;
    if (left === 0) return false;
    have.set(ch, left - 1);
  }
  return true;
}

/** Все слова словаря (не короче minLen), которые собираются из букв base. */
export function subWords(base, dict, minLen = MIN_WORD_LEN) {
  const result = [];
  for (const word of dict) {
    if (word.length >= minLen && canForm(word, base)) result.push(word);
  }
  return result;
}

/** Детерминированный генератор (mulberry32): одни и те же уровни у всех игроков. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Длина базового слова по номеру уровня (уровни начинаются с 1). */
export function baseLengthFor(level) {
  if (level <= 5) return 5;
  if (level <= 15) return 6;
  if (level <= 40) return 7;
  return 8;
}

/** Сколько слов нужно найти: половина доступных, но от 3 до 12. */
export function goalFor(total) {
  return Math.min(total, Math.max(3, Math.min(12, Math.round(total / 2))));
}

/**
 * Генератор уровней по словарю. Базовые слова берутся в фиксированном
 * перемешанном порядке; слова с малым числом подслов пропускаются.
 */
export function createLevelBook(dict, { minSub = 8, baseLimit = Infinity } = {}) {
  const wordList = [...new Set(dict)];
  // Базовыми словами берём только первые baseLimit (самые частотные) слова словаря.
  const baseCandidates = wordList.slice(0, baseLimit);
  const cache = new Map(); // длина → { eligible: [], cursor, order }

  function bucket(len) {
    if (!cache.has(len)) {
      const order = shuffled(
        baseCandidates.filter((w) => w.length === len),
        makeRng(1000 + len),
      );
      cache.set(len, { eligible: [], cursor: 0, order });
    }
    return cache.get(len);
  }

  function nthEligible(len, n) {
    const b = bucket(len);
    while (b.eligible.length <= n && b.cursor < b.order.length) {
      const base = b.order[b.cursor++];
      const found = subWords(base, wordList);
      if (found.length >= minSub) b.eligible.push({ base, words: found });
    }
    return b.eligible.length === 0 ? null : b.eligible[n % b.eligible.length];
  }

  /** Возвращает { level, base, words, goal } или null, если словарь не подходит. */
  return function levelAt(level) {
    let len = baseLengthFor(level);
    const firstOfBucket = { 5: 1, 6: 6, 7: 16, 8: 41 }[len];
    let picked = nthEligible(len, level - firstOfBucket);
    // В маленьком словаре нужной длины может не быть: берём ближайшую.
    for (let d = 1; picked === null && d <= 4; d++) {
      picked = nthEligible(len + d, level) ?? nthEligible(len - d, level);
    }
    if (picked === null) return null;
    return {
      level,
      base: picked.base,
      words: picked.words,
      goal: goalFor(picked.words.length),
    };
  };
}
