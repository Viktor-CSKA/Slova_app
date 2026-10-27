// Делает видео геймплея для консоли Яндекс Игр: store/gameplay-16x9.mp4 (1280×720, 16:9, до 28 с).
// Использование: node tools/make-store-video.mjs  (нужен Chrome с кодеком H.264 в MediaRecorder)
// Скрипт играет в настоящую игру в headless Chrome, снимает кадры, потом собирает из них MP4.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const framesDir = join(root, 'store', 'frames-tmp');
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SITE_PORT = 5192;
const DEBUG_PORT = 9334;
const site = `http://127.0.0.1:${SITE_PORT}`;
const DURATION_MS = 25000;

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), root, String(SITE_PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'slova-chrome-'));
const chrome = spawn(
  chromePath,
  ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'],
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

async function cleanup() {
  ws.close();
  chrome.kill();
  server.kill();
  await sleep(500);
  rmSync(framesDir, { recursive: true, force: true });
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // профиль Chrome ещё занят: уберётся системой
  }
}

try {
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await cdp('Page.navigate', { url: `${site}/tools/blank.html` });
  await sleep(300);
  await evaluate(`
    const d = new Date(Date.now() - 86400000), p = (n) => String(n).padStart(2, '0');
    const y = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    localStorage.clear();
    localStorage.setItem('slova_save_v1', JSON.stringify({ level: 3, found: [], hints: 3, daily: null, streak: { count: 2, last: y }, seenHelp: true }));
    1`);
  await cdp('Page.navigate', { url: `${site}/` });
  await sleep(1500);

  await evaluate(`
    window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__words = async (daily) => {
      const L = await import('/js/logic.js'), P = await import('/js/progress.js');
      const text = await (await fetch('/data/words.txt')).text();
      const dict = text.split(/\\n/).map(L.normalize).filter((w) => w.length >= 3);
      return daily
        ? L.createDailyPicker(dict, { minSub: 15, baseLimit: 5000 })(P.dateKey(Date.now()))
        : L.createLevelBook(dict, { minSub: 8, baseLimit: 5000 })(Number(document.getElementById('levelLabel').textContent.replace(/\\D/g, '')));
    };
    window.__drag = async (w) => {
      const els = [...document.querySelectorAll('.letter')], used = new Set(), wheel = document.getElementById('wheel');
      const fire = (type, el) => {
        const r = el.getBoundingClientRect();
        wheel.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      };
      let first = true, last = null;
      for (const ch of w) {
        const i = els.findIndex((e, k) => e.textContent === ch && !used.has(k));
        used.add(i);
        fire(first ? 'pointerdown' : 'pointermove', els[i]);
        last = els[i];
        first = false;
        await __sleep(170);
      }
      wheel.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
      await __sleep(80);
    };
    1`);

  // Сценарий игры идёт параллельно со съёмкой кадров.
  const level = await evaluate('__words(false)');
  const short = level.words.filter((w) => w.length >= 3 && w.length <= 5);
  const levelWords = short.slice(0, Math.max(1, level.goal - 1));
  const daily = await evaluate('__words(true)');
  const dailyWords = daily.words.filter((w) => w.length <= 5).slice(0, 4);

  const frames = [];
  const start = Date.now();
  let capturing = true;
  const capture = (async () => {
    let n = 0;
    while (capturing && Date.now() - start < DURATION_MS) {
      const t = Date.now() - start;
      const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
      const file = `f${String(n++).padStart(4, '0')}.jpg`;
      writeFileSync(join(framesDir, file), Buffer.from(data, 'base64'));
      frames.push({ file, t });
    }
  })();

  await sleep(1200);
  for (const w of levelWords) {
    await evaluate(`__drag(${JSON.stringify(w)})`);
    await sleep(500);
  }
  await sleep(1200); // окно «Уровень пройден» не показываем долго: переходим к ежедневному, если оно не открылось
  const modalOpen = await evaluate(`!document.getElementById('modal').hidden`);
  if (modalOpen) {
    await evaluate(`document.getElementById('nextBtn').click(); 1`);
    await sleep(900);
    await evaluate(`(document.querySelector('.mock-ad button') || {click(){}}).click(); 1`);
    await sleep(700);
  }
  await evaluate(`document.getElementById('dailyBtn').click(); 1`);
  await sleep(1000);
  for (const w of dailyWords) {
    await evaluate(`__drag(${JSON.stringify(w)})`);
    await sleep(500);
  }
  while (Date.now() - start < DURATION_MS) await sleep(100);
  capturing = false;
  await capture;
  const duration = frames.at(-1).t + 100;
  writeFileSync(join(framesDir, 'manifest.json'), JSON.stringify({ duration, frames }));
  console.log(`Кадров: ${frames.length}, длительность ${(duration / 1000).toFixed(1)} с`);

  // Сборка MP4 в странице Chrome.
  await cdp('Page.navigate', { url: `${site}/tools/record-video.html` });
  let status = '';
  for (let i = 0; i < 400; i++) {
    await sleep(500);
    status = await evaluate('window.__status');
    if (String(status).startsWith('done') || String(status).startsWith('error')) break;
  }
  console.log('Сборка:', status);
  if (!String(status).startsWith('done')) throw new Error(`Видео не собралось: ${status}`);
  const base64 = await evaluate('window.__result');
  writeFileSync(join(root, 'store', 'gameplay-16x9.mp4'), Buffer.from(base64, 'base64'));
  console.log('store/gameplay-16x9.mp4 готово');
} finally {
  await cleanup();
}
