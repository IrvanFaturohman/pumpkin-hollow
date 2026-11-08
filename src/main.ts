import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Game } from './game';
import { signs } from './farm';
import { loadModels, MODELS } from './assets';
import { Particles, WorldUI, Shake } from './fx';
import { sfx } from './audio';
import { tweens, clamp, damp } from './util';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const canvas = $<HTMLCanvasElement>('game');

// ---------------- Renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// soft image-based light so the CC0 PBR models are not dark
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;
scene.background = new THREE.Color(0xbfe3f5);
scene.fog = new THREE.Fog(0xbfe3f5, 48, 90);

const camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.5, 200);
const CAM_OFFSET = new THREE.Vector3(0, 21, 14.5);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0xb7d99a, 1.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

const particles = new Particles(scene);
const ui = new WorldUI($('world-ui'), camera);
const shake = new Shake();

const btnStart = $<HTMLButtonElement>('btn-start');
btnStart.textContent = 'LOADING…';
btnStart.disabled = true;
await loadModels(MODELS, (d, t) => { btnStart.textContent = `LOADING ${Math.round((d / t) * 100)}%`; });
btnStart.textContent = 'TAP TO PLAY';
btnStart.disabled = false;

const game = new Game(scene, camera, particles, ui, shake, {
  money: $('money'), moneyBox: $('money-box'), levelNum: $('level-num'), levelFill: $('level-fill'), levelText: $('level-text'), levelStar: $('level-star'),
  objective: $('objective'), objectiveText: $('objective-text'), banner: $('banner'), stage,
  objIcon: $('obj-icon'), objBar: $('obj-bar'), objFill: $('obj-fill'), objCount: $('obj-count'),
});
(window as any).__game = game;

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h > 0.7 ? 32 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------- Input ----------------
const joy = $('joystick');
const knob = $('joy-knob');
const JOY_R = 50;
let joyActive = false;
let joyId = -1;
const joyOrigin = { x: 0, y: 0 };
const joyVec = new THREE.Vector2();
const keys = new Set<string>();

stage.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button, select, #debug-panel')) return;
  sfx.init();
  joyActive = true;
  joyId = e.pointerId;
  const r = stage.getBoundingClientRect();
  joyOrigin.x = e.clientX - r.left;
  joyOrigin.y = e.clientY - r.top;
  joy.style.left = `${joyOrigin.x}px`;
  joy.style.top = `${joyOrigin.y}px`;
  joy.style.display = 'block';
  knob.style.transform = 'translate(-50%, -50%)';
  joyVec.set(0, 0);
});
window.addEventListener('pointermove', (e) => {
  if (!joyActive || e.pointerId !== joyId) return;
  const r = stage.getBoundingClientRect();
  let dx = e.clientX - r.left - joyOrigin.x;
  let dy = e.clientY - r.top - joyOrigin.y;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joyVec.set(dx / JOY_R, dy / JOY_R);
  if (joyVec.length() < 0.12) joyVec.set(0, 0);
});
const endJoy = (e: PointerEvent) => {
  if (e.pointerId !== joyId) return;
  joyActive = false;
  joy.style.display = 'none';
  joyVec.set(0, 0);
};
window.addEventListener('pointerup', endJoy);
window.addEventListener('pointercancel', endJoy);
window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === '`') toggleDebug(); });
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function readInput() {
  const v = new THREE.Vector2(joyVec.x, joyVec.y);
  const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const ky = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (kx || ky) v.set(kx, ky).normalize();
  return v;
}

// ---------------- Buttons ----------------
let started = false;
$('btn-start').addEventListener('click', () => { sfx.init(); started = true; $('start-screen').classList.add('gone'); });
const btnSound = $('btn-sound');
btnSound.addEventListener('click', () => { sfx.init(); sfx.setEnabled(!sfx.enabled); btnSound.textContent = sfx.enabled ? '🔊' : '🔇'; });
const panel = $('debug-panel');
function toggleDebug() { panel.classList.toggle('hidden'); }
$('btn-debug').addEventListener('click', toggleDebug);
$('dbg-close').addEventListener('click', toggleDebug);
let speedMul = 1;
$<HTMLSelectElement>('dbg-speed').addEventListener('change', (e) => { speedMul = Number((e.target as HTMLSelectElement).value); });
$('dbg-money').addEventListener('click', () => game.debugMoney(500));
$('dbg-clean').addEventListener('click', () => game.debugGrow());
$('dbg-reset').addEventListener('click', () => location.reload());

// ---------------- Loop ----------------
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
const camTarget = game.player.position.clone();

function frame(now: number) {
  requestAnimationFrame(frame);
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += real * speedMul;
  let steps = 0;
  while (acc >= STEP && steps < 8) {
    acc -= STEP;
    steps++;
    if (started) {
      game.input.copy(readInput());
      game.update(STEP);
    }
    tweens.update(STEP);
    particles.update(STEP);
    shake.update(STEP);
  }
  const p = game.player.position;
  camTarget.x = damp(camTarget.x, clamp(p.x, -10.5, 10.5), 5, real);
  camTarget.z = damp(camTarget.z, clamp(p.z, -18.5, 10.5), 5, real);
  camera.position.copy(camTarget).add(CAM_OFFSET).add(shake.offset);
  camera.lookAt(camTarget.x + shake.offset.x, 0, camTarget.z - 2.2 + shake.offset.z);
  sun.position.set(camTarget.x - 8, 20, camTarget.z + 10);
  sun.target.position.set(camTarget.x, 0, camTarget.z);
  ui.update(real);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

document.fonts?.ready.then(() => {
  // redraw canvas text once Fredoka is loaded
  for (const d of game.pads) d.pad.draw(true);
  for (const sgn of signs) sgn.userData.redraw?.();
});
