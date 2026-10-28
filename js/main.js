import { MIN_WORD_LEN, createDailyPicker, createLevelBook, normalize, shuffled } from './logic.js';
import { canShowInterstitial, dateKey, liveStreak, mergeSaves, nextStreak } from './progress.js';
import { setSoundEnabled, sfx } from './audio.js';
import { loadPrefs, resolveTheme, savePrefs } from './prefs.js';
import * as sdk from './sdk.js';
import { loadSave, writeSave } from './storage.js';

const $ = (id) => document.getElementById(id);
const ui = {
  level: $('levelLabel'),
  progress: $('progressLabel'),
  barFill: $('barFill'),
  found: $('found'),
  current: $('current'),
  toast: $('toast'),
  wheel: $('wheel'),
  trail: $('trail'),
  hintBtn: $('hintBtn'),
  hintSub: $('hintSub'),
  modal: $('modal'),
  modalTitle: $('modalTitle'),
  modalText: $('modalText'),
  nextBtn: $('nextBtn'),
  dailyBtn: $('dailyBtn'),
  helpBtn: $('helpBtn'),
  soundBtn: $('soundBtn'),
  themeBtn: $('themeBtn'),
  help: $('help'),
  loading: $('loading'),
  loadingText: $('loadingText'),
};

const WHEEL_RADIUS = 34; // % от размера круга
const HIT_RADIUS = 9; // % — радиус попадания по букве

const AD_GAP_MS = 90_000; // не чаще одного полноэкранного ролика за 90 с
const HINT_NUDGE_MS = 20_000; // через сколько без находок подсказка начинает мигать
const DAILY_REWARD_HINTS = 2;
const CLOUD_DELAY_MS = 4000;

const game = {
  mode: 'level', // 'level' или 'daily'
  levelAt: null,
  dailyAt: null,
  save: null, // полное сохранение (уровень, ежедневный, серия)
  data: null, // { level, base, words, goal }
  wordSet: new Set(),
  letters: [],
  points: [],
  selected: [],
  found: new Set(),
  hints: 3,
  busy: false, // идёт реклама или окно уровня
  paused: false, // пауза от SDK
};

let dragging = false;
let dragMoved = false;
let toastTimer = 0;
let lastAdded = null;
let lastInterstitialAt = null;
let hintTimer = 0;
let cloudTimer = 0;

// ---------- сохранение ----------

function today() {
  return dateKey(sdk.now());
}

function persist() {
  const save = game.save;
  if (game.mode === 'daily') {
    save.daily = { date: game.data.dateKey, found: [...game.found], done: save.daily?.done === true };
  } else {
    save.level = game.data.level;
    save.found = [...game.found];
  }
  save.hints = game.hints;
  commitSave();
}

/** Сразу в localStorage, в облако с задержкой (у setData есть лимит частоты). */
function commitSave() {
  writeSave(game.save);
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => sdk.writeCloudSave(game.save), CLOUD_DELAY_MS);
}

function flushSave() {
  if (!game.save) return;
  writeSave(game.save);
  clearTimeout(cloudTimer);
  sdk.writeCloudSave(game.save, true);
}

// ---------- уровень ----------

function startLevel(number, restored = []) {
  game.mode = 'level';
  startRound(game.levelAt(number), restored);
}

function startDaily() {
  const key = today();
  const data = game.dailyAt(key);
  const saved = game.save.daily?.date === key ? game.save.daily.found : [];
  game.mode = 'daily';
  startRound(data, saved);
}

function startRound(data, restored = []) {
  if (!data) {
    showFatal('В словаре не хватает слов для уровня.');
    return;
  }
  game.data = data;
  game.wordSet = new Set(data.words);
  game.letters = shuffled([...data.base], Math.random);
  game.selected = [];
  game.found = new Set(restored.filter((w) => game.wordSet.has(w)));
  lastAdded = null;
  buildWheel();
  renderAll();
  armHintNudge();
}

/** Если игрок долго не находит слов, подсказка начинает мигать. */
function armHintNudge() {
  clearTimeout(hintTimer);
  ui.hintBtn.classList.remove('btn--pulse');
  hintTimer = setTimeout(() => ui.hintBtn.classList.add('btn--pulse'), HINT_NUDGE_MS);
}

function buildWheel() {
  ui.wheel.querySelectorAll('.letter').forEach((el) => el.remove());
  const count = game.letters.length;
  game.points = game.letters.map((ch, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const x = 50 + WHEEL_RADIUS * Math.cos(angle);
    const y = 50 + WHEEL_RADIUS * Math.sin(angle);
    const el = document.createElement('div');
    el.className = 'letter';
    el.textContent = ch;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    ui.wheel.append(el);
    return { x, y, el };
  });
}

