// Farm models: pumpkins, plots, apple trees, corn, barn, stands, tractor, etc.
// Small items are ONE merged mesh with vertex colors so hundreds stay cheap on phones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, box, cyl, rbox, COLORS } from './models';
import { model, has } from './assets';

type Part = { geo: THREE.BufferGeometry; color: number; pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] };

export function build(parts: Part[]) {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...(p.pos ?? [0, 0, 0])), q, new THREE.Vector3(...(p.scale ?? [1, 1, 1])));
    g.applyMatrix4(m);
    const c = new THREE.Color(p.color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const merged = mergeGeometries(geos, false)!;
  merged.computeBoundingSphere();
  return merged;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (rt: number, rb: number, h: number, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const S = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const I = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);

export const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const vcSmooth = new THREE.MeshLambertMaterial({ vertexColors: true });

function vmesh(geo: THREE.BufferGeometry, m: THREE.Material = vcMat) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

// ---------------- Coins ----------------
export const coinGeo = build([
  { geo: C(0.17, 0.17, 0.05, 12), color: 0xffc727, rot: [Math.PI / 2, 0, 0] },
  { geo: C(0.11, 0.11, 0.06, 10), color: 0xffe066, rot: [Math.PI / 2, 0, 0] },
]);
export const coinMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x553300 });

// ---------------- Pumpkin ----------------
// Built in light greys so material.color can tint it (green while growing -> orange when ripe).
function pumpkinParts(): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push({ geo: S(0.2, 9, 7), color: i % 2 ? 0xffffff : 0xe6e6e6, pos: [Math.cos(a) * 0.075, 0.17, Math.sin(a) * 0.075], rot: [0, -a, 0], scale: [1.05, 0.85, 0.62] });
  }
  parts.push({ geo: C(0.03, 0.045, 0.14, 6), color: 0x3a3a3a, pos: [0, 0.36, 0], rot: [0, 0, 0.25] });
  parts.push({ geo: B(0.16, 0.02, 0.09), color: 0x6a6a6a, pos: [0.08, 0.33, 0.02], rot: [0, 0.4, -0.3] });
  return parts;
}
export const pumpkinGeo = build(pumpkinParts());
export const PUMPKIN_ORANGE = 0xff8c1a;
export const PUMPKIN_GREEN = 0x8fd14f;
export const pumpkinMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: PUMPKIN_ORANGE });
function proc_makePumpkin(m: THREE.Material = pumpkinMat) {
  return vmesh(pumpkinGeo, m);
}

// ---------------- Apple / cider / pie ----------------
export const appleGeo = build([
  { geo: S(0.12, 9, 7), color: 0xe8352b, pos: [0, 0.12, 0], scale: [1, 0.92, 1] },
  { geo: S(0.06, 6, 4), color: 0xff7a6b, pos: [-0.05, 0.16, 0.07] },
  { geo: C(0.012, 0.015, 0.08, 4), color: 0x6b4423, pos: [0, 0.25, 0] },
  { geo: B(0.08, 0.01, 0.04), color: 0x4caf50, pos: [0.04, 0.25, 0], rot: [0, 0, 0.4] },
]);
function proc_makeApple() { return vmesh(appleGeo, vcSmooth); }

export const ciderGeo = build([
  { geo: C(0.15, 0.16, 0.3, 10), color: 0xd98a2b, pos: [0, 0.15, 0] },
  { geo: C(0.155, 0.165, 0.11, 10), color: 0xfff1d0, pos: [0, 0.16, 0] },
  { geo: C(0.07, 0.15, 0.08, 10), color: 0xd98a2b, pos: [0, 0.34, 0] },
  { geo: C(0.05, 0.05, 0.06, 8), color: 0xc0392b, pos: [0, 0.4, 0] },
  { geo: new THREE.TorusGeometry(0.07, 0.022, 5, 8, Math.PI), color: 0xd98a2b, pos: [0.13, 0.27, 0], rot: [0, 0, -Math.PI / 2] },
  { geo: S(0.035, 6, 4), color: 0xe8352b, pos: [0, 0.16, 0.16] },
]);
function proc_makeCider() { return vmesh(ciderGeo); }

export const pieGeo = build([
  { geo: C(0.25, 0.2, 0.1, 14), color: 0xd9a05b, pos: [0, 0.05, 0] },
  { geo: C(0.21, 0.21, 0.02, 14), color: 0xd0651a, pos: [0, 0.1, 0] },
  { geo: new THREE.TorusGeometry(0.22, 0.035, 5, 14), color: 0xf0c27a, pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] },
  { geo: S(0.06, 6, 4), color: 0xffffff, pos: [0, 0.12, 0], scale: [1, 0.5, 1] },
]);
function proc_makePie() { return vmesh(pieGeo); }


