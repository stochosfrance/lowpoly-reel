// Scene 3D low-poly rendue image par image (exemple : la video "Je sers a quoi, moi ?").
// window.renderAt(t) dessine l'image au temps t (secondes) et renvoie un JPEG en base64.
import * as THREE from 'three';

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const VARIANT = params.get('variant') || 'reels'; // reels | tiktok
export const DURATION = 25;

// ---------- utilitaires ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const ramp = (t, a, b) => smooth((t - a) / (b - a));
// Cles [[t, v], ...] interpolees en douceur
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(7);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...o });
function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}

// ---------- marque et assistant (a adapter a chaque projet) ----------
// Fichiers optionnels dans assets/ :
//   logo.png ou logo.jpg     logo de fin, clair sur fond sombre (sinon BRAND.name est ecrit en texte)
//   assistant-logo.svg       logo officiel de l'assistant, a telecharger soi-meme sur son site (sinon un simple point)
const BRAND = {
  name: 'VOTRE MARQUE',
  logoWidth: 680,
  bg: '#0B0B0C', text: '#F2F0EC', accent: '#B08D57', muted: '#8A8B8E',
  // CTA de fin par plateforme : lignes de [texte, 'text' | 'accent'] + note grise optionnelle
  cta: {
    reels: { lines: [[['Commente ', 'text'], ['CLAUDE', 'accent'], [' pour', 'text']], [['automatiser ton business.', 'text']]],
      note: 'Il faut \u00eatre abonn\u00e9 pour recevoir la r\u00e9ponse.' },
    tiktok: { lines: [[['Abonne-toi', 'accent'], [' pour automatiser', 'text']], [['ton business.', 'text']]], note: '' },
  },
};
const ASSISTANT = { name: 'Claude', color: '#D97757' };
const CLAUDE_ORANGE = ASSISTANT.color;

let sparkPath = null, sparkBox = null, logoImg = null, logoBg = BRAND.bg;
async function tryFetch(url) { const r = await fetch(url); return r.ok ? r : null; }
async function loadAssets() {
  const files = '/node_modules/@fontsource/inter/files/';
  const f5 = new FontFace('Inter', `url(${files}inter-latin-500-normal.woff2)`, { weight: '500' });
  const f6 = new FontFace('Inter', `url(${files}inter-latin-600-normal.woff2)`, { weight: '600' });
  document.fonts.add(await f5.load()); document.fonts.add(await f6.load());

  // Logo de l'assistant : on garde le chemin le plus "carre" du SVG (le symbole d'un wordmark).
  const svgRes = await tryFetch('/assets/assistant-logo.svg');
  if (svgRes) {
    const doc = new DOMParser().parseFromString(await svgRes.text(), 'image/svg+xml');
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', doc.documentElement.getAttribute('viewBox') || '0 0 1000 1000');
    s.style.cssText = 'position:absolute;left:-9999px;width:1000px;height:1000px';
    document.body.appendChild(s);
    let best = null;
    for (const src of doc.querySelectorAll('path')) {
      const p = document.createElementNS(ns, 'path'); p.setAttribute('d', src.getAttribute('d')); s.appendChild(p);
      const b = p.getBBox(); const sq = Math.min(b.width, b.height) / Math.max(b.width, b.height, 1e-6);
      if (!best || sq > best.sq) best = { sq, b, d: src.getAttribute('d') };
    }
    s.remove();
    if (best) { sparkBox = best.b; sparkPath = new Path2D(best.d); }
  }

  for (const url of ['/assets/logo.png', '/assets/logo.jpg']) {
    if (!(await tryFetch(url))) continue;
    logoImg = new Image(); logoImg.src = url; await logoImg.decode();
    if (url.endsWith('.jpg')) { // fond du JPG = fond de fin, pour que le logo se fonde dedans
      const c = document.createElement('canvas'); c.width = c.height = 4;
      const cx = c.getContext('2d'); cx.drawImage(logoImg, 0, 0, 4, 4, 0, 0, 4, 4);
      const px = cx.getImageData(1, 1, 1, 1).data;
      logoBg = `rgb(${px[0]},${px[1]},${px[2]})`;
    }
    break;
  }
}
// Dessine le logo de l'assistant centre en (x, y), hauteur h (un point s'il n'y a pas de logo)
function drawSpark(ctx, x, y, h, color) {
  ctx.save(); ctx.fillStyle = color;
  if (!sparkPath) { ctx.beginPath(); ctx.arc(x, y, h * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
  const k = h / Math.max(sparkBox.width, sparkBox.height);
  ctx.translate(x - (sparkBox.x + sparkBox.width / 2) * k, y - (sparkBox.y + sparkBox.height / 2) * k);
  ctx.scale(k, k); ctx.fill(sparkPath);
  ctx.restore();
}

// ---------- rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const out = document.createElement('canvas'); out.width = W; out.height = H;
out.style.width = '270px'; document.body.appendChild(out);
const octx = out.getContext('2d');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#070a16');
scene.fog = new THREE.FogExp2('#161c36', 0.028);
const camera = new THREE.PerspectiveCamera(32, W / H, 0.02, 200);

// ---------- piece ----------
const room = new THREE.Group(); scene.add(room);
const wallM = mat('#1a1f30'), frameM = mat('#0e1018', { roughness: 0.6 });
const floor = box(8, 0.05, 8, mat('#2b2220', { roughness: 0.7 }), 0, -0.025, 0, room);
box(8, 0.05, 8, mat('#121522'), 0, 2.85, 0, room); // plafond
// mur du fond (vitre) z = -1.7 : allege + linteau + montants
const BACK = -1.7;
box(5.6, 0.32, 0.12, wallM, 0, 0.16, BACK, room);
box(5.6, 0.25, 0.12, wallM, 0, 2.72, BACK, room);
for (const x of [-2.75, -0.95, 0.95, 2.75]) box(0.07, 2.3, 0.1, frameM, x, 1.47, BACK, room);
box(5.6, 0.05, 0.1, frameM, 0, 0.34, BACK + 0.02, room);
box(5.6, 0.05, 0.1, frameM, 0, 2.6, BACK + 0.02, room);
// mur gauche vitre x = -2.8
const LEFT = -2.8;
box(0.12, 0.32, 4.5, wallM, LEFT, 0.16, 0.55, room);
box(0.12, 0.25, 4.5, wallM, LEFT, 2.72, 0.55, room);
for (const z of [-0.2, 1.4, 2.8]) box(0.1, 2.3, 0.07, frameM, LEFT, 1.47, z, room);
// mur droit plein + etagere + lampe
box(0.12, 2.9, 4.5, wallM, 2.85, 1.45, 0.55, room);
box(0.12, 2.9, 5.8, wallM, 0, 1.45, 3.0, room).rotation.y = Math.PI / 2;
box(0.3, 0.03, 1.2, mat('#5a4030'), 2.68, 1.25, -0.6, room);
for (let i = 0; i < 7; i++) box(0.2, 0.18 + rand() * 0.1, 0.05, mat(['#7a3b2e', '#2d4a6b', '#c8b48a', '#3d5c45'][i % 4]), 2.68, 1.36, -1.05 + i * 0.07, room);
const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 7, 1, true), new THREE.MeshStandardMaterial({ color: '#f0d2a0', emissive: '#ffb468', emissiveIntensity: 1.4, flatShading: true, side: THREE.DoubleSide }));
lampShade.position.set(2.62, 1.48, -0.25); room.add(lampShade);
box(0.02, 0.2, 0.02, frameM, 2.62, 1.34, -0.25, room);
// plante pres de la vitre
const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 7), mat('#3a3433'));
pot.position.set(-1.7, 0.15, -1.3); pot.castShadow = true; room.add(pot);
for (let i = 0; i < 9; i++) {
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6 + rand() * 0.4, 4), mat('#2f5a3c'));
  const a = (i / 9) * Math.PI * 2;
  leaf.position.set(-1.7 + Math.cos(a) * 0.08, 0.6, -1.3 + Math.sin(a) * 0.08);
  leaf.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); leaf.castShadow = true; room.add(leaf);
}