const prefs = loadPrefs();
let lastSelectedCount = 0;

function applySound() {
  setSoundEnabled(prefs.sound && !game.paused);
}

function currentTheme() {
  return resolveTheme(prefs, matchMedia('(prefers-color-scheme: dark)').matches);
}

function renderPrefs() {
  document.documentElement.dataset.theme = currentTheme();
  ui.soundBtn.textContent = prefs.sound ? '🔊' : '🔇';
  ui.soundBtn.setAttribute('aria-pressed', String(prefs.sound));
  ui.themeBtn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
  applySound();
}

function toggleSound() {
  prefs.sound = !prefs.sound;
  savePrefs(prefs);
  renderPrefs();
  sfx.tick(3);
}

function toggleTheme() {
  prefs.theme = currentTheme() === 'dark' ? 'light' : 'dark';
  savePrefs(prefs);
  renderPrefs();
}

function renderAll() {
  renderHeader();
  renderFound();
  renderCurrent();
  renderHint();
  renderDailyButton();
}

function renderHeader() {
  const { level, goal, daily } = game.data;
  ui.level.textContent = daily ? 'Ежедневный' : `Уровень ${level}`;
  ui.progress.textContent = `${Math.min(game.found.size, goal)} / ${goal}`;
  ui.barFill.style.width = `${goal > 0 ? Math.min(100, (game.found.size / goal) * 100) : 0}%`;
}

const CONFETTI_COLORS = ['#46b79d', '#f7bc80', '#aaa0eb', '#f27f73', '#ffd95e'];

