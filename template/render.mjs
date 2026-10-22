// Usage :
//   node render.mjs preview 0.5 4 12.5        -> previews/t_XX.jpg
//   node render.mjs video reels|tiktok         -> frames/<variant>_video.mp4 (sans son)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Navigateur : CHROME_PATH, sinon chrome-headless-shell installe par `npm run setup` dans chs/ (le plus fiable),
// sinon Chrome ou Chromium aux emplacements habituels Windows / macOS / Linux.
function findIn(dir, names) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const f = findIn(p, names); if (f) return f; }
    else if (names.includes(e.name)) return p;
  }
  return null;
}
const CHROME = [process.env.CHROME_PATH, findIn(path.join(ROOT, 'chs'), ['chrome-headless-shell.exe', 'chrome-headless-shell']),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find(p => p && fs.existsSync(p));
if (!CHROME) throw new Error('Chrome introuvable : definir CHROME_PATH');
const FPS = 30;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(8765, r));

const [mode, ...rest] = process.argv.slice(2);
const variant = mode === 'video' ? (rest[0] || 'reels') : 'reels';
// Le lancement de Chrome echoue parfois sans raison (code 0) : on reessaie.
let browser;
for (let attempt = 1; !browser; attempt++) {
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME, headless: true, userDataDir: path.join(os.tmpdir(), `pptr-reel-${process.pid}-${attempt}`),
      args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    });
  } catch (e) {
    if (attempt >= 5) throw e;
    console.log(`lancement Chrome echoue (essai ${attempt}), nouvel essai`);
    await new Promise(r => setTimeout(r, 2000));
  }
}
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[page error]', e.message));
await page.goto(`http://localhost:8765/scene.html?variant=${variant}`);
await page.waitForFunction('window.ready === true', { timeout: 60000 });

if (mode === 'preview') {
  fs.mkdirSync(path.join(ROOT, 'previews'), { recursive: true });
  for (const t of rest.map(Number)) {
    const b64 = await page.evaluate(t => window.renderAt(t, 0.9), t);
    const f = path.join(ROOT, 'previews', `t_${t.toFixed(2)}.jpg`);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    console.log('ok', f);
  }
} else {
  fs.mkdirSync(path.join(ROOT, 'frames'), { recursive: true });
  const dur = await page.evaluate('window.DURATION');
  const n = Math.round(dur * FPS);
  const outFile = path.join(ROOT, 'frames', `${variant}_video.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', outFile], { stdio: ['pipe', 'ignore', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate(t => window.renderAt(t, 0.96), i / FPS);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('ok', outFile);
}
await browser.close();
server.close();