// ---------- bureau, chaise, laptop ----------
const deskM = mat('#b98b5f', { roughness: 0.7 });
box(1.5, 0.04, 0.78, deskM, 0, 0.725, -0.05, room);
for (const [x, z] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.3], [0.7, 0.3]]) box(0.05, 0.7, 0.05, frameM, x, 0.35, z, room);
// mug + papiers (les factures)
const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 8), mat('#e9e3d8'));
mug.position.set(-0.45, 0.795, -0.12); mug.castShadow = true; room.add(mug);
for (let i = 0; i < 5; i++) {
  const sheet = box(0.21, 0.004, 0.29, mat('#ecebe6'), -0.36 + i * 0.004, 0.749 + i * 0.004, 0.12, room);
  sheet.rotation.y = (rand() - 0.5) * 0.3;
}
const chairM = mat('#24262e');
box(0.48, 0.07, 0.46, chairM, 0, 0.44, -0.72, room);
const chairBack = box(0.46, 0.55, 0.06, chairM, 0, 0.8, -0.98, room); chairBack.rotation.x = -0.12;
box(0.05, 0.4, 0.05, frameM, 0, 0.2, -0.72, room);

const laptop = new THREE.Group(); laptop.position.set(0.06, 0.745, -0.2); room.add(laptop);
const alu = mat('#9aa0a8', { roughness: 0.45, metalness: 0.3 });
box(0.34, 0.016, 0.23, alu, 0, 0.008, 0, laptop);
const hinge = new THREE.Group(); hinge.position.set(0, 0.016, 0.115); laptop.add(hinge);
hinge.rotation.x = 0.28;
box(0.34, 0.22, 0.01, alu, 0, 0.11, 0, hinge);
const screenCanvas = document.createElement('canvas'); screenCanvas.width = 512; screenCanvas.height = 330;
const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), screenMat);
screenMesh.position.set(0, 0.11, -0.006); screenMesh.rotation.y = Math.PI; hinge.add(screenMesh);

// ---------- personnage ----------
const skinM = mat('#d9a07a'), hairM = mat('#4a2f1f'), sweaterM = mat('#2c47a8'), pantsM = mat('#1c2133'), darkM = mat('#15110f'), whiteM = mat('#f4f1ea');
const char = new THREE.Group(); char.position.set(0, 0, -0.66); scene.add(char);
const hips = new THREE.Group(); hips.position.set(0, 0.5, 0); char.add(hips);
const torso = new THREE.Group(); hips.add(torso);
const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.15, 0.5, 7), sweaterM);
torsoMesh.scale.z = 0.62; torsoMesh.position.y = 0.26; torsoMesh.castShadow = true; torso.add(torsoMesh);
const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.04, 7), sweaterM);
collar.position.y = 0.51; torso.add(collar);
const neck = new THREE.Group(); neck.position.set(0, 0.5, 0.0); torso.add(neck);
const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6), skinM);
neckMesh.position.y = 0.04; neck.add(neckMesh);
const head = new THREE.Group(); head.position.set(0, 0.07, 0.01); neck.add(head);
const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.115, 1), skinM);
skull.scale.set(0.86, 1.06, 0.95); skull.position.set(0, 0.12, 0); skull.castShadow = true; head.add(skull);
const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.15), skinM);
jaw.position.set(0, 0.055, 0.012); head.add(jaw);
const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.121, 1), hairM);
hair.scale.set(0.9, 0.86, 0.98); hair.position.set(0, 0.168, -0.022); hair.castShadow = true; head.add(hair);
// meches low-poly
const r2 = rng(42);
for (let i = 0; i < 16; i++) {
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4), hairM);
  const a = -0.4 + (i / 15) * 3.9, rr = 0.07 + r2() * 0.03;
  tuft.position.set(Math.cos(a) * rr * 0.9, 0.235 + r2() * 0.02, Math.sin(a) * rr - 0.01);
  tuft.rotation.set(Math.sin(a) * 0.9 + 0.3, r2() * 3, -Math.cos(a) * 0.9);
  head.add(tuft);
}
for (let i = 0; i < 5; i++) { // frange
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 4), hairM);
  f.position.set(-0.05 + i * 0.026, 0.205, 0.075); f.rotation.set(2.2, 0, -0.6 + i * 0.25); head.add(f);
}
for (const s of [-1, 1]) {
  box(0.022, 0.05, 0.035, skinM, s * 0.098, 0.115, 0.0, head); // oreilles
  box(0.02, 0.07, 0.07, hairM, s * 0.093, 0.165, -0.01, head); // pattes
}
const nose = box(0.022, 0.035, 0.03, skinM, 0, 0.105, 0.108, head);
const eyes = [];
for (const s of [-1, 1]) {
  const g = new THREE.Group(); g.position.set(s * 0.038, 0.128, 0.1); head.add(g);
  const white = box(0.03, 0.017, 0.008, whiteM, 0, 0, 0, g);
  const pupil = box(0.014, 0.015, 0.008, darkM, 0, 0, 0.003, g);
  const glint = box(0.004, 0.004, 0.004, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0.003, 0.004, 0.008, g);
  const lid = box(0.034, 0.02, 0.012, skinM, 0, 0.01, 0.004, g); lid.geometry.translate(0, -0.01, 0);
  const brow = box(0.038, 0.009, 0.012, hairM, 0, 0.024, 0.004, g);
  eyes.push({ g, pupil, glint, lid, brow, s });
}
const mouth = box(0.04, 0.006, 0.008, mat('#5a2620'), 0, 0.068, 0.104, head);
const corners = [-1, 1].map(s => box(0.012, 0.005, 0.008, mat('#5a2620'), s * 0.022, 0.07, 0.102, head));