// ---------------- Plot (soil + vine) ----------------
export const soilGeo = build([
  { geo: B(1.08, 0.14, 1.08), color: 0x7a4b2a, pos: [0, 0.07, 0] },
  { geo: B(0.96, 0.05, 0.16), color: 0x8f5a33, pos: [0, 0.15, -0.3] },
  { geo: B(0.96, 0.05, 0.16), color: 0x8f5a33, pos: [0, 0.15, 0] },
  { geo: B(0.96, 0.05, 0.16), color: 0x8f5a33, pos: [0, 0.15, 0.3] },
]);
export const vineGeo = build([
  { geo: I(0.2, 0), color: 0x4caf50, pos: [-0.28, 0.2, -0.22], scale: [1.2, 0.45, 1] },
  { geo: I(0.18, 0), color: 0x5cbf4f, pos: [0.3, 0.2, -0.18], scale: [1.1, 0.45, 1.1] },
  { geo: I(0.17, 0), color: 0x43a047, pos: [0.22, 0.2, 0.3], scale: [1.2, 0.4, 1] },
  { geo: I(0.16, 0), color: 0x66c25a, pos: [-0.25, 0.2, 0.28], scale: [1, 0.4, 1.2] },
  { geo: new THREE.TorusGeometry(0.22, 0.02, 4, 10, Math.PI * 1.4), color: 0x558b2f, pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0] },
]);
export const sproutGeo = build([
  { geo: C(0.015, 0.02, 0.18, 4), color: 0x5cbf4f, pos: [0, 0.24, 0] },
  { geo: I(0.07, 0), color: 0x7ed957, pos: [-0.06, 0.33, 0], scale: [1.3, 0.4, 0.8] },
  { geo: I(0.07, 0), color: 0x7ed957, pos: [0.06, 0.33, 0], scale: [1.3, 0.4, 0.8] },
]);

// ---------------- Trees ----------------
function proc_makeAppleTree() {
  const g = new THREE.Group();
  g.add(vmesh(build([
    { geo: C(0.13, 0.2, 1.1, 7), color: 0x8a5a33, pos: [0, 0.55, 0] },
    { geo: C(0.06, 0.09, 0.6, 5), color: 0x8a5a33, pos: [0.2, 1.1, 0], rot: [0, 0, -0.6] },
  ])));
  const canopy = vmesh(build([
    { geo: I(0.95, 1), color: 0x5cbf3f, pos: [0, 1.85, 0] },
    { geo: I(0.65, 1), color: 0x6fcf4a, pos: [0.55, 1.6, 0.25] },
    { geo: I(0.6, 1), color: 0x4fae38, pos: [-0.55, 1.65, -0.15] },
  ]));
  g.add(canopy);
  g.userData.canopy = canopy;
  // apple anchor spots on the canopy surface
  const spots: THREE.Vector3[] = [];
  const dirs = [[0.7, 1.65, 0.75], [-0.6, 1.5, 0.6], [0.1, 1.3, 0.95], [0.95, 1.95, 0.1], [-0.85, 2.0, 0.3], [0.3, 2.4, 0.7], [-0.3, 2.5, 0.55]];
  for (const d of dirs) spots.push(new THREE.Vector3(d[0], d[1], d[2]));
  g.userData.spots = spots;
  return g;
}

const FALL = [0xf28c28, 0xe0522b, 0xf2c12e, 0xd9732b];
export function makeFallTree(scale = 1, color = FALL[0]) {
  const g = new THREE.Group();
  g.add(vmesh(build([
    { geo: C(0.12, 0.18, 1.0, 6), color: 0x7a4f2e, pos: [0, 0.5, 0] },
    { geo: I(0.85, 1), color, pos: [0, 1.6, 0] },
    { geo: I(0.6, 1), color: new THREE.Color(color).offsetHSL(0.02, 0, 0.06).getHex(), pos: [0.45, 1.95, 0.2] },
    { geo: I(0.55, 1), color: new THREE.Color(color).offsetHSL(-0.02, 0, -0.05).getHex(), pos: [-0.45, 1.4, -0.1] },
  ])));
  g.scale.setScalar(scale);
  return g;
}
export const FALL_COLORS = FALL;

function proc_makePine(scale = 1) {
  const g = vmesh(build([
    { geo: C(0.1, 0.14, 0.6, 6), color: 0x7a4f2e, pos: [0, 0.3, 0] },
    { geo: new THREE.ConeGeometry(0.8, 1.4, 7), color: 0x2e8b57, pos: [0, 1.2, 0] },
    { geo: new THREE.ConeGeometry(0.6, 1.1, 7), color: 0x3aa16a, pos: [0, 1.85, 0] },
  ]));
  g.scale.setScalar(scale);
  return g;
}

// ---------------- Corn ----------------
export const cornGeo = build([
  { geo: C(0.035, 0.05, 1.7, 5), color: 0x8bbf4a, pos: [0, 0.85, 0] },
  { geo: B(0.5, 0.02, 0.09), color: 0x7cb342, pos: [0.2, 0.7, 0], rot: [0, 0.3, -0.5] },
  { geo: B(0.5, 0.02, 0.09), color: 0x9ccc65, pos: [-0.2, 1.0, 0.05], rot: [0, -0.4, 0.5] },
  { geo: B(0.45, 0.02, 0.08), color: 0x7cb342, pos: [0.05, 1.3, 0.18], rot: [0.5, 1.4, 0] },
  { geo: C(0.05, 0.04, 0.26, 6), color: 0xffd54f, pos: [0.08, 1.05, 0.03], rot: [0, 0, -0.3] },
  { geo: new THREE.ConeGeometry(0.1, 0.3, 5), color: 0xe0c068, pos: [0, 1.85, 0] },
]);
export const cornMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// ---------------- Props ----------------
export const hayGeo = build([
  { geo: B(0.95, 0.55, 0.6), color: 0xe9c25b, pos: [0, 0.275, 0] },
  { geo: B(0.97, 0.05, 0.62), color: 0xc9a040, pos: [0, 0.4, 0] },
  { geo: B(0.97, 0.05, 0.62), color: 0xc9a040, pos: [0, 0.15, 0] },
  { geo: B(0.9, 0.04, 0.5), color: 0xf3d77a, pos: [0, 0.56, 0] },
]);
function proc_makeHay() { return vmesh(hayGeo); }

