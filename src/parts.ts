// Reusable gameplay parts: carried stack, station piles, cash piles, build pads.
import * as THREE from 'three';
import type { ItemKind } from './config';
import { coinGeo, coinMat } from './farm';
import { arcMove, popIn, squash, tweens, ease, damp } from './util';
import { sfx } from './audio';

export const ITEM_H: Record<ItemKind, number> = { pumpkin: 0.4, apple: 0.24, cider: 0.44, pie: 0.13 };

/** Little stack of flat gold coins (used for money piles). */
export function makeCoinBrick() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(coinGeo, coinMat);
    c.rotation.x = Math.PI / 2;
    c.position.set((Math.random() - 0.5) * 0.04, 0.03 + i * 0.055, (Math.random() - 0.5) * 0.04);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

// ---------------- Carried stack ----------------

type StackItem = { kind: ItemKind; mesh: THREE.Object3D; landed: boolean };

export class Stack {
  items: StackItem[] = [];
  private lean = 0;
  private t = 0;
  constructor(public anchor: THREE.Object3D, public scene: THREE.Scene, public capacity: number, public isPlayer = false) {}

  get count() { return this.items.length; }
  get full() { return this.items.length >= this.capacity; }
  countOf(k: ItemKind) { return this.items.filter((i) => i.kind === k).length; }
  has(k: ItemKind) { return this.items.some((i) => i.kind === k); }

  private slotLocal(index: number, out = new THREE.Vector3()) {
    // two columns side by side: each row is as tall as its taller item
    let y = 0;
    const row = Math.floor(index / 2);
    for (let r = 0; r < row; r++) {
      const a = this.items[r * 2], b = this.items[r * 2 + 1];
      y += Math.max(a ? ITEM_H[a.kind] : 0, b ? ITEM_H[b.kind] : 0) + 0.01;
    }
    return out.set(index % 2 ? 0.25 : -0.25, y, 0);
  }

  /** Take a mesh that sits in world space and fly it onto the top of the stack. */
  receive(kind: ItemKind, mesh: THREE.Object3D) {
    const entry: StackItem = { kind, mesh, landed: false };
    this.items.push(entry);
    if (mesh.parent !== this.scene) this.scene.attach(mesh);
    const target = () => {
      const idx = Math.max(0, this.items.indexOf(entry));
      return this.anchor.localToWorld(this.slotLocal(idx));
    };
    if (this.isPlayer) sfx.pickup(this.items.length - 1);
    arcMove(mesh, mesh.position.clone(), target, 0.2, 0.9, () => {
      if (!this.items.includes(entry)) return;
      this.anchor.attach(mesh);
      mesh.rotation.set(0, 0, 0);
      mesh.position.copy(this.slotLocal(this.items.indexOf(entry)));
      entry.landed = true;
      squash(mesh, 0.3, 0.2);
    });
  }

  /** Remove the topmost item of a kind; returns the mesh placed in world space. */
  take(kind?: ItemKind): THREE.Object3D | null {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (kind && it.kind !== kind) continue;
      if (!it.landed) continue;
      this.items.splice(i, 1);
      this.scene.attach(it.mesh);
      return it.mesh;
    }
    return null;
  }

  update(dt: number, speed: number) {
    this.t += dt;
    this.lean = damp(this.lean, speed, 5, dt);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.landed) continue;
      this.slotLocal(i, tmp);
      const sway = Math.sin(this.t * 7 - i * 0.45) * 0.016 * (i >> 1) * Math.min(1, this.lean / 3);
      tmp.z += -this.lean * 0.006 * Math.pow(i >> 1, 1.25);
      tmp.x += sway;
      it.mesh.position.x = damp(it.mesh.position.x, tmp.x, 18, dt);
      it.mesh.position.y = damp(it.mesh.position.y, tmp.y, 18, dt);
      it.mesh.position.z = damp(it.mesh.position.z, tmp.z, 18, dt);
    }
  }

  clear() {
    for (const it of this.items) it.mesh.removeFromParent();
    this.items.length = 0;
  }
}

// ---------------- Cash pile ----------------

export class CashPile {
  value = 0;
  bricks: THREE.Object3D[] = [];
  private flying = 0;
  constructor(public scene: THREE.Scene, public origin: THREE.Vector3) {}

  private slot(i: number, out = new THREE.Vector3()) {
    const per = 6;
    const layer = Math.floor(i / per);
    const j = i % per;
    return out.set(this.origin.x + ((j % 2) - 0.5) * 0.42, 0.05 + layer * 0.17, this.origin.z + (Math.floor(j / 2) - 1) * 0.4);
  }

  add(amount: number, from?: THREE.Vector3) {
    if (amount <= 0) return;
    this.value += amount;
    const n = Math.max(1, Math.min(5, Math.ceil(amount / 4)));
    for (let k = 0; k < n; k++) {
      if (this.bricks.length + this.flying >= 60) break;
      const b = makeCoinBrick();
      this.scene.add(b);
      const idx = this.bricks.length + this.flying;
      const target = this.slot(idx);
      if (from) {
        b.position.copy(from);
        this.flying++;
        arcMove(b, from, target, 0.3, 1.2, () => {
          this.flying--;
          this.bricks.push(b);
          squash(b, 0.3, 0.2);
        });
        // stagger a bit
        b.position.y += k * 0.1;
      } else {
        b.position.copy(target);
        this.bricks.push(b);
        popIn(b, 0.25, k * 0.04);
      }
    }
  }