// membres : cylindres places entre deux points
function limb(r1, r2, m) {
  const g = new THREE.CylinderGeometry(r2, r1, 1, 6); g.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; scene.add(mesh); return mesh;
}
const UP = new THREE.Vector3(0, 1, 0);
function place(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  mesh.position.copy(a); mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
}
function ik(S, Wt, a, b, pole) {
  const d = Math.min(S.distanceTo(Wt), a + b - 1e-4);
  const dir = new THREE.Vector3().subVectors(Wt, S).normalize();
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(a * a - x * x, 0));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const wrist = S.clone().add(dir.clone().multiplyScalar(d));
  return { elbow: S.clone().add(dir.multiplyScalar(x)).add(p.multiplyScalar(h)), wrist };
}
const arms = [-1, 1].map(s => ({
  s, upper: limb(0.052, 0.046, sweaterM), fore: limb(0.046, 0.04, sweaterM),
  hand: (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.035), skinM); m.geometry.translate(0, 0.05, 0); m.castShadow = true; scene.add(m); return m; })(),
}));
const legs = [-1, 1].map(s => ({ thigh: limb(0.075, 0.065, pantsM), shin: limb(0.06, 0.05, pantsM), shoe: box(0.1, 0.07, 0.24, darkM) }));
legs.forEach(l => scene.add(l.shoe));

// ---------- hologramme ----------
const panelCanvas = document.createElement('canvas'); panelCanvas.width = 840; panelCanvas.height = 600;
const pctx = panelCanvas.getContext('2d');
const panelTex = new THREE.CanvasTexture(panelCanvas); panelTex.colorSpace = THREE.SRGBColorSpace;
const panelMat = new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), panelMat); scene.add(panel);
const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12 * 4), 4));
const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const beam = new THREE.Mesh(beamGeo, beamMat); beam.frustumCulled = false; scene.add(beam);
const BEAM_SRC = new THREE.Vector3();

// ---------- petit bonhomme Claude (bloc orange, yeux noirs, bras, 4 pattes) ----------
const clawdM = new THREE.MeshStandardMaterial({ color: CLAUDE_ORANGE, emissive: CLAUDE_ORANGE, emissiveIntensity: 0.12, flatShading: true, roughness: 0.7 });
const clawdEyeM = new THREE.MeshStandardMaterial({ color: '#141010', roughness: 0.4 });
const clawd = new THREE.Group(); clawd.position.set(0.42, 0.745, -0.1); room.add(clawd);
const clawdBody = new THREE.Group(); clawd.add(clawdBody); // pivot au sol pour l'ecrasement
box(0.2, 0.13, 0.13, clawdM, 0, 0.1, 0, clawdBody);
const clawdEyes = [-1, 1].map(s => { const e = box(0.02, 0.042, 0.01, clawdEyeM, s * 0.05, 0.125, 0.066, clawdBody); return e; });
const clawdArms = [-1, 1].map(s => {
  const g = new THREE.Group(); g.position.set(s * 0.1, 0.085, 0); clawdBody.add(g);
  box(0.04, 0.04, 0.06, clawdM, s * 0.02, 0, 0, g); return g;
});
const clawdLegs = [-0.075, -0.035, 0.035, 0.075].map(x => box(0.022, 0.035, 0.05, clawdM, x, 0.0175, 0, clawdBody));
const CLAWD_BLINKS = [1.5, 5.6, 10.2, 13.0, 16.6, 18.9];
function hop(t, t0, h = 0.035, d = 0.34) { const u = (t - t0) / d; return u > 0 && u < 1 ? h * Math.sin(Math.PI * u) : 0; }
function squash(t, t0) { const u = (t - t0 + 0.08) / 0.08; return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0; }
function poseClawd(t, warmK, dim) {
  // orientation : vers l'homme quand il l'ecoute, vers l'avant quand il travaille
  clawd.rotation.y = kf(t, [[0, -0.6], [2.8, -0.6], [3.15, 0.0], [4.0, 0.0], [4.3, -0.7], [6.6, -0.7], [6.85, 0.0], [7.5, 0.0], [7.75, -0.7],
    [11.4, -0.7], [12.0, -1.0], [14.0, -1.0], [14.4, -0.9], [19.0, -0.9], [19.4, -0.5]]);
  const hops = [4.1, 7.6, 14.2, 15.8, 17.6, 19.2];
  let y = 0, sq = 0;
  for (const h0 of hops) { y += hop(t, h0, h0 === 19.2 ? 0.05 : 0.03); sq = Math.max(sq, squash(t, h0)); }
  clawdBody.position.y = y;
  const breath = 1 + 0.025 * Math.sin(t * 2.6);
  clawdBody.scale.set(1 + sq * 0.08, breath - sq * 0.12, 1 + sq * 0.08);
  clawdLegs.forEach((l, i) => { l.rotation.x = y * 12 * (i % 2 ? 1 : -1); });
  // bras : agitation quand il travaille, bras leves a la fin
  const work = (t > 3.1 && t < 4.0) || (t > 6.85 && t < 7.55) ? 1 : 0;
  const joy = ramp(t, 19.15, 19.35) * (1 - ramp(t, 19.8, 20.2));
  clawdArms.forEach((a, i) => {
    a.rotation.x = work * Math.sin(t * 32 + i * 2) * 0.7;
    a.rotation.z = (i ? 1 : -1) * (joy * 0.9 + 0.15 * Math.sin(t * 2.6 + i));
  });
  let blink = 0; for (const b of CLAWD_BLINKS) blink = Math.max(blink, 1 - Math.abs(t - b) / 0.08);
  clawdEyes.forEach(e => { e.scale.y = 1 - 0.85 * clamp(blink); });
  clawdM.emissiveIntensity = 0.38 * (0.5 + 0.5 * dim) + 0.15 * warmK;
  clawd.updateMatrixWorld(true);
  clawdBody.localToWorld(BEAM_SRC.set(0, 0.17, 0));
}

