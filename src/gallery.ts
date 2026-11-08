// Dev-only page: shows every model in public/models in a grid, normalized to 1.5 units tall.
import * as THREE from 'three';
import { loadModels, model } from './assets';

const names = ['pumpkin', 'pumpkin_k', 'corn', 'apple', 'pie', 'jug', 'tree', 'tree_light', 'pine', 'pine_cluster', 'bush', 'bush_berries',
  'barn', 'silo', 'hay', 'fence', 'market', 'cart', 'crate', 'fruit_crate', 'sign', 'pickup', 'car', 'car2', 'wagon_car', 'rover', 'farmer', 'char', 'worker', 'adventurer'];
const list: Record<string, string> = {};
for (const n of names) list[n] = `./models/${n}.glb`;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3f5);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0xb7d99a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(-8, 20, 10);
sun.castShadow = true;
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x9be24f }));
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0, 22, 20);
camera.lookAt(0, 0, 0);
const labels = document.getElementById('labels')!;
const placed: { obj: THREE.Object3D; el: HTMLDivElement }[] = [];
const mixers: THREE.AnimationMixer[] = [];

loadModels(list).then(() => {
  const cols = 6;
  names.forEach((n, i) => {
    const m = model(n, { height: 1.5, skinned: ['farmer', 'char', 'worker', 'adventurer'].includes(n) });
    const x = (i % cols - (cols - 1) / 2) * 3.2;
    const z = (Math.floor(i / cols) - 2) * 3.2;
    m.position.set(x, 0, z);
    scene.add(m);
    const clips: THREE.AnimationClip[] = m.userData.animations ?? [];
    if (clips.length) {
      const mixer = new THREE.AnimationMixer(m);
      const walk = clips.find((c) => /walk/i.test(c.name)) ?? clips[0];
      mixer.clipAction(walk).play();
      mixers.push(mixer);
    }
    const el = document.createElement('div');
    el.textContent = n + (clips.length ? ` (${clips.length} anim)` : '');
    labels.appendChild(el);
    placed.push({ obj: m, el });
  });
  (window as any).__galleryReady = true;
});

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dt = clock.getDelta();
  for (const m of mixers) m.update(dt);
  renderer.render(scene, camera);
  const v = new THREE.Vector3();
  for (const p of placed) {
    v.copy(p.obj.position).setY(-0.2).project(camera);
    p.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
    p.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
  }
}
frame();