// Горсть цветных полосок падает сверху при прохождении уровня.
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 160)}px`);
    piece.style.setProperty('--rot', `${Math.round(360 + Math.random() * 540)}deg`);
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2400);
}

function renderDailyButton() {
  const doneToday = game.save.daily?.date === today() && game.save.daily.done;
  const streak = liveStreak(game.save.streak, today());
  const btn = ui.dailyBtn;
  btn.classList.toggle('pill--on', game.mode === 'daily');
  btn.classList.toggle('pill--done', game.mode !== 'daily' && doneToday);
  if (game.mode === 'daily') btn.textContent = 'К уровням';
  else if (doneToday) btn.textContent = `✓ Пройден сегодня · серия ${streak}`;
  else btn.textContent = streak > 0 ? `Ежедневный уровень · серия ${streak}` : 'Ежедневный уровень';
}

function renderFound() {
  ui.found.replaceChildren();
  const sorted = [...game.found].sort((a, b) => a.length - b.length || a.localeCompare(b, 'ru'));
  for (const word of sorted) {
    const chip = document.createElement('span');
    chip.className = word === lastAdded ? 'chip chip--new' : 'chip';
    chip.textContent = word;
    ui.found.append(chip);
  }
  const left = Math.max(0, game.data.goal - game.found.size);
  for (let i = 0; i < left; i++) {
    const chip = document.createElement('span');
    chip.className = 'chip chip--hint';
    chip.textContent = '···';
    ui.found.append(chip);
  }
}

function renderCurrent() {
  const count = game.selected.length;
  if (count > lastSelectedCount) sfx.tick(count);
  lastSelectedCount = count;
  ui.current.textContent = game.selected.map((i) => game.letters[i]).join('');
  game.points.forEach((p, i) => p.el.classList.toggle('letter--on', game.selected.includes(i)));
  ui.trail.setAttribute(
    'points',
    game.selected.map((i) => `${game.points[i].x},${game.points[i].y}`).join(' '),
  );
}

function renderHint() {
  ui.hintSub.textContent = game.hints > 0 ? `осталось ${game.hints}` : '▶ за рекламу';
}

function toast(text, bad = false) {
  ui.toast.textContent = text;
  ui.toast.classList.toggle('toast--bad', bad);
  ui.toast.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('toast--show'), 1300);
}

function reject(text) {
  sfx.bad();
  toast(text, true);
  ui.current.classList.remove('current--shake');
  void ui.current.offsetWidth; // перезапуск анимации
  ui.current.classList.add('current--shake');
}

// ---------- ввод слова ----------

function inputBlocked() {
  return game.busy || game.paused || !game.data;
}

function hit(event) {
  const rect = ui.wheel.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  let best = -1;
  let bestDist = HIT_RADIUS;
  game.points.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

function onDown(event) {
  if (game.paused && !document.hidden) setPaused(false); // событие фокуса могло не прийти
  if (inputBlocked()) return;
  const i = hit(event);
  if (i < 0) return;
  try {
    ui.wheel.setPointerCapture(event.pointerId);
  } catch {
    // без захвата указателя жест всё равно работает внутри круга
  }
  dragging = true;
  dragMoved = false;
  if (!game.selected.includes(i)) {
    game.selected.push(i);
  } else if (game.selected.at(-1) === i) {
    game.selected.pop(); // повторное нажатие на последнюю букву снимает её
    dragging = false;
  }
  renderCurrent();
}

function onMove(event) {
  if (!dragging) return;
  const i = hit(event);
  if (i < 0 || game.selected.at(-1) === i) return;
  if (game.selected.length >= 2 && game.selected.at(-2) === i) {
    game.selected.pop(); // вернулись на шаг назад
    dragMoved = true;
  } else if (!game.selected.includes(i)) {
    game.selected.push(i);
    dragMoved = true;
  }
  renderCurrent();
}

function onUp() {
  if (!dragging) return;
  dragging = false;
  if (dragMoved) submit();
}

function submit() {
  if (inputBlocked()) return;
  const word = game.selected.map((i) => game.letters[i]).join('');
  game.selected = [];
  renderCurrent();
  if (word.length === 0) return;
  if (word.length < MIN_WORD_LEN) return reject(`Минимум ${MIN_WORD_LEN} буквы`);
  if (game.found.has(word)) return reject('Уже найдено');
  if (!game.wordSet.has(word)) return reject('Нет такого слова');
  addWord(word);
}

function addWord(word) {
  game.found.add(word);
  if (game.found.size < game.data.goal) sfx.good();
  lastAdded = word;
  persist();
  renderHeader();
  renderFound();
  armHintNudge();
  if (game.found.size >= game.data.goal) finishLevel();
}

function erase() {
  if (inputBlocked()) return;
  game.selected.pop();
  renderCurrent();
}

function shuffleLetters() {
  if (inputBlocked()) return;
  game.letters = shuffled(game.letters, Math.random);
  game.selected = [];
  buildWheel();
  renderCurrent();
}

function onKey(event) {
  if (inputBlocked() || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Enter') return submit();
  if (event.key === 'Backspace') return erase();
  if (event.key.length !== 1) return;
  const ch = normalize(event.key);
  if (!ch) return;
  const i = game.letters.findIndex((letter, idx) => letter === ch && !game.selected.includes(idx));
  if (i >= 0) {
    game.selected.push(i);
    renderCurrent();
  }
}

// ---------- подсказка и реклама ----------

async function useHint() {
  if (inputBlocked()) return;
  if (game.hints > 0) {
    game.hints -= 1;
  } else {
    game.busy = true;
    sdk.gameplayStop();
    const rewarded = await sdk.showRewarded();
    lastInterstitialAt = Date.now(); // после ролика с наградой полноэкранный тоже придерживаем
    sdk.gameplayStart();
    game.busy = false;
    if (!rewarded) return toast('Награда не получена', true);
  }
  revealWord();
  renderHint();
}

function revealWord() {
  const rest = game.data.words.filter((w) => !game.found.has(w));
  if (rest.length === 0) return;
  addWord(rest[0]); // слова идут в порядке частотности: открываем самое употребимое
}

function finishLevel() {
  game.busy = true;
  sfx.win();
  clearTimeout(hintTimer);
  ui.hintBtn.classList.remove('btn--pulse');
  sdk.gameplayStop();
  if (game.mode === 'daily') return finishDaily();
  ui.modalTitle.textContent = `Уровень ${game.data.level} пройден!`;
  ui.modalText.textContent = `Найдено слов: ${game.found.size}`;
  ui.nextBtn.textContent = 'Дальше';
  ui.modal.hidden = false;
  confetti();
}

function finishDaily() {
  const save = game.save;
  const key = game.data.dateKey;
  if (save.daily?.done && save.daily.date === key) {
    ui.modalTitle.textContent = 'Ежедневный уровень уже пройден';
    ui.modalText.textContent = 'Новый будет завтра.';
  } else {
    save.streak = nextStreak(save.streak, key);
    save.daily = { date: key, found: [...game.found], done: true };
    game.hints += DAILY_REWARD_HINTS;
    save.hints = game.hints;
    commitSave();
    ui.modalTitle.textContent = 'Ежедневный уровень пройден!';
    ui.modalText.textContent = `Серия: ${save.streak.count} дн. · +${DAILY_REWARD_HINTS} подсказки`;
  }
  ui.nextBtn.textContent = 'К уровням';
  ui.modal.hidden = false;
  confetti();
}

async function nextLevel() {
  ui.modal.hidden = true;
  if (game.mode === 'daily') {
    returnToLevels();
    return;
  }
  // Пауза между уровнями: игрок сам нажал «Дальше», и не чаще одного ролика за AD_GAP_MS.
  if (canShowInterstitial(Date.now(), lastInterstitialAt, AD_GAP_MS)) {
    await sdk.showInterstitial();
    lastInterstitialAt = Date.now();
  }
  const next = game.data.level + 1;
  game.save.level = next;
  game.save.found = [];
  commitSave();
  game.busy = false;
  startLevel(next);
  sdk.gameplayStart();
}

function returnToLevels() {
  game.busy = false;
  startLevel(game.save.level, game.save.found);
  if (game.found.size >= game.data.goal) finishLevel();
  else sdk.gameplayStart();
}

function onDailyClick() {
  if (game.busy || game.paused) return;
  if (game.mode === 'daily') {
    persist();
    sdk.gameplayStop();
    returnToLevels();
    return;
  }
  const doneToday = game.save.daily?.date === today() && game.save.daily.done;
  if (doneToday) {
    const streak = liveStreak(game.save.streak, today());
    return toast(`Сегодня уже пройдено. Серия: ${streak} дн.`);
  }
  persist();
  sdk.gameplayStop();
  startDaily();
  sdk.gameplayStart();
}

// ---------- справка и пауза ----------

function openHelp() {
  if (game.busy && ui.help.hidden) return; // не поверх окна уровня или рекламы
  game.busy = true;
  sdk.gameplayStop();
  ui.help.hidden = false;
}

function closeHelp() {
  ui.help.hidden = true;
  game.save.seenHelp = true;
  commitSave();
  game.busy = false;
  sdk.gameplayStart();
}

/** Игра ушла в фон или потеряла фокус: не принимаем ввод и сообщаем платформе. */
function setPaused(paused) {
  if (game.paused === paused) return;
  game.paused = paused;
  applySound();
  if (paused) {
    dragging = false;
    game.selected = [];
    if (game.data) renderCurrent();
    flushSave();
    sdk.gameplayStop();
  } else {
    if (!game.busy) sdk.gameplayStart();
    if (game.save) renderDailyButton(); // мог смениться день
  }
}

// ---------- запуск ----------

function showFatal(text) {
  ui.loading.hidden = false;
  ui.loadingText.textContent = text;
}

async function loadDictionary() {
  const response = await fetch('data/words.txt');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return [...new Set(text.split(/\r?\n/).map(normalize).filter((w) => w.length >= MIN_WORD_LEN))];
}

async function init() {
  sdk.onPauseResume(
    () => setPaused(true),
    () => setPaused(false),
  );
  await sdk.initSdk();
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));
  window.addEventListener('blur', () => setPaused(true));
  window.addEventListener('focus', () => setPaused(document.hidden));
  window.addEventListener('pagehide', flushSave);

  let dict;
  try {
    dict = await loadDictionary();
  } catch (error) {
    showFatal('Не удалось загрузить словарь. Обновите страницу.');
    console.error(error);
    return;
  }
  // В словаре сначала идут частотные слова: базовые слова берём только из первых 5000.
  game.levelAt = createLevelBook(dict, { minSub: 8, baseLimit: 5000 });
  game.dailyAt = createDailyPicker(dict, { minSub: 15, baseLimit: 5000 });

  ui.wheel.addEventListener('pointerdown', onDown);
  ui.wheel.addEventListener('pointermove', onMove);
  ui.wheel.addEventListener('pointerup', onUp);
  ui.wheel.addEventListener('pointercancel', onUp);
  $('shuffleBtn').addEventListener('click', shuffleLetters);
  $('enterBtn').addEventListener('click', submit);
  $('eraseBtn').addEventListener('click', erase);
  ui.hintBtn.addEventListener('click', useHint);
  ui.nextBtn.addEventListener('click', nextLevel);
  ui.dailyBtn.addEventListener('click', onDailyClick);
  ui.helpBtn.addEventListener('click', openHelp);
  ui.soundBtn.addEventListener('click', toggleSound);
  ui.themeBtn.addEventListener('click', toggleTheme);
  renderPrefs();
  $('helpCloseBtn').addEventListener('click', closeHelp);
  document.addEventListener('keydown', onKey);

  // Локальное сохранение и облачное объединяем: побеждает тот, где игрок дальше.
  const cloud = await sdk.loadCloudSave();
  game.save = cloud ? mergeSaves(loadSave(), cloud) : loadSave();
  writeSave(game.save);
  game.hints = game.save.hints;
  startLevel(game.save.level, game.save.found);
  if (game.data && game.found.size >= game.data.goal) finishLevel();
  ui.loading.hidden = true;
  sdk.loadingReady();
  if (!game.save.seenHelp && !game.busy) openHelp();
  else if (!game.busy) sdk.gameplayStart();
}

init();