// ---------- ville + pluie ----------
const sky = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#060914'); g.addColorStop(0.55, '#141a3a'); g.addColorStop(0.8, '#2a2550'); g.addColorStop(1, '#3a2c55');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), new THREE.MeshBasicMaterial({ map: t, fog: false }));
  m.position.set(0, 50, -90); scene.add(m);
  const m2 = m.clone(); m2.position.set(-90, 50, 0); m2.rotation.y = Math.PI / 2; scene.add(m2);
  return m;
})();
function windowTexture(seed) {
  const r = rng(seed); const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) {
    const v = r(); if (v < 0.72) continue;
    x.fillStyle = v > 0.95 ? '#ffe9b8' : v > 0.86 ? '#ffc477' : v > 0.8 ? '#9fb8ff' : '#3a4462';
    x.fillRect(i * 8 + 2, j * 8 + 2, 4, 5);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; return t;
}
const winTex = [1, 2, 3, 4].map(windowTexture);
const cityR = rng(99);
function building(x, z, w, d, h) {
  const tex = winTex[Math.floor(cityR() * 4)].clone(); tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 3.2)), Math.max(1, Math.round(h / 6.4)));
  const m = new THREE.MeshStandardMaterial({ color: '#0f1528', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.45, flatShading: true, roughness: 0.9 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, h / 2 - 15, z); scene.add(b);
}
for (let i = 0; i < 38; i++) { // devant (z negatif)
  const z = -18 - cityR() * 60, x = (cityR() - 0.5) * 120;
  building(x, z, 4 + cityR() * 7, 4 + cityR() * 7, 8 + cityR() * 26 + (z < -45 ? 14 : 0));
}
for (let i = 0; i < 22; i++) { // a gauche
  const x = -18 - cityR() * 55, z = (cityR() - 0.6) * 70;
  building(x, z, 4 + cityR() * 7, 4 + cityR() * 7, 8 + cityR() * 28);
}
// pluie sur la vitre et dehors
const dropGeo = new THREE.PlaneGeometry(1, 1);
const glassRain = new THREE.InstancedMesh(dropGeo, new THREE.MeshBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }), 900);
const glassDrops = []; const gr = rng(5);
for (let i = 0; i < 900; i++) glassDrops.push({ x: (gr() - 0.5) * 5.4, y0: gr() * 2.3, sp: 0.15 + gr() * 0.5, len: 0.02 + gr() * 0.06, w: 0.002 + gr() * 0.002, side: gr() < 0.35 });
scene.add(glassRain);
const airRain = new THREE.InstancedMesh(dropGeo, new THREE.MeshBasicMaterial({ color: '#9fb4e0', transparent: true, opacity: 0.22, depthWrite: false, fog: false, toneMapped: false }), 1600);
const airDrops = []; const ar = rng(11);
for (let i = 0; i < 1600; i++) airDrops.push({ x: (ar() - 0.5) * 12, z: -2.2 - ar() * 6, y0: ar() * 8, sp: 7 + ar() * 3, side: ar() < 0.3 });
scene.add(airRain);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function updateRain(t, k) {
  const nG = Math.floor(900 * k), nA = Math.floor(1600 * k);
  glassRain.count = nG; airRain.count = nA;
  for (let i = 0; i < nG; i++) {
    const d = glassDrops[i]; const y = 2.55 - ((d.y0 + d.sp * t) % 2.3);
    if (d.side) { tmpP.set(LEFT + 0.07, y, -1.4 + (d.x + 2.7) * 0.85); tmpQ.setFromAxisAngle(UP, Math.PI / 2); }
    else { tmpP.set(d.x, y, BACK + 0.07); tmpQ.identity(); }
    tmpS.set(d.w, d.len, 1); tmpM.compose(tmpP, tmpQ, tmpS); glassRain.setMatrixAt(i, tmpM);
  }
  for (let i = 0; i < nA; i++) {
    const d = airDrops[i]; const y = 7 - ((d.y0 + d.sp * t) % 8) - 1;
    if (d.side) { tmpP.set(LEFT - 0.4 - (-d.z - 2.2), y, d.x * 0.6); tmpQ.setFromAxisAngle(UP, Math.PI / 2); }
    else { tmpP.set(d.x, y, d.z); tmpQ.identity(); }
    tmpS.set(0.008, 0.35, 1); tmpM.compose(tmpP, tmpQ, tmpS); airRain.setMatrixAt(i, tmpM);
  }
  glassRain.instanceMatrix.needsUpdate = true; airRain.instanceMatrix.needsUpdate = true;
}

// ---------- lumieres ----------
const hemi = new THREE.HemisphereLight('#4a5c9a', '#1a1218', 0.9); scene.add(hemi);
const moon = new THREE.DirectionalLight('#8aa2e6', 1.6); moon.position.set(-2.5, 4, -6); moon.target.position.set(0, 1, -0.5);
moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -3, right: 3, top: 3, bottom: -1, near: 1, far: 14 });
moon.shadow.bias = -0.0005; scene.add(moon, moon.target);
const screenLight = new THREE.SpotLight('#bcd8ff', 1.6, 3, 0.9, 0.6, 1.5);
screenLight.position.set(0.06, 0.9, -0.16); screenLight.target.position.set(0, 1.2, -0.7);
screenLight.castShadow = true; screenLight.shadow.mapSize.set(1024, 1024); screenLight.shadow.bias = -0.001;
scene.add(screenLight, screenLight.target);
const panelLight = new THREE.PointLight('#4fd0ff', 0, 2.2, 1.6); scene.add(panelLight);
const lampLight = new THREE.PointLight('#ffb468', 1.4, 4, 1.5); lampLight.position.set(2.55, 1.45, -0.25); scene.add(lampLight);
const warmLight = new THREE.PointLight('#ffb27a', 0, 2.5, 1.5); warmLight.position.set(0.3, 1.1, 0.0); scene.add(warmLight);

