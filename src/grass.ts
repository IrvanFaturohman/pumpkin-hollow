// Tall grass that covers the farm at the start. Walking into it with the sickle cuts it.
// Cut grass slowly grows back unless the spot was cleared for good (fields, buildings, pads).
import * as THREE from 'three';
import { build } from './farm';
import { tweens, ease, rand } from './util';

export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
type Cell = { x: number; z: number; sc: number; r: number; up: boolean; perm: boolean; t: number; k: number };

const tuftGeo = build([
  { geo: new THREE.ConeGeometry(0.11, 0.95, 4), color: 0x6a9f2c, pos: [0, 0.47, 0], rot: [0.12, 0, 0.08] },
  { geo: new THREE.ConeGeometry(0.1, 0.85, 4), color: 0x86b83a, pos: [0.15, 0.42, 0.05], rot: [-0.1, 0, -0.35] },
  { geo: new THREE.ConeGeometry(0.1, 0.8, 4), color: 0x5b8f26, pos: [-0.15, 0.4, -0.04], rot: [0.1, 0, 0.38] },
  { geo: new THREE.ConeGeometry(0.09, 0.75, 4), color: 0x9cc24a, pos: [0.03, 0.37, -0.16], rot: [-0.38, 0, 0] },
  { geo: new THREE.ConeGeometry(0.09, 0.7, 4), color: 0x7aa933, pos: [0.02, 0.35, 0.17], rot: [0.38, 0, 0.1] },
  { geo: new THREE.ConeGeometry(0.06, 0.5, 4), color: 0xc9b25a, pos: [-0.08, 0.6, 0.08], rot: [0.2, 0, 0.5] },
]);
const tuftMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export class TallGrass {
  cells: Cell[] = [];
  mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, area: Rect, step: number, exclude: (x: number, z: number) => boolean) {
    for (let x = area.minX + step / 2; x < area.maxX; x += step) for (let z = area.minZ + step / 2; z < area.maxZ; z += step) {
      const jx = x + rand(-step * 0.3, step * 0.3), jz = z + rand(-step * 0.3, step * 0.3);
      if (exclude(jx, jz)) continue;
      this.cells.push({ x: jx, z: jz, sc: rand(0.85, 1.2), r: rand(0, 6.28), up: true, perm: false, t: 0, k: 1 });
    }
    this.mesh = new THREE.InstancedMesh(tuftGeo, tuftMat, this.cells.length);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.cells.forEach((_, i) => this.write(i));
    scene.add(this.mesh);
  }

  private write(i: number) {
    const c = this.cells[i];
    const k = Math.max(0.001, c.k);
    this.v.set(c.x, 0, c.z);
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.r);
    this.s.set(c.sc * (0.6 + 0.4 * k), c.sc * k, c.sc * (0.6 + 0.4 * k));
    this.m.compose(this.v, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Cut standing grass within radius. Returns the positions that were cut (max `limit`). */
  cutAround(p: THREE.Vector3, radius: number, limit: number) {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < this.cells.length && out.length < limit; i++) {
      const c = this.cells[i];
      if (!c.up) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) > radius) continue;
      this.cutCell(i);
      out.push(new THREE.Vector3(c.x, 0.4, c.z));
    }
    return out;
  }

  private cutCell(i: number, perm = false) {
    const c = this.cells[i];
    c.up = false;
    c.t = rand(38, 55);
    if (perm) c.perm = true;
    tweens.add(0.16, (k) => { c.k = 1 - k; this.write(i); }, { easing: ease.inQuad });
  }

  /** Remove grass for good inside a rect (when something is built there). */
  clearRect(r: Rect) {
    this.cells.forEach((c, i) => {
      if (c.x < r.minX || c.x > r.maxX || c.z < r.minZ || c.z > r.maxZ) return;
      c.perm = true;
      if (c.up) this.cutCell(i, true);
    });
  }

  clearCircle(p: THREE.Vector3, radius: number) {
    this.cells.forEach((c, i) => {
      if (Math.hypot(c.x - p.x, c.z - p.z) > radius) return;
      c.perm = true;
      if (c.up) this.cutCell(i, true);
    });
  }

  /** Share of grass already cut inside a rect (0..1). */
  clearedRatio(r: Rect) {
    let n = 0, cut = 0;
    for (const c of this.cells) {
      if (c.x < r.minX || c.x > r.maxX || c.z < r.minZ || c.z > r.maxZ) continue;
      n++;
      if (!c.up) cut++;
    }
    return n ? cut / n : 1;
  }

  nearestUp(p: THREE.Vector3, r?: Rect) {
    let best: Cell | null = null, bd = Infinity;
    for (const c of this.cells) {
      if (!c.up) continue;
      if (r && (c.x < r.minX || c.x > r.maxX || c.z < r.minZ || c.z > r.maxZ)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? new THREE.Vector3(best.x, 0, best.z) : null;
  }

  /** Cut grass slowly grows back (not where the player is standing). */
  update(dt: number, player: THREE.Vector3) {
    this.cells.forEach((c, i) => {
      if (c.up || c.perm) return;
      c.t -= dt;
      if (c.t > 0) return;
      if (Math.hypot(c.x - player.x, c.z - player.z) < 2.5) { c.t = 3; return; }
      c.up = true;
      tweens.add(0.5, (k) => { c.k = k; this.write(i); }, { easing: ease.outBack });
    });
  }
}