export function makeScarecrow() {
  return vmesh(build([
    { geo: C(0.05, 0.05, 1.7, 5), color: 0x8a5a33, pos: [0, 0.85, 0] },
    { geo: B(1.2, 0.06, 0.06), color: 0x8a5a33, pos: [0, 1.25, 0] },
    { geo: B(0.55, 0.6, 0.3), color: 0x4f7bd8, pos: [0, 1.15, 0] },
    { geo: B(1.0, 0.18, 0.2), color: 0xc0392b, pos: [0, 1.32, 0] },
    { geo: S(0.2, 8, 6), color: 0xf3d77a, pos: [0, 1.65, 0] },
    { geo: C(0.32, 0.32, 0.04, 10), color: 0xc9a040, pos: [0, 1.8, 0] },
    { geo: C(0.14, 0.2, 0.2, 8), color: 0xc9a040, pos: [0, 1.9, 0] },
    { geo: B(0.05, 0.05, 0.02), color: 0x222222, pos: [-0.07, 1.68, 0.19] },
    { geo: B(0.05, 0.05, 0.02), color: 0x222222, pos: [0.07, 1.68, 0.19] },
  ]));
}

export function makeSunflower() {
  return vmesh(build([
    { geo: C(0.03, 0.04, 1.1, 4), color: 0x5c9e31, pos: [0, 0.55, 0] },
    { geo: C(0.24, 0.24, 0.05, 10), color: 0xffc928, pos: [0, 1.15, 0.03], rot: [1.3, 0, 0] },
    { geo: C(0.12, 0.12, 0.07, 8), color: 0x6b3e1f, pos: [0, 1.16, 0.06], rot: [1.3, 0, 0] },
    { geo: B(0.25, 0.02, 0.1), color: 0x6fbf3f, pos: [0.12, 0.6, 0], rot: [0, 0, -0.4] },
  ]));
}

function proc_makeRailFence(len: number) {
  const parts: Part[] = [];
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) parts.push({ geo: B(0.14, 0.8, 0.14), color: 0xffffff, pos: [-len / 2 + (i * len) / n, 0.4, 0] });
  parts.push({ geo: B(len, 0.09, 0.05), color: 0xffffff, pos: [0, 0.6, 0] });
  parts.push({ geo: B(len, 0.09, 0.05), color: 0xffffff, pos: [0, 0.32, 0] });
  return vmesh(build(parts));
}