// ---------- contenu du hologramme ----------
const CYAN = '#7fe3ff';
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function drawPanel(t, mode, k) {
  const c = pctx; c.clearRect(0, 0, 840, 600);
  const warm = mode === 'warm';
  const line = warm ? '#ffb184' : CYAN;
  c.globalAlpha = 1;
  c.fillStyle = warm ? 'rgba(38,16,10,0.8)' : 'rgba(6,22,40,0.8)'; rrect(c, 6, 6, 828, 588, 26); c.fill();
  c.lineWidth = 4; c.strokeStyle = line; rrect(c, 6, 6, 828, 588, 26); c.stroke();
  // scanlines
  c.fillStyle = warm ? 'rgba(255,170,120,0.05)' : 'rgba(127,227,255,0.05)';
  for (let y = 10; y < 590; y += 6) c.fillRect(10, y, 820, 2);
  drawSpark(c, 62, 62, 46, CLAUDE_ORANGE);
  c.fillStyle = '#ffffff'; c.font = '600 34px Inter'; c.textBaseline = 'middle';
  c.fillText(ASSISTANT.name, 100, 64);
  if (mode === 'factures' || mode === 'relances') {
    const rows = mode === 'factures'
      ? [['FA-118', 'Atelier Morel', '1 450 €'], ['FA-119', 'Cabinet Vidal', '2 300 €'], ['FA-120', 'Maison Roux', '890 €']]
      : [['Atelier Morel', 'Échéance +12 j', ''], ['Cabinet Vidal', 'Échéance +8 j', ''], ['Maison Roux', 'Échéance +5 j', '']];
    c.fillStyle = line; c.font = '600 30px Inter';
    c.fillText(mode === 'factures' ? 'Factures du mois' : 'Relances clients', 40, 140);
    rows.forEach((r, i) => {
      const y = 205 + i * 92;
      const done = k[i];
      c.globalAlpha = 0.9; c.strokeStyle = 'rgba(127,227,255,0.35)'; c.lineWidth = 2; rrect(c, 30, y - 36, 780, 76, 14); c.stroke();
      c.globalAlpha = 1; c.fillStyle = '#e8f7ff'; c.font = '500 28px Inter';
      c.fillText(r[0], 52, y); c.fillStyle = 'rgba(232,247,255,0.7)';
      c.fillText(r[1], mode === 'factures' ? 200 : 290, y);
      if (r[2]) { c.fillStyle = '#e8f7ff'; c.fillText(r[2], 440, y); }
      const ok = done > 0.5;
      const pw = 190, px = 600;
      c.fillStyle = ok ? `rgba(70,220,130,${0.25 + 0.2 * done})` : 'rgba(160,180,200,0.18)';
      rrect(c, px, y - 22, pw, 44, 22); c.fill();
      c.fillStyle = ok ? '#6dffa8' : 'rgba(220,235,245,0.75)'; c.font = '600 24px Inter';
      const label = ok ? (mode === 'factures' ? 'Envoyée' : 'Envoyée') : (mode === 'factures' ? 'À faire' : 'En retard');
      c.textAlign = 'center'; c.fillText((ok ? '✓ ' : '') + label, px + pw / 2, y + 1); c.textAlign = 'left';
    });
    const fin = k[3];
    if (fin > 0) {
      c.globalAlpha = fin; c.fillStyle = '#ffffff'; c.font = '600 50px Inter'; c.textAlign = 'center';
      c.fillText(mode === 'factures' ? 'Fini.' : 'Envoyé.', 420, 520); c.textAlign = 'left'; c.globalAlpha = 1;
    }
  } else if (mode === 'vide') {
    c.fillStyle = 'rgba(232,247,255,0.8)'; c.font = '500 34px Inter'; c.textAlign = 'center';
    c.fillText('Aucune tâche en attente.', 420, 320); c.textAlign = 'left';
  } else if (warm) {
    const pulse = 0.85 + 0.15 * Math.sin(t * 3);
    c.save(); c.shadowColor = CLAUDE_ORANGE; c.shadowBlur = 50 * pulse;
    drawSpark(c, 420, 300, 190, CLAUDE_ORANGE); c.restore();
  }
  panelTex.needsUpdate = true;
}
function drawScreen(warmK) {
  const c = screenCanvas.getContext('2d');
  c.fillStyle = warmK > 0 ? `rgb(${lerp(28, 52, warmK)},${lerp(30, 34, warmK)},${lerp(36, 30, warmK)})` : '#1c1e24';
  c.fillRect(0, 0, 512, 330);
  c.fillStyle = '#2a2d35'; c.fillRect(0, 0, 120, 330);
  drawSpark(c, 256, 120, 50, CLAUDE_ORANGE);
  c.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 4; i++) c.fillRect(170, 180 + i * 22, 180 - i * 30, 8);
  c.fillStyle = '#34373f'; c.fillRect(150, 280, 220, 30);
  screenTex.needsUpdate = true;
}