  /** Fly every brick to the collector; money is credited as bricks arrive. */
  collect(target: () => THREE.Vector3, credit: (amount: number) => void) {
    if (this.value <= 0 || this.bricks.length === 0) return false;
    const bricks = this.bricks.splice(0);
    const total = Math.round(this.value);
    this.value = 0;
    const per = Math.floor(total / bricks.length);
    let rest = total - per * bricks.length;
    bricks.reverse().forEach((b, i) => {
      const amt = per + (rest-- > 0 ? 1 : 0);
      tweens.add(0.001, () => {}, {
        delay: i * 0.03,
        done: () => {
          arcMove(b, b.position.clone(), target, 0.25, 1.4, () => {
            b.removeFromParent();
            credit(amt);
            sfx.cash();
          }, Math.PI * 2);
        },
      });
    });
    return true;
  }

  clear() {
    for (const b of this.bricks) b.removeFromParent();
    this.bricks.length = 0;
    this.value = 0;
  }
}

// ---------------- Build pad ----------------

export class Pad {
  group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private plate: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringSegs = 48;
  remaining: number;
  visible = false;
  locked = false;
  private lastDrawn = -1;
  private pulse = 0;

  constructor(public scene: THREE.Scene, public pos: THREE.Vector3, public title: string, public price: number, public levelReq: number, public icon = '') {
    this.remaining = price;
    this.canvas.width = this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.plate = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.plate.position.y = 0.09;
    this.plate.renderOrder = 2;
    this.group.add(this.plate);
    const rg = new THREE.RingGeometry(1.12, 1.3, this.ringSegs, 1).rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, depthWrite: false }));
    this.ring.position.y = 0.1;
    this.ring.rotation.y = Math.PI / 2;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
    this.group.position.copy(pos);
    this.group.visible = false;
    scene.add(this.group);
    this.setProgress(0);
    this.draw();
  }

  setPrice(price: number, title?: string) {
    this.price = price;
    this.remaining = price;
    if (title) this.title = title;
    this.setProgress(0);
    this.draw(true);
  }

  setProgress(p: number) {
    const n = Math.floor(Math.max(0, Math.min(1, p)) * this.ringSegs);
    this.ring.geometry.setDrawRange(0, n * 6);
    this.ring.visible = n > 0;
  }

  draw(force = false) {
    const key = this.remaining * 10 + (this.locked ? 1 : 0);
    if (!force && key === this.lastDrawn) return;
    this.lastDrawn = key;
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, 256, 256);
    const locked = this.locked;
    // 3D-ish tile: darker base, lighter top (reference style: peach floor tiles)
    c.beginPath();
    c.roundRect(14, 22, 228, 224, 44);
    c.fillStyle = locked ? '#8f96a6' : '#e48d43';
    c.fill();
    c.beginPath();
    c.roundRect(14, 10, 228, 222, 44);
    c.fillStyle = locked ? '#c3c8d3' : '#ffc98a';
    c.fill();
    c.lineWidth = 9;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const outlined = (text: string, x: number, y: number, size: number, fill: string, stroke: string, lw: number, maxW = 220) => {
      c.font = `700 ${size}px Fredoka, sans-serif`;
      c.lineJoin = 'round';
      c.lineWidth = lw;
      c.strokeStyle = stroke;
      c.strokeText(text, x, y, maxW);
      c.fillStyle = fill;
      c.fillText(text, x, y, maxW);
    };
    const title = (this.icon ? this.icon + ' ' : '') + this.title;
    outlined(title, 128, 56, 26, '#ffffff', locked ? '#6b7282' : '#b8611f', 7);
    if (locked) {
      c.font = '700 58px Fredoka, sans-serif';
      c.fillText('🔒', 128, 128);
      outlined(`LEVEL ${this.levelReq}`, 128, 192, 36, '#ffffff', '#6b7282', 8);
    } else {
      const txt = `${Math.ceil(this.remaining)}`;
      c.font = '700 76px Fredoka, sans-serif';
      const w = Math.min(150, c.measureText(txt).width);
      const total = w + 52;
      const x0 = 128 - total / 2;
      // gold coin icon
      c.save();
      c.translate(x0 + 20, 138);
      c.beginPath();
      c.arc(0, 0, 21, 0, Math.PI * 2);
      c.fillStyle = '#ffc727';
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = '#c98a00';
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 12, 0, Math.PI * 2);
      c.strokeStyle = '#ffe680';
      c.lineWidth = 3;
      c.stroke();
      c.restore();
      outlined(txt, x0 + 52 + w / 2, 138, 76, '#ffffff', '#b8611f', 12, 150);
      outlined('stand here', 128, 205, 22, '#ffffff', '#b8611f', 6);
    }
    this.tex.needsUpdate = true;
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.group.visible = true;
    popIn(this.group, 0.5);
  }

  hide(onDone?: () => void) {
    this.visible = false;
    const g = this.group;
    tweens.add(0.25, (k) => g.scale.setScalar(Math.max(0.001, 1 - k)), { easing: ease.inQuad, done: () => { g.visible = false; g.scale.setScalar(1); onDone?.(); } });
  }

  update(dt: number, affordable: boolean) {
    if (!this.visible) return;
    this.pulse += dt;
    const s = affordable && !this.locked ? 1 + Math.sin(this.pulse * 5) * 0.035 : 1;
    this.plate.scale.setScalar(s);
    this.draw();
  }
}