export function makeSign(text: string, bg: string, fg: string, w: number, h: number, font = 64) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = Math.round(512 * (h / w));
  const c = cv.getContext('2d')!;
  const draw = () => {
    c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = bg;
    c.beginPath();
    c.roundRect(4, 4, cv.width - 8, cv.height - 8, 28);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 12;
    c.stroke();
    c.fillStyle = fg;
    c.font = `700 ${font}px Fredoka, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, cv.width / 2, cv.height / 2 + 4, cv.width - 30);
  };
  draw();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.userData.redraw = () => { draw(); tex.needsUpdate = true; };
  signs.push(m);
  return m;
}
export const signs: THREE.Mesh[] = [];

function signBoard(text: string, bg: string, w: number, h: number, y: number, font = 64) {
  const g = new THREE.Group();
  const s = makeSign(text, bg, '#ffffff', w, h, font);
  s.position.set(0, y, 0.04);
  g.add(s);
  const back = box(w + 0.06, h + 0.06, 0.06, 0x7a4f2e);
  back.position.set(0, y, 0);
  g.add(back);
  return g;
}

// ---------------- Buildings ----------------
export function makeGate() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = box(0.32, 3.2, 0.32, 0x8a5a33);
    p.position.set(1.9 * s, 1.6, 0);
    g.add(p);
    const cap = new THREE.Mesh(I(0.28, 0), mat(PUMPKIN_ORANGE, { flat: true }));
    cap.position.set(1.9 * s, 3.4, 0);
    cap.scale.set(1, 0.8, 1);
    g.add(cap);
  }
  const beam = box(4.2, 0.25, 0.3, 0x7a4f2e);
  beam.position.y = 2.8;
  g.add(beam);
  const s = signBoard('PUMPKIN HOLLOW', '#e2661d', 3.6, 0.75, 2.25, 66);
  g.add(s);
  return g;
}

function proc_makeBarn() {
  const g = new THREE.Group();
  const red = 0xc8392b;
  const body = box(3.8, 2.2, 3.0, red);
  body.position.y = 1.1;
  g.add(body);
  // gambrel roof
  const roofM = mat(0x5b3a2e, { flat: true });
  const r1 = new THREE.Mesh(B(1.3, 0.14, 3.2), roofM);
  const mk = (x: number, y: number, rz: number, w: number) => {
    const r = r1.clone();
    r.scale.x = w / 1.3;
    r.position.set(x, y, 0);
    r.rotation.z = rz;
    r.castShadow = true;
    g.add(r);
  };
  mk(-1.62, 2.65, 1.0, 1.25);
  mk(1.62, 2.65, -1.0, 1.25);
  mk(-0.65, 3.3, 0.38, 1.45);
  mk(0.65, 3.3, -0.38, 1.45);
  // gable front/back as flat polygon
  const shape = new THREE.Shape();
  shape.moveTo(-1.9, 0);
  shape.lineTo(-1.9, 0.05);
  shape.lineTo(-1.25, 1.1);
  shape.lineTo(0, 1.55);
  shape.lineTo(1.25, 1.1);
  shape.lineTo(1.9, 0.05);
  shape.lineTo(1.9, 0);
  const gg = new THREE.ShapeGeometry(shape);
  for (const z of [1.5, -1.5]) {
    const gm = new THREE.Mesh(gg, mat(red));
    gm.position.set(0, 2.2, z);
    if (z < 0) gm.rotation.y = Math.PI;
    g.add(gm);
  }
  // doors with white X
  const door = box(1.5, 1.6, 0.06, 0x9e2b20);
  door.position.set(0, 0.8, 1.52);
  g.add(door);
  const w = 0xffffff;
  const frame = (x: number, y: number, ww: number, hh: number, rz = 0) => {
    const b = box(ww, hh, 0.04, w);
    b.position.set(x, y, 1.56);
    b.rotation.z = rz;
    g.add(b);
  };
  frame(0, 1.6, 1.6, 0.1);
  frame(0, 0.02, 1.6, 0.1);
  frame(-0.78, 0.8, 0.1, 1.6);
  frame(0.78, 0.8, 0.1, 1.6);
  frame(0, 0.8, 0.09, 2.1, 0.75);
  frame(0, 0.8, 0.09, 2.1, -0.75);
  const loft = box(0.7, 0.6, 0.06, 0xffffff);
  loft.position.set(0, 2.85, 1.53);
  g.add(loft);
  const loftIn = box(0.55, 0.45, 0.07, 0x9e2b20);
  loftIn.position.set(0, 2.85, 1.54);
  g.add(loftIn);
  // silo
  const silo = cyl(0.8, 0.8, 4.2, 0xdfe3e8, 14);
  silo.position.set(2.7, 2.1, -0.6);
  g.add(silo);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.82, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9aa3ad));
  dome.position.set(2.7, 4.2, -0.6);
  dome.castShadow = true;
  g.add(dome);
  for (let i = 0; i < 3; i++) {
    const band = cyl(0.82, 0.82, 0.06, 0xb7c0ca, 14);
    band.position.set(2.7, 1 + i * 1.2, -0.6);
    g.add(band);
  }
  return g;
}

export function makeFarmhouse() {
  const g = new THREE.Group();
  const w = box(3.2, 1.9, 2.4, 0xfff6e5);
  w.position.y = 0.95;
  g.add(w);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 2.1, 1.3, 4, 1), mat(0x2f5d8a, { flat: true }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.85);
  roof.position.y = 2.55;
  roof.castShadow = true;
  g.add(roof);
  const porch = box(3.4, 0.12, 0.9, 0xc28a52);
  porch.position.set(0, 0.06, 1.6);
  g.add(porch);
  const porchRoof = box(3.4, 0.1, 1.0, 0x2f5d8a);
  porchRoof.position.set(0, 1.5, 1.6);
  porchRoof.rotation.x = 0.15;
  g.add(porchRoof);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    const p = box(0.08, 1.45, 0.08, 0xffffff);
    p.position.set(x, 0.75, 2.0);
    g.add(p);
  }
  const door = box(0.6, 1.1, 0.05, 0xc0392b);
  door.position.set(0, 0.55, 1.22);
  g.add(door);
  for (const s of [-1, 1]) {
    const win = box(0.55, 0.55, 0.05, 0x9fe3ff);
    win.position.set(0.95 * s, 1.1, 1.22);
    g.add(win);
  }
  const chim = box(0.35, 1.0, 0.35, 0xb5523b);
  chim.position.set(0.9, 2.8, -0.4);
  g.add(chim);
  return g;
}

/** Wooden farm stand with an orange awning; display slots on top. */
export function makeFarmStand(label: string, awning = 0xe2661d) {
  const g = new THREE.Group();
  const table = box(2.6, 0.8, 1.1, 0xc28a52);
  table.position.y = 0.4;
  g.add(table);
  for (let i = 0; i < 4; i++) {
    const plank = box(2.62, 0.03, 1.12, 0xa8733f);
    plank.position.y = 0.15 + i * 0.2;
    g.add(plank);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(0.12, 2.3, 0.12, 0x8a5a33);
    post.position.set(1.22 * sx, 1.15, 0.5 * sz);
    g.add(post);
  }
  for (let i = 0; i < 6; i++) {
    const strip = box(0.46, 0.07, 1.5, i % 2 ? 0xffffff : awning);
    strip.position.set(-1.15 + i * 0.46, 2.35, 0.1);
    strip.rotation.x = -0.22;
    g.add(strip);
  }
  const s = signBoard(label, '#7a4f2e', 2.0, 0.5, 2.85, 58);
  s.position.z = -0.45;
  g.add(s);
  // honor box
  const hb = box(0.4, 0.35, 0.3, 0x2f5d8a);
  hb.position.set(1.55, 0.6, 0.2);
  g.add(hb);
  const hbPost = box(0.08, 0.45, 0.08, 0x8a5a33);
  hbPost.position.set(1.55, 0.22, 0.2);
  g.add(hbPost);
  return g;
}

export function makeBooth(label: string, color = 0x2f9e5a) {
  const g = new THREE.Group();
  const b = rbox(1.6, 1.1, 1.2, 0.12, 0xfff6e5);
  g.add(b);
  const counter = box(1.7, 0.1, 0.4, 0xc28a52);
  counter.position.set(0, 1.0, 0.65);
  g.add(counter);
  for (const s of [-1, 1]) {
    const p = box(0.1, 1.2, 0.1, 0xffffff);
    p.position.set(0.75 * s, 1.65, 0.5);
    g.add(p);
  }
  const roof = box(1.9, 0.15, 1.6, color);
  roof.position.set(0, 2.3, 0.1);
  g.add(roof);
  const s = signBoard(label, '#' + color.toString(16).padStart(6, '0'), 1.7, 0.42, 2.72, 60);
  g.add(s);
  return g;
}

export function makePress() {
  const g = new THREE.Group();
  const base = box(1.8, 0.3, 1.3, 0x8a5a33);
  base.position.y = 0.15;
  g.add(base);
  const tub = cyl(0.5, 0.5, 0.75, 0xa8733f, 12);
  tub.position.y = 0.67;
  g.add(tub);
  for (let i = 0; i < 3; i++) {
    const band = cyl(0.52, 0.52, 0.05, 0x555b66, 12);
    band.position.y = 0.4 + i * 0.27;
    g.add(band);
  }
  for (const s of [-1, 1]) {
    const p = box(0.18, 2.0, 0.18, 0x7a4f2e);
    p.position.set(0.75 * s, 1.0, 0);
    g.add(p);
  }
  const top = box(1.75, 0.22, 0.3, 0x7a4f2e);
  top.position.y = 1.95;
  g.add(top);
  const screw = new THREE.Group();
  const rod = cyl(0.06, 0.06, 1.0, 0x9aa3ad, 8);
  screw.add(rod);
  const plate = cyl(0.42, 0.42, 0.1, 0x7a4f2e, 12);
  plate.position.y = -0.5;
  screw.add(plate);
  const handle = box(1.1, 0.07, 0.07, 0x9aa3ad);
  handle.position.y = 0.45;
  screw.add(handle);
  screw.position.y = 1.55;
  g.add(screw);
  g.userData.screw = screw;
  // spout
  const spout = box(0.14, 0.1, 0.45, 0x7a4f2e);
  spout.position.set(0, 0.42, 0.65);
  g.add(spout);
  return g;
}

export function makeBakery() {
  const g = new THREE.Group();
  const w = box(3.4, 2.0, 2.4, 0xfde2c8);
  w.position.y = 1.0;
  g.add(w);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 2.2, 1.2, 4, 1), mat(0x8e3b2e, { flat: true }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.85);
  roof.position.y = 2.6;
  roof.castShadow = true;
  g.add(roof);
  const chim = box(0.4, 1.1, 0.4, 0xb5523b);
  chim.position.set(-1.0, 2.9, -0.3);
  g.add(chim);
  g.userData.chimney = new THREE.Vector3(-1.0, 3.6, -0.3);
  // window counter
  const win = box(1.6, 0.8, 0.06, 0x5b3a2e);
  win.position.set(0.4, 1.2, 1.22);
  g.add(win);
  const counter = box(1.9, 0.12, 0.6, 0xc28a52);
  counter.position.set(0.4, 0.8, 1.45);
  g.add(counter);
  for (let i = 0; i < 5; i++) {
    const strip = box(0.4, 0.06, 0.8, i % 2 ? 0xffffff : 0xd9473a);
    strip.position.set(-0.4 + i * 0.4, 1.8, 1.55);
    strip.rotation.x = -0.35;
    g.add(strip);
  }
  const door = box(0.6, 1.1, 0.05, 0x8e3b2e);
  door.position.set(-1.1, 0.55, 1.22);
  g.add(door);
  const s = signBoard('PIE SHOP', '#d9473a', 1.8, 0.45, 2.25, 60);
  s.position.set(0.3, 0, 1.25);
  g.add(s);
  // oven (brick dome on the side)
  const oven = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb5523b));
  oven.position.set(2.3, 0.2, 0.2);
  oven.castShadow = true;
  g.add(oven);
  const ovBase = box(1.7, 0.2, 1.7, 0x9aa3ad);
  ovBase.position.set(2.3, 0.1, 0.2);
  g.add(ovBase);
  const mouth = box(0.5, 0.4, 0.1, 0x2b1a12);
  mouth.position.set(2.3, 0.45, 0.93);
  g.add(mouth);
  const glow = new THREE.Mesh(B(0.38, 0.28, 0.02), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  glow.position.set(2.3, 0.42, 0.99);
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

export function makeTractor(color = 0xd32f2f) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const hood = rbox(0.8, 0.55, 1.4, 0.12, color);
  hood.position.set(0, 0.45, 0.35);
  body.add(hood);
  const cab = box(0.9, 0.18, 0.9, color);
  cab.position.set(0, 0.6, -0.55);
  body.add(cab);
  const seat = box(0.45, 0.4, 0.12, 0x333333);
  seat.position.set(0, 1.0, -0.8);
  body.add(seat);
  const wheel = (r: number, w: number, x: number, z: number) => {
    const t = cyl(r, r, w, 0x2b2f38, 12);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, r, z);
    body.add(t);
    const hub = cyl(r * 0.5, r * 0.5, w + 0.02, 0xffd23f, 10);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, r, z);
    body.add(hub);
  };
  wheel(0.55, 0.3, 0.6, -0.55);
  wheel(0.55, 0.3, -0.6, -0.55);
  wheel(0.3, 0.2, 0.45, 0.75);
  wheel(0.3, 0.2, -0.45, 0.75);
  const stack = cyl(0.06, 0.06, 0.6, 0x333333, 6);
  stack.position.set(0.25, 1.05, 0.7);
  body.add(stack);
  const grill = box(0.6, 0.35, 0.05, 0xdddddd);
  grill.position.set(0, 0.5, 1.06);
  body.add(grill);
  const driverSeat = new THREE.Object3D();
  driverSeat.position.set(0, 0.75, -0.55);
  g.add(driverSeat);
  g.userData = { body, exhaust: new THREE.Vector3(0.25, 1.4, 0.7), driverSeat };
  return g;
}

export function makeWagon() {
  const g = new THREE.Group();
  const bed = box(1.5, 0.15, 2.6, 0x8a5a33);
  bed.position.y = 0.55;
  g.add(bed);
  for (const s of [-1, 1]) {
    const rail = box(0.08, 0.35, 2.6, 0x7a4f2e);
    rail.position.set(0.72 * s, 0.8, 0);
    g.add(rail);
  }
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const w = cyl(0.3, 0.3, 0.16, 0x2b2f38, 10);
    w.rotation.z = Math.PI / 2;
    w.position.set(0.7 * sx, 0.3, 0.85 * sz);
    g.add(w);
  }
  const hay = vmesh(hayGeo);
  hay.scale.set(0.8, 0.7, 2.2);
  hay.rotation.y = Math.PI / 2;
  hay.position.set(0, 0.62, 0);
  hay.rotation.y = 0;
  hay.scale.set(0.55, 0.7, 4.0);
  g.add(hay);
  const hitch = box(0.1, 0.1, 0.8, 0x555b66);
  hitch.position.set(0, 0.45, 1.6);
  g.add(hitch);
  // 6 seats (3 per side, facing out)
  const seats: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const o = new THREE.Object3D();
    o.position.set(0.42 * s, 0.62, -0.8 + i * 0.8);
    o.rotation.y = (s * Math.PI) / 2;
    g.add(o);
    seats.push(o);
  }
  g.userData.seats = seats;
  return g;
}

export function makeRibbonStage() {
  const g = new THREE.Group();
  const deck = box(5, 0.4, 3.6, 0xc28a52);
  deck.position.y = 0.2;
  g.add(deck);
  for (let i = 0; i < 6; i++) {
    const skirt = box(0.83, 0.38, 0.04, i % 2 ? 0xffffff : 0x2e5fd8);
    skirt.position.set(-2.08 + i * 0.83, 0.2, 1.82);
    g.add(skirt);
  }
  const back = signBoard('COUNTY FAIR', '#2e5fd8', 3.6, 0.7, 3.2, 70);
  back.position.z = -1.6;
  g.add(back);
  for (const s of [-1, 1]) {
    const p = box(0.15, 3.6, 0.15, 0x8a5a33);
    p.position.set(2.0 * s, 1.8, -1.6);
    g.add(p);
  }
  // pennant string
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 3), mat(COLORS[(['red', 'yellow', 'orange'] as const)[i % 3]]));
    f.rotation.x = Math.PI;
    f.position.set(-1.9 + i * 0.475, 3.75 - Math.sin((i / 8) * Math.PI) * 0.25, -1.6);
    g.add(f);
  }
  return g;
}

export function makeRibbon() {
  return vmesh(build([
    { geo: C(0.35, 0.35, 0.06, 14), color: 0x2e5fd8, rot: [Math.PI / 2, 0, 0] },
    { geo: C(0.22, 0.22, 0.08, 12), color: 0xffd23f, rot: [Math.PI / 2, 0, 0] },
    { geo: B(0.18, 0.6, 0.04), color: 0x2e5fd8, pos: [-0.12, -0.45, 0], rot: [0, 0, 0.25] },
    { geo: B(0.18, 0.6, 0.04), color: 0x2e5fd8, pos: [0.12, -0.45, 0], rot: [0, 0, -0.25] },
  ]));
}

export function makeBasketCrate() {
  return vmesh(build([
    { geo: B(0.8, 0.45, 0.6), color: 0xc28a52, pos: [0, 0.225, 0] },
    { geo: B(0.82, 0.06, 0.62), color: 0xa8733f, pos: [0, 0.4, 0] },
  ]));
}


// =====================================================================
// CC0 model versions (Quaternius / Kenney via poly.pizza). Fall back to the
// procedural versions above if a model failed to load.
// =====================================================================

const tint = (o: THREE.Object3D, matName: string, color: number) => {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mm, i) => {
      if (mm.name !== matName) return;
      const cl = (mm as THREE.MeshStandardMaterial).clone();
      cl.color.setHex(color);
      if (Array.isArray(m.material)) m.material[i] = cl; else m.material = cl;
    });
  });
};

const sharedPumpkin = new Map<string, THREE.Object3D>();
export function makePumpkin(m?: THREE.Material) {
  if (!has('pumpkin') || m) return proc_makePumpkin(m);
  let base = sharedPumpkin.get('ripe');
  if (!base) {
    base = model('pumpkin', { height: 0.42 });
    tint(base, 'Orange', PUMPKIN_ORANGE);
    tint(base, 'Brown', 0x5c8a2e);
    sharedPumpkin.set('ripe', base);
  }
  return base.clone(true);
}

/** A pumpkin whose body colour can be animated (green -> orange) while it grows. */
export function makeGrowingPumpkin(): { obj: THREE.Object3D; color: THREE.Color } {
  if (!has('pumpkin')) {
    const pm = new THREE.MeshLambertMaterial({ vertexColors: true, color: PUMPKIN_GREEN });
    return { obj: proc_makePumpkin(pm), color: pm.color };
  }
  const o = model('pumpkin', { height: 0.42 });
  tint(o, 'Brown', 0x5c8a2e);
  let col: THREE.Color | null = null;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mm, i) => {
      if (mm.name !== 'Orange') return;
      const cl = (mm as THREE.MeshStandardMaterial).clone();
      cl.color.setHex(PUMPKIN_GREEN);
      col = cl.color;
      if (Array.isArray(m.material)) m.material[i] = cl; else m.material = cl;
    });
  });
  return { obj: o, color: col ?? new THREE.Color() };
}

const once = (key: string, make: () => THREE.Object3D) => {
  const cache = once as unknown as { m?: Map<string, THREE.Object3D> };
  cache.m ??= new Map();
  let b = cache.m.get(key);
  if (!b) { b = make(); cache.m.set(key, b); }
  return b.clone(true);
};

export function makeApple() {
  if (!has('apple')) return proc_makeApple();
  return once('apple', () => model('apple', { height: 0.26 }));
}
export function makeCider() {
  if (!has('jug')) return proc_makeCider();
  return once('jug', () => { const j = model('jug', { height: 0.44 }); tint(j, 'Material.001', 0xd98a2b); return j; });
}
export function makePie() {
  if (!has('pie')) return proc_makePie();
  return once('pie', () => model('pie', { width: 0.5 }));
}
export function makeHay() {
  if (!has('hay')) return proc_makeHay();
  return once('hay', () => model('hay', { height: 0.8 }));
}
export function makePine(scale = 1) {
  if (!has('pine')) return proc_makePine(scale);
  const p = once('pine', () => model('pine', { height: 3.6 }));
  p.scale.setScalar(scale * 0.75);
  return p;
}
export function makeAppleTree() {
  if (!has('tree')) return proc_makeAppleTree();
  const g = new THREE.Group();
  const t = once('tree', () => model('tree', { height: 3.3 }));
  g.add(t);
  g.userData.canopy = t;
  const spots: THREE.Vector3[] = [];
  const dirs = [[0.75, 1.9, 0.75], [-0.7, 1.8, 0.7], [0.1, 1.65, 1.0], [1.0, 2.25, 0.15], [-0.95, 2.3, 0.25], [0.35, 2.7, 0.8], [-0.35, 2.75, 0.65]];
  for (const d of dirs) spots.push(new THREE.Vector3(d[0], d[1], d[2]));
  g.userData.spots = spots;
  return g;
}
export function makeBarn() {
  if (!has('barn')) return proc_makeBarn();
  const g = new THREE.Group();
  const b = model('barn', { height: 4.4 });
  g.add(b);
  if (has('silo')) {
    const silo = model('silo', { height: 5.6 });
    silo.position.set(2.9, 0, -0.6);
    g.add(silo);
  }
  return g;
}
export function makeRailFence(len: number) {
  if (!has('fence')) return proc_makeRailFence(len);
  const g = new THREE.Group();
  const seg = 2.95;
  const n = Math.max(1, Math.round(len / seg));
  const sc = len / n / seg;
  for (let i = 0; i < n; i++) {
    const f = once('fence', () => model('fence', { width: seg }));
    f.scale.x = sc;
    f.position.x = -len / 2 + (i + 0.5) * (len / n);
    g.add(f);
  }
  return g;
}
export function makeItem(kind: 'pumpkin' | 'apple' | 'cider' | 'pie') {
  if (kind === 'pumpkin') return makePumpkin();
  if (kind === 'apple') return makeApple();
  if (kind === 'cider') return makeCider();
  return makePie();
}

/** Car from CC0 models, recoloured. Faces +z. */
export function makeCar(color: number): THREE.Group | null {
  const kinds = ['car', 'car2', 'pickup', 'wagon_car'].filter(has);
  if (!kinds.length) return null;
  const k = kinds[Math.floor(Math.random() * kinds.length)];
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const m = model(k, { width: k === 'pickup' ? 3.3 : 3.1 });
  if (k === 'car') tint(m, 'Blue', color);
  if (k === 'car2') tint(m, 'LightBlue', color);
  body.add(m);
  g.userData = { body, type: k };
  return g;
}

// ---------------- Grass / hay items, hay baler, sickle ----------------
export const grassBundleGeo = build([
  { geo: B(0.52, 0.12, 0.4), color: 0x5fae38, pos: [0, 0.06, 0] },
  { geo: B(0.54, 0.05, 0.08), color: 0xb98a4a, pos: [0, 0.08, -0.1] },
  { geo: B(0.54, 0.05, 0.08), color: 0xb98a4a, pos: [0, 0.08, 0.1] },
  { geo: new THREE.ConeGeometry(0.06, 0.16, 4), color: 0x7cc943, pos: [-0.14, 0.18, 0], rot: [0, 0, 0.5] },
  { geo: new THREE.ConeGeometry(0.06, 0.15, 4), color: 0x6fbf3a, pos: [0.12, 0.17, 0.05], rot: [0, 0, -0.5] },
  { geo: new THREE.ConeGeometry(0.05, 0.14, 4), color: 0x8fd14f, pos: [0.0, 0.18, -0.08], rot: [-0.5, 0, 0] },
]);
export function makeGrassBundle() { return vmesh(grassBundleGeo); }

export const hayBaleGeo = build([
  { geo: B(0.56, 0.3, 0.4), color: 0xf0c75a, pos: [0, 0.15, 0] },
  { geo: B(0.58, 0.04, 0.42), color: 0xc99a35, pos: [0, 0.22, 0] },
  { geo: B(0.58, 0.04, 0.42), color: 0xc99a35, pos: [0, 0.08, 0] },
  { geo: B(0.5, 0.03, 0.34), color: 0xf8dc85, pos: [0, 0.31, 0] },
]);
export function makeHayBale() { return vmesh(hayBaleGeo); }

export function makeAnyItem(kind: string) {
  if (kind === 'grass') return makeGrassBundle();
  if (kind === 'hay') return makeHayBale();
  return makeItem(kind as 'pumpkin' | 'apple' | 'cider' | 'pie');
}

/** Red hay baler: hopper on top, a ram that thumps, bales come out of the side chute. */
export function makeBaler() {
  const g = new THREE.Group();
  const base = rbox(2.0, 0.9, 1.4, 0.15, 0xd9473a);
  base.position.y = 0.15;
  g.add(base);
  const skirt = box(2.05, 0.18, 1.45, 0x8a2f26);
  skirt.position.y = 0.09;
  g.add(skirt);
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.72, 0.72]) {
    const w = cyl(0.22, 0.22, 0.14, 0x2b2f38, 12);
    w.rotation.x = Math.PI / 2;
    w.position.set(sx, 0.22, sz);
    g.add(w);
  }
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.38, 0.7, 4, 1, true), mat(0xffc93c, { flat: true }));
  hopper.rotation.y = Math.PI / 4;
  hopper.position.set(-0.3, 1.45, -0.1);
  hopper.castShadow = true;
  (hopper.material as THREE.Material).side = THREE.DoubleSide;
  g.add(hopper);
  const ram = new THREE.Group();
  const block = box(0.5, 0.45, 0.6, 0x9aa3ad);
  ram.add(block);
  const rod = cyl(0.06, 0.06, 0.5, 0x555b66, 8);
  rod.position.y = 0.45;
  ram.add(rod);
  ram.position.set(0.55, 1.35, 0);
  g.add(ram);
  g.userData.ram = ram;
  const chute = box(0.7, 0.12, 0.6, 0x7a4f2e);
  chute.position.set(1.25, 0.55, 0);
  chute.rotation.z = -0.35;
  g.add(chute);
  const sign = makeSign('HAY BALER', '#d9473a', '#ffffff', 1.3, 0.32, 70);
  sign.position.set(0, 0.62, 0.71);
  g.add(sign);
  return g;
}

/** Simple sickle for the farmer's hand. */
export function makeSickle() {
  const g = new THREE.Group();
  const handle = cyl(0.03, 0.035, 0.32, 0x8a5a33, 6);
  handle.position.y = -0.1;
  g.add(handle);
  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 4, 12, Math.PI * 1.1), mat(0xdfe6ee, { flat: true }));
  blade.position.set(0.12, 0.08, 0);
  blade.rotation.z = -0.4;
  blade.castShadow = true;
  g.add(blade);
  return g;
}