// ---------- timeline ----------
// Plans : [debut, fin, posA, cibleA, posB, cibleB, fov]
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SHOTS = [
  [0, 3.0, V(1.05, 1.36, 1.42), V(0.08, 1.02, -0.55), V(0.95, 1.35, 1.28), V(0.08, 1.02, -0.55), 46],
  [3.0, 5.0, V(0.48, 1.06, 1.08), V(0.5, 1.05, -0.15), V(0.48, 1.07, 0.96), V(0.5, 1.05, -0.15), 52],
  [5.0, 9.0, V(0.2, 1.32, 1.55), V(0.32, 1.12, -0.45), V(0.22, 1.31, 1.4), V(0.32, 1.12, -0.45), 52],
  [9.0, 12.0, V(2.0, 1.8, 3.0), V(-0.2, 0.95, -0.8), V(1.6, 1.65, 2.45), V(-0.2, 0.97, -0.8), 48],
  [12.0, 14.0, null, null, null, null, 30, { dist: [0.4, 0.34], side: [0.05, 0.04], lift: [0.005, 0.005], aim: 0.012 }],
  [14.0, 15.7, V(0.34, 1.25, 1.35), V(0.3, 1.16, -0.5), V(0.32, 1.25, 1.22), V(0.3, 1.17, -0.5), 55],
  [15.7, 17.6, V(-0.2, 0.97, 0.4), V(0.42, 0.96, -0.1), V(-0.11, 0.95, 0.32), V(0.42, 0.96, -0.1), 44],
  [17.6, 19.0, V(0.3, 1.26, 0.98), V(0.2, 1.17, -0.5), V(0.27, 1.27, 0.86), V(0.2, 1.18, -0.5), 50],
  [19.0, 22.0, null, null, null, null, 36, { dist: [1.0, 0.8], side: [0.28, 0.2], lift: [0.03, 0.02], aim: -0.02 }],
];
// L'animation est ecrite sur une base de 22 s ; les voix ElevenLabs imposent 25 s.
// WARP associe le temps final (voix) au temps d'animation : [final, animation].
const WARP = [[0, 0], [3.3, 3.0], [5.3, 5.0], [9, 9], [12, 12], [14.7, 14], [16.1, 15.7], [18.6, 17.6], [21.4, 19.0], [22.2, 19.6], [25, 22]];
function warp(t) {
  for (let i = 1; i < WARP.length; i++) {
    const [a0, b0] = WARP[i - 1], [a1, b1] = WARP[i];
    if (t <= a1) return b0 + (b1 - b0) * (t - a0) / (a1 - a0);
  }
  return WARP[WARP.length - 1][1];
}
// Repliques en temps final, calees sur voices/*.mp3 : [debut, fin, qui, texte, voixBasse]
const LINES = [
  [0.3, 3.15, 'lui', 'Claude… j’ai la flemme de faire mes factures.'],
  [4.4, 5.2, 'claude', 'Fini.'],
  [5.6, 6.85, 'lui', 'Et les relances clients…'],
  [7.55, 8.6, 'claude', 'Envoyé.'],
  [12.2, 14.6, 'lui', 'Mais du coup… je sers à quoi, moi ?', true],
  [14.95, 15.95, 'claude', 'Je fais les tâches.'],
  [16.11, 19.32, 'claude', 'Toi, tu serres la main du client, tu décides où on va,'],
  [19.47, 21.45, 'claude', 'tu es celui pour qui tout ça existe.'],
];
const MOUTH_GAPS = [[13.0, 13.31]]; // pause apres "Mais du coup..."
const BLINKS = [2.2, 6.4, 8.7, 12.25, 15.9, 18.3, 20.6];

function mouthOpen(t) {
  if (MOUTH_GAPS.some(([a, b]) => t > a && t < b)) return 0;
  for (const [a, b, who, , low] of LINES) {
    if (who !== 'lui' || t < a || t > b) continue;
    const env = ramp(t, a, a + 0.08) * (1 - ramp(t, b - 0.12, b));
    const v = 0.5 + 0.5 * Math.sin(t * 21) * Math.sin(t * 7.3 + 1);
    return env * (low ? 0.55 : 1) * (0.35 + 0.65 * Math.abs(v));
  }
  return 0;
}

const headWorld = new THREE.Vector3();
function poseCharacter(t) {
  const sigh = Math.exp(-Math.pow((t - 0.9) / 0.35, 2)) - 0.6 * Math.exp(-Math.pow((t - 1.6) / 0.4, 2));
  const breath = Math.sin(t * 1.6) * 0.012;
  const lean = kf(t, [[0, 0.3], [5.0, 0.3], [5.9, 0.1], [9.0, 0.1], [11.8, 0.2], [14.2, 0.22], [15.3, 0.08]]) - sigh * 0.06 + breath;
  torso.rotation.set(lean, 0, kf(t, [[0, 0.06], [5.0, 0.06], [5.9, 0]]));
  torso.position.y = sigh * 0.012;
  const pitch = kf(t, [[0, 0.12], [5.0, 0.12], [5.9, -0.02], [9.0, 0.0], [11.8, 0.16], [12.0, 0.2], [14.2, 0.22], [15.3, 0.0], [19.0, -0.02]]) + sigh * -0.05;
  const yaw = kf(t, [[0, 0.1], [5.0, 0.1], [6.0, 0.0], [7.3, 0.0], [7.9, 0.38], [9.0, 0.32], [10.5, 0.0], [14.2, 0.0], [15.0, 0.12], [19.0, 0.08], [20.0, 0.0]]);
  const roll = kf(t, [[0, 0.26], [5.0, 0.26], [5.9, 0.02], [9.0, 0.0]]);
  neck.rotation.set(pitch * 0.4, yaw * 0.4, roll * 0.4);
  head.rotation.set(pitch * 0.6, yaw * 0.6, roll * 0.6);

  // visage
  const sad = kf(t, [[0, 0.3], [5.0, 0.3], [6.0, 0.0], [9.5, 0.0], [12.0, 0.8], [14.0, 0.9], [16.0, 0.2], [19.0, 0.0]]);
  const smile = kf(t, [[0, 0], [19.0, 0], [19.7, 1]]);
  let blink = 0; for (const b of BLINKS) blink = Math.max(blink, 1 - Math.abs(t - b) / 0.09);
  const lazy = kf(t, [[0, 0.35], [5.0, 0.35], [5.8, 0.05], [12.0, 0.2], [14.2, 0.3], [15.2, 0.0]]);
  const lookX = kf(t, [[0, 0.0], [7.3, 0.0], [7.7, 0.006], [10.0, 0.0]]);
  for (const e of eyes) {
    e.lid.scale.y = Math.max(clamp(blink, 0, 1), lazy);
    e.lid.position.y = 0.012;
    e.brow.rotation.z = -e.s * sad * 0.35 + e.s * smile * 0.05;
    e.brow.position.y = 0.024 + sad * 0.004 + smile * 0.003;
    e.pupil.position.x = lookX; e.glint.position.x = 0.003 + lookX;
  }
  const mo = mouthOpen(TN);
  mouth.scale.set(1 - smile * 0.1, 1 + mo * 2.2, 1);
  corners.forEach((cn, i) => { const s = i ? 1 : -1; cn.rotation.z = s * (smile * 0.55 - sad * 0.3); cn.position.y = 0.07 + smile * 0.004 - sad * 0.002; cn.position.x = s * (0.022 + smile * 0.002); });

  char.updateMatrixWorld(true);
  // bras : main droite (-x) sous la joue au debut, puis a plat sur le bureau
  const cheek = new THREE.Vector3(-0.07, 0.03, 0.05); head.localToWorld(cheek);
  const handOnCheek = 1 - ramp(t, 5.0, 5.8);
  for (const a of arms) {
    const S = new THREE.Vector3(a.s * 0.19, 0.45, 0); torso.localToWorld(S);
    let target, pole;
    if (a.s < 0) {
      const desk = V(-0.2, 0.775, -0.3);
      target = new THREE.Vector3().lerpVectors(desk, cheek, handOnCheek);
      pole = new THREE.Vector3(-0.3, -1, 0.6 * handOnCheek);
    } else {
      target = V(0.2 + Math.sin(t * 0.7) * 0.004, 0.775, -0.28);
      pole = V(0.4, -1, 0);
    }
    const { elbow, wrist } = ik(S, target, 0.28, 0.25, pole.normalize());
    place(a.upper, S, elbow); place(a.fore, elbow, wrist);
    a.hand.position.copy(wrist);
    const dir = new THREE.Vector3().subVectors(wrist, elbow).normalize();
    a.hand.quaternion.setFromUnitVectors(UP, dir);
    if (a.s < 0 && handOnCheek > 0.5) a.hand.rotateY(Math.PI / 2);
    else a.hand.rotateY(0);
  }
  for (const [i, l] of legs.entries()) {
    const s = i ? 1 : -1;
    const hip = V(s * 0.09, 0.5, -0.66), knee = V(s * 0.11, 0.52, -0.22), foot = V(s * 0.12, 0.06, -0.16);
    place(l.thigh, hip, knee); place(l.shin, knee, foot); l.shoe.position.set(s * 0.12, 0.035, -0.12);
  }
  head.getWorldPosition(headWorld);
}

