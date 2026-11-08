// Animated characters from CC0 glTF models (Quaternius), with the same userData shape as the old procedural people.
import * as THREE from 'three';
import { model } from './assets';

export type Char = THREE.Group & { userData: Record<string, any> };

function findClip(clips: THREE.AnimationClip[], name: string) {
  return clips.find((c) => c.name === name) ?? clips.find((c) => c.name.endsWith('|' + name)) ?? clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
}

/** kind: 'farmer' | 'char' | 'worker' | 'adventurer' */
export function makeChar(kind: string, height = 1.6): Char {
  const g = new THREE.Group() as Char;
  const m = model(kind, { height, skinned: true });
  g.add(m);
  const clips: THREE.AnimationClip[] = m.userData.animations ?? [];
  const mixer = new THREE.AnimationMixer(m);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const n of ['Idle', 'Walk', 'Run', 'Wave', 'Interact']) {
    const c = findClip(clips, n);
    if (c) actions[n] = mixer.clipAction(c);
  }
  actions.Idle?.play();
  const carryAnchor = new THREE.Object3D();
  carryAnchor.position.set(0, height * 0.42, 0.42);
  g.add(carryAnchor);
  // dummies so older code that poses limbs keeps working harmlessly
  const dummy = () => new THREE.Object3D();
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.16, depthWrite: false }));
  shadow.position.y = 0.03;
  g.add(shadow);
  g.userData = { mixer, actions, current: 'Idle', lastT: -1, carryAnchor, body: m, legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), seated: false };
  return g;
}

function play(p: Char, name: string, speed = 1) {
  const u = p.userData;
  const next: THREE.AnimationAction | undefined = u.actions[name];
  if (!next) return;
  next.timeScale = speed;
  if (u.current === name) return;
  const prev: THREE.AnimationAction | undefined = u.actions[u.current];
  next.reset().play();
  if (prev) next.crossFadeFrom(prev, 0.18, false);
  u.current = name;
}

/** Same call shape as the old animatePerson(p, t, moving, carrying). */
export function animateChar(p: Char, t: number, moving: number, _carrying: boolean, run = false) {
  const u = p.userData;
  const dt = u.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - u.lastT));
  u.lastT = t;
  if (u.seated) play(p, 'Idle');
  else if (moving > 0.05) play(p, run && u.actions.Run ? 'Run' : 'Walk', run ? 1 : 0.8 + moving * 0.5);
  else play(p, 'Idle');
  u.mixer.update(dt);
}

export function wave(p: Char) {
  const u = p.userData;
  if (u.actions.Wave) play(p, 'Wave');
}
