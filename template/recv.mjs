// Recoit les MP3 envoyes depuis l'onglet ElevenLabs et les ecrit dans voices/.
// Usage : node recv.mjs (en arriere-plan), puis depuis la page : POST http://127.0.0.1:8799/save?name=lui_1.mp3
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'voices');
fs.mkdirSync(OUT, { recursive: true });
const NAMES = /^[a-z]+_\d+\.mp3$/;
const cors = {
  'Access-Control-Allow-Origin': 'https://elevenlabs.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
};
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
  if (req.method !== 'POST' || !NAMES.test(name)) { res.writeHead(400, cors); return res.end('bad'); }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log('saved', name, buf.length);
    res.writeHead(200, cors); res.end('ok');
  });
}).listen(8799, '127.0.0.1', () => console.log('listening 8799 ->', OUT));
