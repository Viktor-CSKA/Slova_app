// Делает материалы карточки для консоли Яндекс Игр в store/: иконку, обложку и скриншоты игры.
// Использование: node tools/make-store-art.mjs  (нужен Chrome; путь можно задать в CHROME_PATH)
// Игра снимается настоящая: скрипт запускает headless Chrome, готовит состояние и жмёт буквы так же, как игрок.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'store');
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE_PORT = 5191;
const DEBUG_PORT = 9333;
const site = `http://127.0.0.1:${SITE_PORT}`;

mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), root, String(SITE_PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'slova-chrome-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome ещё запускается
    }
    await sleep(200);
  }
  throw new Error('Chrome не запустился');
}

const ws = new WebSocket(await connect());
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let nextId = 1;
const waiting = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'ошибка в странице');
  return r.result.value;
};

async function open(url, { width, height, scale, dark = false, init = '' }) {
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: width < 600 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  await cdp('Page.navigate', { url: `${site}/tools/blank.html` }); // чистая страница, чтобы выставить localStorage
  await sleep(300);
  await evaluate(`localStorage.clear(); ${init}; 1`);
  await cdp('Page.navigate', { url });
  await sleep(1200);
}

async function shot(file, { width, height, scale, format = 'png' }) {
  const { data } = await cdp('Page.captureScreenshot', {
    format,
    clip: { x: 0, y: 0, width, height, scale: 1 },
    captureBeyondViewport: false,
  });
  writeFileSync(join(out, file), Buffer.from(data, 'base64'));
  console.log(`store/${file} ${width * scale}×${height * scale}`);
}

// ---- иконка и обложка ----
await open(`${site}/tools/store-art.html?kind=icon`, { width: 512, height: 512, scale: 1 });
await shot('icon-512.png', { width: 512, height: 512, scale: 1 });
await open(`${site}/tools/store-art.html?kind=cover`, { width: 800, height: 470, scale: 1 });
await shot('cover-800x470.png', { width: 800, height: 470, scale: 1 });

// ---- скриншоты игры (портрет 360×640 при масштабе 2 = 720×1280) ----
const view = { width: 360, height: 640, scale: 2 };
const saveInit = (level, streak) => `
  const d = new Date(Date.now() - 86400000), p = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  localStorage.setItem('slova_save_v1', JSON.stringify({ level: ${level}, found: [], hints: 3, daily: null,
    streak: { count: ${streak}, last: y }, seenHelp: true }))`;

// Помощники внутри страницы: слова текущего уровня, ввод слова, жест по кругу.
const helpers = `
  window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__words = async (daily) => {
    const L = await import('/js/logic.js'), P = await import('/js/progress.js');
    const text = await (await fetch('/data/words.txt')).text();
    const dict = text.split(/\\n/).map(L.normalize).filter((w) => w.length >= 3);
    return daily
      ? L.createDailyPicker(dict, { minSub: 15, baseLimit: 5000 })(P.dateKey(Date.now()))
      : L.createLevelBook(dict, { minSub: 8, baseLimit: 5000 })(Number(document.getElementById('levelLabel').textContent.replace(/\\D/g, '')));
  };
  window.__type = (w) => {
    for (const ch of w) document.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  };
  window.__drag = async (w) => {
    const els = [...document.querySelectorAll('.letter')], used = new Set(), wheel = document.getElementById('wheel');
    const fire = (type, el) => {
      const r = el.getBoundingClientRect();
      wheel.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    };
    let first = true;
    for (const ch of w) {
      const i = els.findIndex((e, k) => e.textContent === ch && !used.has(k));
      used.add(i);
      fire(first ? 'pointerdown' : 'pointermove', els[i]);
      first = false;
      await __sleep(40);
    }
  };`;

// 1. Обычный уровень: часть слов найдена, идёт жест по кругу.
await open(site + '/', { ...view, init: saveInit(12, 3) });
await evaluate(helpers);
let level = await evaluate('__words(false)');
const rest = level.words.filter((w) => w.length <= 5);
for (const w of rest.slice(0, 4)) await evaluate(`__type(${JSON.stringify(w)})`);
await sleep(500);
const dragWord = rest.find((w) => w.length >= 4 && !rest.slice(0, 4).includes(w)) ?? rest[4];
await evaluate(`__drag(${JSON.stringify(dragWord)})`);
await sleep(300);
await shot('screenshot-1-level.png', view);

// 2. Ежедневный уровень (тёмная тема).
await open(site + '/', { ...view, dark: true, init: saveInit(12, 4) });
await evaluate(helpers);
await evaluate(`document.getElementById('dailyBtn').click(); 1`);
await sleep(300);
const daily = await evaluate('__words(true)');
for (const w of daily.words.slice(0, 6)) await evaluate(`__type(${JSON.stringify(w)})`);
await sleep(600);
await shot('screenshot-2-daily.png', view);

// 3. Окно «Уровень пройден».
await open(site + '/', { ...view, init: saveInit(7, 0) });
await evaluate(helpers);
level = await evaluate('__words(false)');
for (const w of level.words.slice(0, level.goal)) await evaluate(`__type(${JSON.stringify(w)})`);
await sleep(600);
await shot('screenshot-3-complete.png', view);

// 4. Окно «Как играть».
await open(site + '/', { ...view, dark: true, init: saveInit(3, 0).replace('seenHelp: true', 'seenHelp: false') });
await sleep(500);
await shot('screenshot-4-help.png', view);

ws.close();
chrome.kill();
server.kill();
await sleep(500);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  // профиль Chrome ещё занят: уберётся системой
}
