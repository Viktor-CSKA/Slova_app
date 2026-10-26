// Чистая логика сохранений и серий дней: без DOM и SDK, проверяется тестами в Node.

export const defaultSave = () => ({
  level: 1,
  found: [],
  hints: 3,
  daily: null, // { date: '2026-10-27', found: [...], done: false }
  streak: { count: 0, last: null }, // last — ключ даты последнего пройденного ежедневного уровня
  seenHelp: false,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const words = (list) => (Array.isArray(list) ? list.filter((w) => typeof w === 'string') : []);

/** Приводит что угодно (старое сохранение, мусор, null) к актуальному виду. */
export function normalizeSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const daily =
    raw.daily && DATE_RE.test(raw.daily.date ?? '')
      ? { date: raw.daily.date, found: words(raw.daily.found), done: raw.daily.done === true }
      : null;
  const streakOk =
    raw.streak && Number.isInteger(raw.streak.count) && raw.streak.count >= 0 && DATE_RE.test(raw.streak.last ?? '');
  return {
    level: Number.isInteger(raw.level) && raw.level >= 1 ? raw.level : base.level,
    found: words(raw.found),
    hints: Number.isInteger(raw.hints) && raw.hints >= 0 ? raw.hints : base.hints,
    daily,
    streak: streakOk ? { count: raw.streak.count, last: raw.streak.last } : base.streak,
    seenHelp: raw.seenHelp === true,
  };
}

/**
 * Объединяет локальное и облачное сохранения. Побеждает то, где игрок дальше
 * (выше уровень, при равенстве больше найденных слов); серия и ежедневный уровень
 * выбираются отдельно, чтобы не потерять ни то, ни другое.
 */
export function mergeSaves(a, b) {
  const x = normalizeSave(a);
  const y = normalizeSave(b);
  const xAhead = x.level !== y.level ? x.level > y.level : x.found.length >= y.found.length;
  const lead = xAhead ? x : y;
  const other = xAhead ? y : x;
  return {
    level: lead.level,
    found: lead.found,
    hints: Math.max(lead.hints, lead.level === other.level ? other.hints : 0),
    daily: pickDaily(x.daily, y.daily),
    streak: pickStreak(x.streak, y.streak),
    seenHelp: x.seenHelp || y.seenHelp,
  };
}

function pickDaily(a, b) {
  if (!a || !b) return a ?? b;
  if (a.date !== b.date) return a.date > b.date ? a : b;
  if (a.done !== b.done) return a.done ? a : b;
  return a.found.length >= b.found.length ? a : b;
}

function pickStreak(a, b) {
  if (!a.last || !b.last) return a.last ? a : b;
  if (a.last !== b.last) return a.last > b.last ? a : b;
  return a.count >= b.count ? a : b;
}

/** Ключ даты по местному времени: «2026-10-27». */
export function dateKey(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Сколько календарных дней от a до b (ключи дат); ровно по UTC-полуночи, без сдвигов часовых поясов. */
export function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Серия после прохождения ежедневного уровня в день `today`. */
export function nextStreak(streak, today) {
  if (streak.last === today) return streak;
  if (streak.last && dayDiff(streak.last, today) === 1) return { count: streak.count + 1, last: today };
  return { count: 1, last: today };
}

/** Серия, которую показываем игроку: жива, если последний день — сегодня или вчера. */
export function liveStreak(streak, today) {
  if (!streak.last) return 0;
  const gap = dayDiff(streak.last, today);
  return gap === 0 || gap === 1 ? streak.count : 0;
}

/** Не чаще одного полноэкранного ролика за gapMs: защита от накрутки показов. */
export function canShowInterstitial(now, lastShownAt, gapMs) {
  return lastShownAt === null || now - lastShownAt >= gapMs;
}