// ---------- sous-titres et overlays ----------
const grain = [0, 1, 2, 3].map(i => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const id = x.createImageData(256, 256); const r = rng(100 + i);
  for (let p = 0; p < id.data.length; p += 4) { const v = r() * 255; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255; }
  x.putImageData(id, 0, 0); return c;
});
function wrapLines(ctx, text, maxW) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const w of words) { const test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur); return lines;
}
const CAP_Y = 400; // haut du bloc, sous la zone morte du haut (220 px Reels, 160 px TikTok)
function drawCaption(ctx, t) {
  for (const [a, b, who, text] of LINES) {
    if (t < a - 0.01 || t > b + 0.15) continue;
    const k = ramp(t, a, a + 0.14) * (1 - ramp(t, b, b + 0.15));
    ctx.save(); ctx.globalAlpha = k;
    const dy = (1 - k) * 10;
    ctx.font = '500 48px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.letterSpacing = '-0.5px';
    const lines = wrapLines(ctx, text, 780);
    let y = CAP_Y + dy;
    if (who === 'claude') {
      ctx.font = '600 32px Inter';
      const lw = ctx.measureText(ASSISTANT.name).width;
      drawSpark(ctx, 540 - lw / 2 - 10, y + 17, 34, CLAUDE_ORANGE);
      ctx.fillStyle = CLAUDE_ORANGE; ctx.textAlign = 'left'; ctx.fillText(ASSISTANT.name, 540 - lw / 2 + 14, y);
      ctx.textAlign = 'center'; y += 52;
    }
    ctx.font = '500 48px Inter';
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    for (const l of lines) { ctx.fillText(l, 540, y); y += 60; }
    ctx.restore();
  }
}
function drawEnd(ctx, t) {
  const k = ramp(t, 19.6, 20.4);
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k * 0.94; ctx.fillStyle = logoBg; ctx.fillRect(0, 0, W, H);
  const lk = ramp(t, 19.9, 20.7);
  ctx.globalAlpha = lk;
  if (logoImg) { // logo clair sur fond sombre : 'lighten' fond le fond du fichier dans celui de fin
    const dw = BRAND.logoWidth, dh = dw * logoImg.naturalHeight / logoImg.naturalWidth;
    ctx.globalCompositeOperation = 'lighten';
    ctx.drawImage(logoImg, (W - dw) / 2, 760 - dh / 2 - (1 - lk) * 8, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.font = '600 64px Inter'; ctx.letterSpacing = '14px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = BRAND.text; ctx.fillText(BRAND.name, 540, 760 - (1 - lk) * 8);
  }
  const ck = ramp(t, 20.3, 20.9);
  ctx.globalAlpha = ck; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '600 50px Inter'; ctx.letterSpacing = '-0.5px';
  const y0 = 1010 + (1 - ck) * 10;
  const cta = BRAND.cta[VARIANT] || BRAND.cta.reels;
  cta.lines.forEach((parts, i) => drawMixed(ctx, parts.map(([txt, c]) => [txt, BRAND[c] || c]), 540, y0 + i * 64));
  if (cta.note) {
    ctx.font = '500 32px Inter'; ctx.fillStyle = BRAND.muted;
    ctx.fillText(cta.note, 540, y0 + cta.lines.length * 64 + 32);
  }
  ctx.restore();
}
function drawMixed(ctx, parts, cx, y) {
  const total = parts.reduce((s, [txt]) => s + ctx.measureText(txt).width, 0);
  let x = cx - total / 2; ctx.textAlign = 'left';
  for (const [txt, col] of parts) { ctx.fillStyle = col; ctx.fillText(txt, x, y); x += ctx.measureText(txt).width; }
  ctx.textAlign = 'center';
}

// ---------- image ----------
let lastScreenWarm = -1;
let TN = 0; // temps final (voix, sous-titres) ; t = temps d'animation
function frame(tn) {
  TN = tn;
  const t = warp(tn);
  const dim = 1 - 0.62 * ramp(t, 9.3, 11.6) + 0.62 * ramp(t, 14.0, 15.2);
  const warmK = ramp(t, 14.0, 15.2);
  const rainK = 0.45 + 0.55 * ramp(t, 9.0, 11.0) - 0.2 * ramp(t, 15, 18);

  poseCharacter(t);
  poseClawd(t, warmK, dim);
  updateRain(t, rainK);

  // camera
  const sh = SHOTS.find(s => t >= s[0] && t < s[1]) || SHOTS[SHOTS.length - 1];
  const p = smooth((t - sh[0]) / (sh[1] - sh[0])) * 0.6 + ((t - sh[0]) / (sh[1] - sh[0])) * 0.4;
  let tgt;
  if (sh[7]) { // plan cale sur le visage
    const f = sh[7], q = head.getWorldQuaternion(new THREE.Quaternion());
    const eye = head.localToWorld(V(0, 0.128, 0.1));
    const fwd = V(0, 0, 1).applyQuaternion(q).setY(0).normalize(), up = V(0, 1, 0), side = V(fwd.z, 0, -fwd.x);
    camera.position.copy(eye).addScaledVector(fwd, lerp(f.dist[0], f.dist[1], p)).addScaledVector(side, lerp(f.side[0], f.side[1], p)).addScaledVector(up, lerp(f.lift[0], f.lift[1], p));
    tgt = eye.clone().addScaledVector(up, f.aim);
  } else {
    camera.position.lerpVectors(sh[2], sh[4], p);
    tgt = new THREE.Vector3().lerpVectors(sh[3], sh[5], p);
  }
  const hand = sh[0] === 12.0 ? 0.0015 : 0.004; // leger mouvement camera epaule
  camera.position.x += Math.sin(t * 1.3) * hand + Math.sin(t * 2.7) * hand * 0.4;
  camera.position.y += Math.sin(t * 1.7 + 1) * hand * 0.7;
  camera.fov = sh[6]; camera.updateProjectionMatrix(); camera.lookAt(tgt);

  // lumieres
  hemi.intensity = 0.9 * (0.45 + 0.55 * dim);
  moon.intensity = 1.6 * (0.55 + 0.45 * dim);
  lampLight.intensity = 1.4 * dim * (1 - 0.3 * warmK) + 0.2;
  lampShade.material.emissiveIntensity = 1.4 * (0.3 + 0.7 * dim);
  const speakFlicker = 1;
  screenLight.color.set('#cfe6ff').lerp(new THREE.Color('#ffb07a'), warmK);
  screenLight.intensity = 1.6 * (0.35 + 0.65 * dim) * speakFlicker + 2 * warmK;
  warmLight.intensity = 0.9 * warmK;
  renderer.toneMappingExposure = 1.05 * (0.8 + 0.2 * dim);

  // hologramme
  let mode = 'off', vis = 0, k = [0, 0, 0, 0];
  if (t >= 2.6 && t < 7.3) {
    mode = 'factures'; vis = ramp(t, 2.6, 3.0);
    k = [ramp(t, 3.25, 3.35), ramp(t, 3.55, 3.65), ramp(t, 3.85, 3.95), ramp(t, 4.05, 4.25)];
    if (t > 5.0) { mode = 'factures'; }
  }
  if (t >= 6.2 && t < 9.4) {
    mode = 'relances'; vis = 1;
    k = [ramp(t, 6.9, 7.0), ramp(t, 7.15, 7.25), ramp(t, 7.4, 7.5), ramp(t, 7.55, 7.75)];
  }
  if (t >= 9.4 && t < 14.0) { mode = 'vide'; vis = 1 - ramp(t, 10.6, 11.4); }
  if (t >= 14.0) { mode = 'warm'; vis = ramp(t, 14.0, 14.6) * (1 - ramp(t, 19.6, 20.2)); }
  // petit scintillement a l'apparition
  if (t >= 2.6 && t < 3.0) vis *= 0.6 + 0.4 * (Math.sin(t * 90) > 0 ? 1 : 0);
  if (vis > 0.001) drawPanel(t, mode, k);
  panel.visible = beam.visible = vis > 0.001;
  panelMat.opacity = vis;
  panel.position.set(0.47, 1.22, -0.2);
  panel.lookAt(camera.position.x, panel.position.y, camera.position.z);
  panelLight.position.copy(panel.position);
  panelLight.color.set(mode === 'warm' ? '#ff9a5c' : '#4fd0ff');
  panelLight.intensity = 1.2 * vis;
  // faisceau : pyramide du laptop vers les coins du panneau
  panel.updateMatrixWorld(true);
  const corners4 = [V(-0.21, -0.15, 0), V(0.21, -0.15, 0), V(0.21, 0.15, 0), V(-0.21, 0.15, 0)].map(v => v.applyMatrix4(panel.matrixWorld));
  const pos = beamGeo.attributes.position.array, col = beamGeo.attributes.color.array;
  const bc = mode === 'warm' ? [1, 0.55, 0.3] : [0.35, 0.85, 1];
  for (let f = 0; f < 4; f++) {
    const a = corners4[f], b = corners4[(f + 1) % 4];
    const tri = [BEAM_SRC, a, b];
    tri.forEach((v, j) => {
      const idx = f * 3 + j; pos[idx * 3] = v.x; pos[idx * 3 + 1] = v.y; pos[idx * 3 + 2] = v.z;
      const al = (j === 0 ? 0.32 : 0.04) * vis;
      col[idx * 4] = bc[0]; col[idx * 4 + 1] = bc[1]; col[idx * 4 + 2] = bc[2]; col[idx * 4 + 3] = al;
    });
  }
  beamGeo.attributes.position.needsUpdate = true; beamGeo.attributes.color.needsUpdate = true;
  const sw = Math.round(warmK * 20) / 20;
  if (sw !== lastScreenWarm) { drawScreen(sw); lastScreenWarm = sw; }
  screenMat.color.setScalar(0.45 + 0.55 * dim);

  renderer.render(scene, camera);

  // composition 2D
  octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';
  octx.drawImage(renderer.domElement, 0, 0);
  // vignette
  const g = octx.createRadialGradient(540, 900, 300, 540, 960, 1250);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.55 + 0.2 * (1 - dim)})`);
  octx.fillStyle = g; octx.fillRect(0, 0, W, H);
  // grain
  octx.globalAlpha = 0.045; octx.globalCompositeOperation = 'overlay';
  octx.fillStyle = octx.createPattern(grain[Math.floor(t * 30) % 4], 'repeat'); octx.fillRect(0, 0, W, H);
  octx.globalAlpha = 1; octx.globalCompositeOperation = 'source-over';
  drawCaption(octx, tn);
  drawEnd(octx, t);
}

window.renderAt = (t, quality = 0.95) => { frame(t); return out.toDataURL('image/jpeg', quality).split(',')[1]; };
window.overlayZones = false;
await loadAssets();
drawScreen(0);
window.DURATION = DURATION;
window.ready = true;

