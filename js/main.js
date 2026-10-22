import { MIN_WORD_LEN, createLevelBook, normalize, shuffled } from './logic.js';
import * as sdk from './sdk.js';
import { loadSave, writeSave } from './storage.js';

const $ = (id) => document.getElementById(id);
const ui = {
  level: $('levelLabel'),
  progress: $('progressLabel'),
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
  loading: $('loading'),
  loadingText: $('loadingText'),
};

const WHEEL_RADIUS = 34; // % от размера круга
const HIT_RADIUS = 9; // % — радиус попадания по букве

const game = {
  levelAt: null,
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

// ---------- сохранение ----------

function persist() {
  writeSave({ level: game.data.level, found: [...game.found], hints: game.hints });
}

// ---------- уровень ----------

function startLevel(number, restored = []) {
  const data = game.levelAt(number);
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

function renderAll() {
  renderHeader();
  renderFound();
  renderCurrent();
  renderHint();
}

function renderHeader() {
  const { level, goal } = game.data;
  ui.level.textContent = `Уровень ${level}`;
  ui.progress.textContent = `${Math.min(game.found.size, goal)} / ${goal}`;
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

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('toast--show'), 1300);
}

function reject(text) {
  toast(text);
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
  lastAdded = word;
  persist();
  renderHeader();
  renderFound();
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
    sdk.gameplayStart();
    game.busy = false;
    if (!rewarded) return toast('Награда не получена');
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
  sdk.gameplayStop();
  ui.modalTitle.textContent = `Уровень ${game.data.level} пройден!`;
  ui.modalText.textContent = `Найдено слов: ${game.found.size}`;
  ui.modal.hidden = false;
}

async function nextLevel() {
  ui.modal.hidden = true;
  await sdk.showInterstitial(); // пауза между уровнями, игрок сам нажал «Дальше»
  const next = game.data.level + 1;
  writeSave({ level: next, found: [], hints: game.hints });
  game.busy = false;
  startLevel(next);
  sdk.gameplayStart();
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
    () => {
      game.paused = true;
    },
    () => {
      game.paused = false;
    },
  );
  await sdk.initSdk();

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

  ui.wheel.addEventListener('pointerdown', onDown);
  ui.wheel.addEventListener('pointermove', onMove);
  ui.wheel.addEventListener('pointerup', onUp);
  ui.wheel.addEventListener('pointercancel', onUp);
  $('shuffleBtn').addEventListener('click', shuffleLetters);
  $('enterBtn').addEventListener('click', submit);
  $('eraseBtn').addEventListener('click', erase);
  ui.hintBtn.addEventListener('click', useHint);
  ui.nextBtn.addEventListener('click', nextLevel);
  document.addEventListener('keydown', onKey);

  const save = loadSave();
  game.hints = save.hints;
  startLevel(save.level, save.found);
  if (game.data && game.found.size >= game.data.goal) finishLevel();
  ui.loading.hidden = true;
  sdk.loadingReady();
  if (!game.busy) sdk.gameplayStart();
}

init();
