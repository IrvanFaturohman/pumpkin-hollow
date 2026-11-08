// Pumpkin Hollow — a U-Pick farm arcade idle. Game logic.
import * as THREE from 'three';
import { CFG, UNLOCK, type ItemKind } from './config';
import * as M from './models';
import * as F from './farm';
import { makeChar, animateChar, type Char } from './chars';
import * as A from './assets';
import { TallGrass } from './grass';
import { Particles, WorldUI, Shake } from './fx';
import { Stack, CashPile, Pad } from './parts';
import { sfx } from './audio';
import { rand, pick, clamp, damp, ease, tweens, popIn, squash, arcMove, vibrate } from './util';

type Label = ReturnType<WorldUI['add']>;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const flatDist = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

function angleDamp(a: number, b: number, lambda: number, dt: number) {
  const diff = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + diff * (1 - Math.exp(-lambda * dt));
}
function stepTowards(obj: THREE.Object3D, target: THREE.Vector3, speed: number, dt: number, turn = 12): boolean {
  const dx = target.x - obj.position.x, dz = target.z - obj.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const step = Math.min(d, speed * dt);
  obj.position.x += (dx / d) * step;
  obj.position.z += (dz / d) * step;
  if (turn) obj.rotation.y = angleDamp(obj.rotation.y, Math.atan2(dx, dz), turn, dt);
  return d - step < 0.05;
}

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const rectAt = (x: number, z: number, w: number, d: number): Rect => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

function makeZonePlate(icon: string, size = 1.6, color = 'rgba(255,255,255,0.22)') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.strokeStyle = '#ffffff';
  c.lineWidth = 7;
  c.setLineDash([14, 9]);
  c.beginPath();
  c.roundRect(8, 8, 112, 112, 26);
  c.stroke();
  c.fillStyle = color;
  c.fill();
  c.setLineDash([]);
  c.font = '54px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(icon, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.position.y = 0.06;
  m.renderOrder = 1;
  return m;
}

// =====================================================================
// Layout (north = -z, the road and parking are south at +z)
// =====================================================================
const L = {
  playerStart: V(0.2, 0, 7.6),
  baler: V(3.4, 0, 4.2),
  balerIn: V(3.4, 0, 2.5),
  balerOut: V(5.4, 0, 4.2),
  fieldA: { minX: -7.25, maxX: -1.95, minZ: 3.95, maxZ: 8.25 } as Rect,
  fieldB: { minX: -7.25, maxX: -1.95, minZ: 0.85, maxZ: 4.05 } as Rect,
  hub: V(0.4, 0, 10.6),
  gateIn: V(0, 0, 11.4),
  gateOut: V(0, 0, 13.4),
  roadZ: 17.6,
  parkZ: 14.7,
  parkSlots: [-13.8, -11.2, -8.6, -6.0, -3.4, 3.4, 6.0, 8.6, 11.2, 13.8],
  bounds: { minX: -15.6, maxX: 15.6, minZ: -20.2, maxZ: 12.0 } as Rect,
  patchCols: [-6.6, -5.6, -4.6, -3.6, -2.6],
  patchA: [7.6, 6.6, 5.6, 4.6],
  patchB: [3.5, 2.5, 1.5],
  stand: V(2.4, 0, 8.6),
  standDrop: V(2.4, 0, 7.15),
  standCash: V(4.5, 0, 7.3),
  booth: V(-3.0, 0, 11.0),
  boothPay: V(-3.0, 0, 9.75),
  upickCash: V(-1.35, 0, 10.0),
  upickWait: V(-1.3, 0, 6.4),
  barn: V(-11.6, 0, 7.6),
  farmhouse: V(-12.6, 0, 2.6),
  trees: [V(7.2, 0, 4.6), V(9.8, 0, 4.6), V(12.4, 0, 4.6), V(7.2, 0, 1.4), V(9.8, 0, 1.4), V(12.4, 0, 1.4)],
  ciderStand: V(7.6, 0, 9.0),
  ciderDrop: V(7.6, 0, 7.55),
  ciderCash: V(9.7, 0, 10.4),
  press: V(12.7, 0, 7.4),
  pressIn: V(10.95, 0, 7.4),
  pressOut: V(12.7, 0, 9.5),
  hayStop: 3.2, // distance along the loop where the tractor waits
  hayBoard: V(0.25, 0, -1.4),
  hayCash: V(3.5, 0, -0.9),
  hayGo: V(3.3, 0, -3.9),
  hayPath: [V(1.6, 0, -0.6), V(1.6, 0, -17.0), V(-14.6, 0, -17.0), V(-14.6, 0, -0.6)],
  maze: { minX: -13.4, minZ: -15.8, cell: 1.24, nx: 9, nz: 9 },
  mazeCash: V(-0.6, 0, -3.3),
  bakery: V(7.4, 0, -9.6),
  bakeryCounter: V(7.8, 0, -8.15),
  bakeryDrop: V(5.4, 0, -7.4),
  bakeryCash: V(5.2, 0, -5.5),
  ovenIn: V(10.7, 0, -7.3),
  ovenOut: V(12.5, 0, -9.4),
  stage: V(7.5, 0, -18.4),
};

// =====================================================================

type Plot = {
  pos: THREE.Vector3; root: THREE.Group; soil: THREE.Mesh; sprout: THREE.Mesh; vine: THREE.Mesh; pumpkin: THREE.Object3D; pmat: { color: THREE.Color };
  state: 'empty' | 'growing' | 'ripe'; t: number; size: number; res: unknown; cool: number;
};
type Tree = { root: THREE.Group; pos: THREE.Vector3; apples: (THREE.Object3D | null)[]; spots: THREE.Vector3[]; regrow: number; shakeT: number; wob: number };
type Shop = {
  id: 'stand' | 'cider' | 'pie'; kind: ItemKind; kinds: ItemKind[]; price: number; built: boolean; name: string;
  slots: (THREE.Object3D | null)[]; slotPos: THREE.Vector3[]; drop: THREE.Vector3; spots: THREE.Vector3[]; spotUsed: (Visitor | null)[];
  cash: CashPile; dropT: number; emoji: string;
};
type Machine = {
  id: 'press' | 'oven' | 'baler'; top: THREE.Vector3; spout: THREE.Vector3; inKind: ItemKind; outKind: ItemKind; ratio: number; every: number; inCount: number; inMax: number;
  out: THREE.Object3D[]; outMax: number; inZone: THREE.Vector3; outZone: THREE.Vector3; t: number; built: boolean; group: THREE.Group | null; feedT: number; work: number; label: Label | null;
};
type Act = 'stand' | 'upick' | 'cider' | 'hayride' | 'maze' | 'pie';
type Car = { mesh: THREE.Group; slot: number; state: 'in' | 'park' | 'out'; path: THREE.Vector3[]; members: Visitor[]; back: number; speed: number };
type Visitor = {
  p: Char; car: Car; plan: Act[]; act: Act | null; kid: boolean;
  path: THREE.Vector3[]; speed: number; onArrive: (() => void) | null;
  waitFn: ((dt: number) => boolean) | null; patience: number;
  items: THREE.Object3D[]; bubble: Label | null; shop: Shop | null; spot: number; plot: Plot | null; seat: number;
  state: 'walk' | 'wait' | 'ride' | 'gone';
};
type Worker = { p: Char; role: 'field' | 'orchard'; hand: Stack; state: 'idle' | 'go' | 'act'; target: THREE.Vector3 | null; job: (() => void) | null; t: number; plot: Plot | null; tree: Tree | null; idleSpot: THREE.Vector3 };
type Wild = { id: string; rect: Rect; insts: THREE.InstancedMesh[]; pts: { x: number; z: number; sc: number; r: number }[]; cleared: boolean; collider: Rect | null };
type PadDef = { id: string; name: string; pad: Pad; shown: boolean; done: boolean; when: () => boolean; onBuy: () => void; needExit: boolean; upgrade?: 'basket' | 'boots' | 'grow' };

export type HudEls = {
  money: HTMLElement; moneyBox: HTMLElement; levelNum: HTMLElement; levelFill: HTMLElement; levelText: HTMLElement; levelStar: HTMLElement;
  objective: HTMLElement; objectiveText: HTMLElement; banner: HTMLElement; stage: HTMLElement;
  objIcon: HTMLElement; objBar: HTMLElement; objFill: HTMLElement; objCount: HTMLElement;
};

export class Game {
  time = 0;
  money = CFG.startMoney;
  shownMoney = CFG.startMoney;
  input = new THREE.Vector2();

  player!: Char;
  playerVel = new THREE.Vector3();
  speed = CFG.player.speed[0];
  hand!: Stack;
  handLabel!: Label;
  lv = { basket: 0, boots: 0, grow: 0 };
  growTime = CFG.grow.time[0];
  fullWarnT = 0;

  plots: Plot[] = [];
  trees: Tree[] = [];
  orchard = false;
  upick = false;
  shops: Shop[] = [];
  stand!: Shop;
  cider!: Shop;
  bakery!: Shop;
  press!: Machine;
  oven!: Machine;
  upickCash!: CashPile;
  hayCash!: CashPile;
  mazeCash!: CashPile;
  cashPiles: CashPile[] = [];

  cars: Car[] = [];
  visitors: Visitor[] = [];
  carT = 0;
  slotsUsed: (Car | null)[] = [];

  hay = {
    built: false, tractor: null as THREE.Group | null, wagon: null as THREE.Group | null, state: 'idle' as 'idle' | 'ride', s: L.hayStop,
    seats: [] as (Visitor | null)[], seated: 0, waitT: 0, driver: null as Char | null, segs: [] as number[], total: 0, rides: 0, goPlate: null as THREE.Mesh | null, goLabel: null as Label | null,
  };
  maze = { built: false, cells: [] as { e: boolean; s: boolean }[], inst: null as THREE.InstancedMesh | null, path: [] as THREE.Vector3[] };
  giant: THREE.Group | null = null;

  workers: Worker[] = [];
  grass!: TallGrass;
  baler!: Machine;
  sickle: THREE.Object3D | null = null;
  slash!: THREE.Mesh;
  cutT = 0;
  swingT = 0;
  grassBits = 0;
  wilds: Wild[] = [];
  occluders: { obj: THREE.Object3D; rect: Rect; k: number; mats?: THREE.Material[] }[] = [];
  pads: PadDef[] = [];
  colliders: Rect[] = [];

  objectiveKey = '';
  arrow!: THREE.Group;
  marker!: THREE.Mesh;
  ended = false;
  stats = { bundles: 0, hay: 0, soldPumpkin: 0, planted: 0, harvested: 0, stocked: 0, sold: 0, visitors: 0, collected: 0, apples: 0, rides: 0, maze: 0, pies: 0, upick: 0 };

  constructor(public scene: THREE.Scene, public camera: THREE.PerspectiveCamera, public fx: Particles, public ui: WorldUI, public shake: Shake, public hud: HudEls) {
    this.setup();
  }

  // ===================================================================
  setup() {
    const s = this.scene;
    this.buildGround();
    // player: farmer with straw hat
    this.player = makeChar('farmer', 1.9);
    const hat = F.build([
      { geo: new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), color: 0xe9c25b, pos: [0, 1.36, 0] },
      { geo: new THREE.CylinderGeometry(0.2, 0.25, 0.2, 12), color: 0xe9c25b, pos: [0, 1.46, 0] },
      { geo: new THREE.CylinderGeometry(0.255, 0.255, 0.05, 12), color: 0xc0392b, pos: [0, 1.4, 0] },
    ]);
    const hatM = new THREE.Mesh(hat, F.vcMat);
    hatM.castShadow = true;
    if (!this.player.userData.mixer) this.player.userData.body.add(hatM);
    this.player.position.copy(L.playerStart);
    this.player.rotation.y = Math.PI;
    s.add(this.player);
    // white ring under the player (reference style)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.position.y = 0.05;
    this.player.add(ring);
    // stack rides on the farmer's back (reference style)
    const back = new THREE.Object3D();
    back.position.set(0, 0.95, -0.42);
    this.player.add(back);
    this.hand = new Stack(back, s, CFG.player.basket[0], true);
    // sickle in the right hand + slash arc shown while cutting
    const wrist = this.player.getObjectByName('Wrist.R');
    if (wrist) {
      const sk = F.makeSickle();
      wrist.add(sk);
      this.player.updateMatrixWorld(true);
      const ws = wrist.getWorldScale(V(0, 0, 0));
      sk.scale.setScalar(1 / Math.max(1e-4, ws.x));
      sk.position.set(0, 0, 0);
      this.sickle = sk;
    }
    this.slash = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.2, 24, 1, 0, 2.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.slash.position.y = 0.55;
    this.slash.visible = false;
    this.player.add(this.slash);
    this.handLabel = this.ui.add('timer-bar bag-bar', '<div></div><span></span>', this.player, 2.3);
    this.ui.show(this.handLabel, false);

    // farm stand
    this.stand = this.makeShop('stand', 'hay', CFG.price.hay, L.stand, L.standDrop, L.standCash, 'Farm Stand', '🌾');
    const standM = F.makeFarmStand('FARM STAND');
    standM.position.copy(L.stand);
    s.add(standM);
    this.stand.built = true;
    this.colliders.push(rectAt(L.stand.x, L.stand.z, 2.7, 1.2), rectAt(L.stand.x + 1.55, L.stand.z + 0.2, 0.45, 0.4));
    this.addDropPlate(L.standDrop, '🏪');

    this.upickCash = new CashPile(s, L.upickCash);
    this.hayCash = new CashPile(s, L.hayCash);
    this.mazeCash = new CashPile(s, L.mazeCash);
    this.cashPiles.push(this.stand.cash, this.upickCash, this.hayCash, this.mazeCash);

    // machines (built later)
    this.baler = this.makeMachine('baler', 'grass', 'hay', CFG.baler.grassPerBale, CFG.baler.every, CFG.baler.maxIn, CFG.baler.maxOut, L.balerIn, L.balerOut, L.baler.clone().add(V(-0.3, 1.6, -0.1)), L.baler.clone().add(V(1.5, 0.45, 0)));
    this.press = this.makeMachine('press', 'apple', 'cider', CFG.press.applesPerJug, CFG.press.every, CFG.press.maxIn, CFG.press.maxOut, L.pressIn, L.pressOut, L.press.clone().setY(1.4), L.press.clone().add(V(0, 0.5, 0.7)));
    this.oven = this.makeMachine('oven', 'pumpkin', 'pie', CFG.oven.pumpkinsPerPie, CFG.oven.every, CFG.oven.maxIn, CFG.oven.maxOut, L.ovenIn, L.ovenOut, L.bakery.clone().add(V(2.3, 0.8, 0.9)), L.bakery.clone().add(V(2.3, 0.4, 1.0)));
    this.cider = this.makeShop('cider', 'cider', CFG.price.cider, L.ciderStand, L.ciderDrop, L.ciderCash, 'Cider', '🧃');
    this.bakery = this.makeShop('pie', 'pie', CFG.price.pie, L.bakeryCounter, L.bakeryDrop, L.bakeryCash, 'Pies', '🥧');
    this.cashPiles.push(this.cider.cash, this.bakery.cash);
    this.shops = [this.stand, this.cider, this.bakery];

    // hayride loop
    const hp = L.hayPath;
    for (let i = 0; i < hp.length; i++) {
      const d = flatDist(hp[i], hp[(i + 1) % hp.length]);
      this.hay.segs.push(d);
      this.hay.total += d;
    }
    this.hay.seats = new Array(CFG.hayride.seats).fill(null);

    this.slotsUsed = new Array(L.parkSlots.length).fill(null);
    this.decorate();
    this.buildWilds();
    this.buildGrass();
    this.definePads();

    // guidance arrow + marker
    this.arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.7), new THREE.MeshBasicMaterial({ color: 0xff5d73 }));
    shaft.position.z = 0.35;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5d73 }));
    head.position.z = 0.9;
    head.rotation.z = Math.PI;
    this.arrow.add(shaft, head);
    s.add(this.arrow);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4).rotateX(Math.PI), new THREE.MeshLambertMaterial({ color: 0xff5d73, emissive: 0x551020 }));
    s.add(this.marker);
    this.updateHud(true);
  }

  buildGround() {
    const s = this.scene;
    // big grass ground
    const g = new THREE.Mesh(new THREE.BoxGeometry(140, 1, 140), M.mat(0x9fe050));
    g.position.set(0, -0.5, -4);
    g.receiveShadow = true;
    s.add(g);
    // checker patches for texture
    const tileGeo = new THREE.BoxGeometry(2, 0.02, 2);
    const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 400);
    tiles.receiveShadow = true;
    let n = 0;
    const m = new THREE.Matrix4();
    for (let x = -16; x < 16; x += 2) for (let z = -21; z < 13; z += 2) {
      if (((x + z) / 2) % 2 === 0 || n >= 400) continue;
      m.makeTranslation(x + 1, 0.005, z + 1);
      tiles.setMatrixAt(n, m);
      tiles.setColorAt(n, new THREE.Color(0x95d84a));
      n++;
    }
    tiles.count = n;
    s.add(tiles);
    // road + parking
    const road = new THREE.Mesh(new THREE.BoxGeometry(140, 0.05, 3.2), M.mat(0x5d6574));
    road.position.set(0, 0.02, L.roadZ);
    road.receiveShadow = true;
    s.add(road);
    for (let x = -60; x < 60; x += 2.4) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.14), M.mat(0xffd94a));
      d.position.set(x, 0.05, L.roadZ);
      s.add(d);
    }
    const lot = new THREE.Mesh(new THREE.BoxGeometry(28, 0.04, 3.4), M.mat(0xd9c39a));
    lot.position.set(0, 0.02, L.parkZ);
    lot.receiveShadow = true;
    s.add(lot);
    // dirt paths
    const path = (x: number, z: number, w: number, d: number) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), M.mat(0xe8cf9a));
      p.position.set(x, 0.02, z);
      p.receiveShadow = true;
      s.add(p);
    };
    path(0.2, 10.4, 26, 1.6);
    path(0.2, 3, 1.4, 14);
    path(-0.6, -6, 1.4, 6);
    // fence along the front with a gap for the gate
    for (const [x0, x1] of [[-15.5, -2.1], [2.1, 15.5]]) {
      const f = F.makeRailFence(x1 - x0);
      f.position.set((x0 + x1) / 2, 0, 12.45);
      s.add(f);
    }
    const sideFence = (x: number) => {
      const f = F.makeRailFence(33);
      f.rotation.y = Math.PI / 2;
      f.position.set(x, 0, -4);
      s.add(f);
    };
    sideFence(-15.9);
    sideFence(15.9);
    const back = F.makeRailFence(31.8);
    back.position.set(0, 0, -20.6);
    s.add(back);
    const gate = F.makeGate();
    gate.position.set(0, 0, 12.45);
    s.add(gate);
    this.colliders.push(rectAt(-1.9, 12.45, 0.4, 0.4), rectAt(1.9, 12.45, 0.4, 0.4));
  }

  decorate() {
    const s = this.scene;
    const barn = F.makeBarn();
    barn.position.copy(L.barn);
    s.add(barn);
    this.occluders.push({ obj: barn, rect: { minX: L.barn.x - 2.6, maxX: L.barn.x + 4.3, minZ: L.barn.z - 6.5, maxZ: L.barn.z - 0.3 }, k: 1 });
    this.colliders.push(rectAt(L.barn.x, L.barn.z, 4.0, 4.3), rectAt(L.barn.x + 2.9, L.barn.z - 0.6, 2.1, 2.1));
    const scare = F.makeScarecrow();
    scare.position.set(-7.8, 0, 2.2);
    s.add(scare);
    for (const [x, z, r] of [[-8.8, 11.4, 0], [-14.6, 11.2, 0.4], [4.6, 11.5, 0], [-7.6, 0.4, 0.5]] as [number, number, number][]) {
      const h = F.makeHay();
      h.position.set(x, 0, z);
      h.rotation.y = r;
      s.add(h);
    }
    // pumpkin piles near the gate (decor)
    for (const [x, z] of [[-2.6, 12.0], [2.6, 12.0], [-1.6, 11.8], [1.7, 11.8]] as [number, number][]) {
      const p = F.makePumpkin();
      p.position.set(x, 0, z);
      p.scale.setScalar(rand(1.0, 1.4));
      p.rotation.y = rand(0, 6);
      s.add(p);
    }
    for (let i = 0; i < 7; i++) {
      const sf = F.makeSunflower();
      sf.position.set(-15.2 + i * 0.45, 0, 4.8 + (i % 2) * 0.3);
      s.add(sf);
    }
    // decor along the hayride trail (north field)
    for (const [x, z, r] of [[3.1, -12.5, 0.2], [3.1, -15.6, -0.3], [-10.5, -18.7, 0.1], [-3.5, -18.8, 0.5], [13.6, -13.5, 0.3], [14.2, -1.6, 0.1]] as [number, number, number][]) {
      const h = F.makeHay();
      h.position.set(x, 0, z);
      h.rotation.y = r;
      s.add(h);
    }
    for (const [x, z] of [[2.9, -9.4], [3.3, -9.0], [13.2, -6.2], [14.4, -6.8], [12.8, -16.8], [-15.2, -19.2], [4.2, -19.4], [14.6, 3.2], [-8.4, -1.7], [-3.4, -1.8]] as [number, number][]) {
      const p = F.makePumpkin();
      p.position.set(x, 0, z);
      p.scale.setScalar(rand(0.9, 1.3));
      p.rotation.y = rand(0, 6);
      s.add(p);
    }
    const scare2 = F.makeScarecrow();
    scare2.position.set(12.2, 0, -3.6);
    scare2.rotation.y = -0.5;
    s.add(scare2);
    this.forest();
    // a few bushes along the fence
    for (const [x, z, k] of [[-15.0, 11.6, 'bush'], [-6.6, 11.8, 'bush_berries'], [6.8, 11.8, 'bush'], [15.0, 9.0, 'bush_berries'], [-15.0, -6.0, 'bush'], [15.1, -12.0, 'bush'], [-15.0, -14.0, 'bush_berries'], [9.8, -19.8, 'bush']] as [number, number, string][]) {
      if (!A.has(k)) continue;
      const b = A.model(k, { height: 0.9 });
      b.position.set(x, 0, z);
      b.rotation.y = rand(0, 6);
      s.add(b);
    }
  }

  /** Dense pine forest around the farm (instanced), with a few autumn trees mixed in. */
  forest() {
    const s = this.scene;
    const pts: { x: number; z: number; sc: number; r: number }[] = [];
    const inPlay = (x: number, z: number) => Math.abs(x) < 17.2 && z > -22.2 && z < 20.0;
    const nearRoad = (z: number) => z > 15.6 && z < 19.8;
    for (let x = -26; x <= 26; x += 2.0) for (let z = -30; z <= 27; z += 2.0) {
      const jx = x + rand(-0.7, 0.7), jz = z + rand(-0.7, 0.7);
      if (inPlay(jx, jz) || nearRoad(jz)) continue;
      if (Math.abs(jx) > 24 && Math.random() < 0.5) continue;
      pts.push({ x: jx, z: jz, sc: rand(0.8, 1.25), r: rand(0, 6.28) });
    }
    if (A.has('pine')) {
      const parts = A.flatGeometry('pine', 3.8);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.geo, part.mat, pts.length);
        pts.forEach((p, i) => {
          m.compose(V(p.x, 0, p.z), q.setFromAxisAngle(V(0, 1, 0), p.r), V(p.sc, p.sc * rand(0.95, 1.1), p.sc));
          inst.setMatrixAt(i, m);
        });
        inst.receiveShadow = true;
        s.add(inst);
      }
    }
    // autumn colour accents just outside the fence
    let k = 0;
    for (const [x, z, sc] of [[-17.8, 8, 1.3], [-18, -4, 1.5], [-17.9, -14, 1.4], [17.8, 4, 1.4], [18, -8, 1.3], [17.8, -17, 1.5], [-8, 20.6, 1.4], [6, 20.8, 1.5], [-3, -23, 1.4], [5, -23.2, 1.3]] as [number, number, number][]) {
      const t = F.makeFallTree(sc, F.FALL_COLORS[k++ % F.FALL_COLORS.length]);
      t.position.set(x, 0, z);
      s.add(t);
    }
  }

  // ---------------- Wild (locked) areas ----------------

  private geoCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }[]>();
  wildParts(kind: 'pine' | 'bush' | 'grass') {
    let parts = this.geoCache.get(kind);
    if (parts) return parts;
    if (kind === 'pine' && A.has('pine')) parts = A.flatGeometry('pine', 3.2);
    else if (kind === 'bush' && A.has('bush')) parts = A.flatGeometry('bush', 0.95);
    else {
      const tuft = F.build([
        { geo: new THREE.ConeGeometry(0.13, 0.95, 4), color: 0x6fbf3a, pos: [0, 0.47, 0], rot: [0.15, 0, 0.1] },
        { geo: new THREE.ConeGeometry(0.12, 0.85, 4), color: 0x86d14a, pos: [0.18, 0.42, 0.05], rot: [-0.1, 0, -0.35] },
        { geo: new THREE.ConeGeometry(0.12, 0.8, 4), color: 0x5aa832, pos: [-0.18, 0.4, -0.04], rot: [0.1, 0, 0.4] },
        { geo: new THREE.ConeGeometry(0.11, 0.75, 4), color: 0xa6d95a, pos: [0.03, 0.37, -0.18], rot: [-0.4, 0, 0] },
        { geo: new THREE.ConeGeometry(0.11, 0.7, 4), color: 0x7cc943, pos: [0.02, 0.35, 0.2], rot: [0.4, 0, 0.1] },
      ]);
      parts = [{ geo: tuft, mat: F.vcMat }];
    }
    this.geoCache.set(kind, parts);
    return parts;
  }

  makeWild(id: string, rect: Rect, kinds: { kind: 'pine' | 'bush' | 'grass'; step: number }[], blocks: boolean, keepOut: THREE.Vector3[] = []) {
    const w: Wild = { id, rect, insts: [], pts: [], cleared: false, collider: null };
    for (const k of kinds) {
      const pts: Wild['pts'] = [];
      for (let x = rect.minX + k.step / 2; x < rect.maxX; x += k.step) for (let z = rect.minZ + k.step / 2; z < rect.maxZ; z += k.step) {
        const jx = clamp(x + rand(-k.step * 0.35, k.step * 0.35), rect.minX + 0.2, rect.maxX - 0.2);
        const jz = clamp(z + rand(-k.step * 0.35, k.step * 0.35), rect.minZ + 0.2, rect.maxZ - 0.2);
        if (keepOut.some((p) => Math.hypot(p.x - jx, p.z - jz) < 1.7)) continue;
        pts.push({ x: jx, z: jz, sc: rand(0.75, 1.2), r: rand(0, 6.28) });
      }
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (const part of this.wildParts(k.kind)) {
        const inst = new THREE.InstancedMesh(part.geo, part.mat, pts.length);
        pts.forEach((p, i) => {
          m.compose(V(p.x, 0, p.z), q.setFromAxisAngle(V(0, 1, 0), p.r), V(p.sc, p.sc, p.sc));
          inst.setMatrixAt(i, m);
        });
        inst.castShadow = k.kind !== 'grass';
        inst.receiveShadow = true;
        inst.userData.pts = pts;
        this.scene.add(inst);
        w.insts.push(inst);
      }
      w.pts.push(...pts);
    }
    if (blocks) {
      w.collider = { ...rect };
      this.colliders.push(w.collider);
    }
    this.wilds.push(w);
    return w;
  }

  /** Trees and bushes pop away in a wave from the pad, then the area is free. */
  clearWild(id: string, origin: THREE.Vector3) {
    const w = this.wilds.find((x) => x.id === id);
    if (!w || w.cleared) return;
    w.cleared = true;
    if (w.collider) this.colliders.splice(this.colliders.indexOf(w.collider), 1);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let maxDelay = 0;
    for (const inst of w.insts) {
      const pts = inst.userData.pts as Wild['pts'];
      pts.forEach((p, i) => {
        const d = Math.hypot(p.x - origin.x, p.z - origin.z);
        const delay = d * 0.05;
        maxDelay = Math.max(maxDelay, delay);
        tweens.add(0.3, (k) => {
          const s = p.sc * (k < 0.3 ? 1 + k * 0.6 : Math.max(0.001, 1.18 * (1 - (k - 0.3) / 0.7)));
          m.compose(V(p.x, 0, p.z), q.setFromAxisAngle(V(0, 1, 0), p.r + k * 2), V(s, s, s));
          inst.setMatrixAt(i, m);
          inst.instanceMatrix.needsUpdate = true;
        }, { delay, easing: ease.inQuad, done: () => { if (inst === w.insts[0] && i % 3 === 0) this.fx.puff(V(p.x, 0.6, p.z), 3, 0xb8e07a, 0.35, 0.9); } });
      });
    }
    tweens.add(0.01, () => {}, { delay: maxDelay + 0.35, done: () => { for (const inst of w.insts) { inst.removeFromParent(); inst.dispose(); } } });
    sfx.rustle();
    this.shake.add(0.15);
  }

  buildWilds() {
    // tall grass where the second patch goes
    // orchard + cider corner: pines and bushes
    this.makeWild('orchard', { minX: 6.2, maxX: 15.4, minZ: 0.1, maxZ: 6.2 }, [{ kind: 'pine', step: 2.1 }, { kind: 'bush', step: 1.6 }], true);
    this.makeWild('cider', { minX: 9.6, maxX: 15.4, minZ: 6.2, maxZ: 11.6 }, [{ kind: 'bush', step: 1.3 }, { kind: 'grass', step: 0.8 }], true);
    // north field: maze, bakery, fair stage
    this.makeWild('maze', { minX: -13.4, maxX: -2.3, minZ: -15.8, maxZ: -4.7 }, [{ kind: 'pine', step: 2.2 }, { kind: 'grass', step: 1.0 }], true);
    this.makeWild('bakery', { minX: 4.6, maxX: 15.4, minZ: -11.8, maxZ: -8.6 }, [{ kind: 'pine', step: 2.0 }, { kind: 'bush', step: 1.7 }], true);
    this.makeWild('stage', { minX: 4.4, maxX: 11.0, minZ: -20.4, maxZ: -16.6 }, [{ kind: 'pine', step: 2.0 }], true);
    // permanent woods filling empty corners (never cleared)
    this.makeWild('woodsEast', { minX: 5.0, maxX: 15.4, minZ: -4.4, maxZ: -0.4 }, [{ kind: 'pine', step: 2.2 }, { kind: 'bush', step: 2.0 }], true);
    this.makeWild('woodsNE', { minX: 11.4, maxX: 15.4, minZ: -20.4, maxZ: -12.0 }, [{ kind: 'pine', step: 2.0 }], true);
    this.makeWild('woodsMid', { minX: -12.8, maxX: -1.4, minZ: -20.4, maxZ: -18.0 }, [{ kind: 'pine', step: 2.3 }], true);
  }

  buildGrass() {
    const inR = (x: number, z: number, r: Rect) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
    const ex = (x: number, z: number) =>
      inR(x, z, { minX: -0.65, maxX: 1.05, minZ: -1, maxZ: 13 }) ||
      inR(x, z, { minX: -16, maxX: 16, minZ: 9.55, maxZ: 13 }) ||
      inR(x, z, rectAt(L.barn.x, L.barn.z, 4.6, 4.9)) || inR(x, z, rectAt(L.barn.x + 2.9, L.barn.z - 0.6, 2.7, 2.7)) ||
      inR(x, z, rectAt(L.stand.x + 0.6, L.stand.z - 0.5, 4.8, 3.4)) ||
      inR(x, z, rectAt(L.baler.x + 0.7, L.baler.z, 4.4, 3.8)) ||
      Math.hypot(x - L.playerStart.x, z - L.playerStart.z) < 1.3;
    this.grass = new TallGrass(this.scene, { minX: -15.4, maxX: 6.0, minZ: -0.15, maxZ: 9.6 }, 0.56, ex);
  }

  buildBaler() {
    const b = F.makeBaler();
    b.position.copy(L.baler);
    this.scene.add(b);
    popIn(b, 0.5);
    this.baler.group = b;
    this.baler.built = true;
    this.colliders.push(rectAt(L.baler.x, L.baler.z, 2.1, 1.5));
    this.addDropPlate(L.balerIn, '🌿');
    this.addDropPlate(L.balerOut, '📦');
    this.baler.label = this.ui.add('tag', '', L.baler.clone().setY(2.5), 0);
    this.showBanner('HAY BALER FIXED!', 'Bring cut grass, get hay bales');
  }

  buildField() {
    this.grass.clearRect({ minX: L.fieldA.minX - 0.3, maxX: L.fieldA.maxX + 0.3, minZ: L.fieldA.minZ - 0.1, maxZ: L.fieldA.maxZ + 0.3 });
    popIn(this.bed(L.patchA), 0.45);
    let i = 0;
    for (const z of L.patchA) for (const x of L.patchCols) this.addPlot(V(x, 0, z), true, 0.15 + 0.03 * i++);
    if (!this.stand.kinds.includes('pumpkin')) this.stand.kinds.push('pumpkin');
    this.fx.puff(V(-4.6, 0.3, 6.1), 24, 0x9a6a3a, 0.5, 2.2);
    this.showBanner('PUMPKIN FIELD!', 'Walk on the soil to sow seeds');
  }

  /** Big tilled soil bed under a group of plots (reference style: one large field). */
  bed(rows: number[]) {
    const minX = Math.min(...L.patchCols) - 0.62, maxX = Math.max(...L.patchCols) + 0.62;
    const minZ = Math.min(...rows) - 0.62, maxZ = Math.max(...rows) + 0.62;
    const w = maxX - minX, d = maxZ - minZ;
    const shape = new THREE.Shape();
    const r = 0.35, x0 = -w / 2, z0 = -d / 2;
    shape.moveTo(x0 + r, z0);
    shape.lineTo(x0 + w - r, z0); shape.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r);
    shape.lineTo(x0 + w, z0 + d - r); shape.quadraticCurveTo(x0 + w, z0 + d, x0 + w - r, z0 + d);
    shape.lineTo(x0 + r, z0 + d); shape.quadraticCurveTo(x0, z0 + d, x0, z0 + d - r);
    shape.lineTo(x0, z0 + r); shape.quadraticCurveTo(x0, z0, x0 + r, z0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.08, bevelSegments: 2 });
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.mat(0x8a5634));
    m.position.set((minX + maxX) / 2, 0.1, (minZ + maxZ) / 2);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  addDropPlate(pos: THREE.Vector3, icon: string) {
    const p = makeZonePlate(icon, 1.6);
    p.position.set(pos.x, 0.06, pos.z);
    this.scene.add(p);
    popIn(p, 0.4);
    return p;
  }

  addPlot(pos: THREE.Vector3, animate: boolean, delay = 0) {
    const root = new THREE.Group();
    root.position.copy(pos);
    const soil = new THREE.Mesh(F.soilGeo, F.vcMat);
    soil.receiveShadow = true;
    soil.scale.set(0.86, 0.6, 0.86);
    soil.position.y = 0.06;
    root.add(soil);
    const sprout = new THREE.Mesh(F.sproutGeo, F.vcMat);
    sprout.visible = false;
    root.add(sprout);
    const vine = new THREE.Mesh(F.vineGeo, F.vcMat);
    vine.visible = false;
    vine.castShadow = true;
    root.add(vine);
    const gp = F.makeGrowingPumpkin();
    const pumpkin = gp.obj;
    const pmat = { color: gp.color };
    pumpkin.position.y = 0.1;
    pumpkin.visible = false;
    root.add(pumpkin);
    this.scene.add(root);
    if (animate) popIn(root, 0.45, delay);
    const plot: Plot = { pos: pos.clone(), root, soil, sprout, vine, pumpkin, pmat, state: 'empty', t: 0, size: 1, res: null, cool: 0 };
    this.plots.push(plot);
    return plot;
  }

  makeShop(id: Shop['id'], kind: ItemKind, price: number, at: THREE.Vector3, drop: THREE.Vector3, cashAt: THREE.Vector3, name: string, emoji: string): Shop {
    const slotPos: THREE.Vector3[] = [];
    if (id === 'pie') {
      for (const dz of [-0.15, 0.15]) for (const dx of [-0.6, 0, 0.6]) slotPos.push(V(at.x + dx, 0.88, at.z + dz));
    } else {
      for (const dz of [-0.22, 0.22]) for (const dx of [-0.9, -0.3, 0.3, 0.9]) slotPos.push(V(at.x + dx, 0.82, at.z + dz));
    }
    const front = id === 'pie' ? at.z + 1.25 : at.z + 1.3;
    const spots = [V(at.x - 0.8, 0, front), V(at.x, 0, front + 0.1), V(at.x + 0.8, 0, front)];
    return {
      id, kind, kinds: [kind], price, built: false, name, emoji, slots: new Array(slotPos.length).fill(null), slotPos, drop, spots, spotUsed: [null, null, null],
      cash: new CashPile(this.scene, cashAt), dropT: 0,
    };
  }

  makeMachine(id: Machine['id'], inKind: ItemKind, outKind: ItemKind, ratio: number, every: number, inMax: number, outMax: number, inZone: THREE.Vector3, outZone: THREE.Vector3, top: THREE.Vector3, spout: THREE.Vector3): Machine {
    return { id, top, spout, inKind, outKind, ratio, every, inCount: 0, inMax, out: [], outMax, inZone, outZone, t: 0, built: false, group: null, feedT: 0, work: 0, label: null };
  }

  // ===================================================================
  // Pads
  // ===================================================================

  definePads() {
    const add = (id: string, name: string, icon: string, pos: THREE.Vector3, price: number, when: () => boolean, onBuy: () => void, upgrade?: PadDef['upgrade']) => {
      const pad = new Pad(this.scene, pos, name, price, 1, icon);
      const d: PadDef = { id, name, pad, shown: false, done: false, when, onBuy, needExit: false, upgrade };
      this.pads.push(d);
      return d;
    };
    const done = (id: string) => this.pads.find((p) => p.id === id)?.done ?? false;
    add('baler', 'Fix Hay Baler', '🔧', L.baler.clone(), UNLOCK.baler, () => this.stats.bundles >= 4, () => this.buildBaler());
    add('field', 'Pumpkin Field', '🎃', V(-4.6, 0, 6.1), UNLOCK.field, () => this.baler.built && this.stats.hay >= 2 && this.grass.clearedRatio(L.fieldA) >= 0.8, () => this.buildField());
    add('patchB', 'More Pumpkins', '🎃', V(-4.6, 0, 2.5), UNLOCK.patchB, () => done('field') && this.stats.soldPumpkin >= 2, () => { this.grass.clearRect({ minX: L.fieldB.minX - 0.3, maxX: L.fieldB.maxX + 0.3, minZ: L.fieldB.minZ - 0.3, maxZ: L.fieldB.maxZ }); this.buildPatchB(); });
    add('upick', 'U-Pick Patch', '🧺', V(-5.6, 0, 9.85), UNLOCK.upick, () => done('patchB') && this.stats.soldPumpkin >= 6, () => this.buildUpick());
    add('orchard', 'Orchard & Cider', '🍎', V(5.2, 0, 1.3), UNLOCK.orchard, () => done('upick') && this.stats.upick >= 1, () => { this.clearWild('orchard', V(5.2, 0, 1.3)); this.clearWild('cider', V(5.2, 0, 1.3)); this.buildOrchard(); this.buildCider(); });
    add('farmhand1', 'Farmhand', '👩‍🌾', V(-13.2, 0, 3.4), UNLOCK.farmhand1, () => done('orchard') && this.stats.apples >= 4, () => this.hireWorker('field'));
    add('hayride', 'Hayride', '🚜', V(1.6, 0, -2.6), UNLOCK.hayride, () => done('orchard') && this.stats.apples >= 4, () => this.buildHayride());
    add('driver', 'Tractor Driver', '🧑‍🌾', V(-1.0, 0, 1.4), UNLOCK.driver, () => done('hayride') && this.stats.rides >= 2, () => this.hireDriver());
    add('maze', 'Corn Maze', '🌽', V(-7.8, 0, -3.0), UNLOCK.maze, () => done('hayride') && this.stats.rides >= 1, () => { this.clearWild('maze', V(-7.8, 0, -3.0)); this.buildMaze(); });
    add('bakery', 'Pie Shop', '🥧', V(7.4, 0, -7.4), UNLOCK.bakery, () => done('maze'), () => { this.clearWild('bakery', V(7.4, 0, -7.4)); this.buildBakery(); });
    add('farmhand2', 'Orchard Hand', '🍏', V(-10.9, 0, 3.4), UNLOCK.farmhand2, () => done('bakery'), () => this.hireWorker('orchard'));
    add('giant', 'Giant Pumpkin', '🏆', V(7.5, 0, -15.6), UNLOCK.giant, () => done('bakery') && this.stats.pies >= 2, () => { this.clearWild('stage', V(7.5, 0, -15.6)); this.growGiant(); });
    // upgrades at the barn
    add('basket', 'Bigger Basket', '🧺', V(-13.0, 0, 10.95), CFG.player.basketPrice[0], () => done('patchB'), () => {}, 'basket');
    add('grow', 'Fertilizer', '🌱', V(-10.8, 0, 10.95), CFG.grow.timePrice[0], () => done('upick'), () => {}, 'grow');
    add('boots', 'Fast Boots', '👢', V(-8.6, 0, 10.95), CFG.player.speedPrice[0], () => done('orchard'), () => {}, 'boots');
  }

  private payAcc = 0;
  private billT = 0;
  private brokeT = 0;

  payInto(pad: Pad, dt: number) {
    if (this.money <= 0) {
      this.brokeT += dt;
      if (this.brokeT > 0.6) {
        this.brokeT = -2;
        this.ui.float(pad.pos.clone().setY(1.6), 'Need more coins!', '#ff8a8a', 18);
        sfx.denied();
      }
      return false;
    }
    const rate = Math.max(14, pad.price / 1.1);
    this.payAcc += rate * dt;
    const pay = Math.min(Math.floor(this.payAcc), Math.ceil(pad.remaining), Math.floor(this.money));
    if (pay > 0) {
      this.payAcc -= pay;
      this.money -= pay;
      pad.remaining -= pay;
      pad.setProgress(1 - pad.remaining / pad.price);
      sfx.payTick(1 - pad.remaining / pad.price);
    }
    this.billT += dt;
    if (this.billT > 0.06) {
      this.billT = 0;
      const coin = new THREE.Mesh(F.coinGeo, F.coinMat);
      this.scene.add(coin);
      coin.position.copy(this.player.localToWorld(V(0, 1.2, 0.2)));
      arcMove(coin, coin.position.clone(), pad.pos.clone().setY(0.15), 0.25, 1.0, () => coin.removeFromParent(), 6);
    }
    if (pad.remaining <= 0) {
      sfx.unlock();
      vibrate(25);
      this.shake.add(0.3);
      this.fx.puff(pad.pos.clone().setY(0.3), 14, 0xffffff, 0.45, 1.4);
      this.fx.confetti(pad.pos.clone().setY(0.5), 40);
      return true;
    }
    return false;
  }

  standing(pad: Pad) {
    return pad.visible && flatDist(this.player.position, pad.pos) < 1.05;
  }

  updatePads(dt: number) {
    for (const d of this.pads) {
      if (d.done) continue;
      if (!d.shown && d.when()) {
        if (d.needExit && flatDist(this.player.position, d.pad.pos) < 1.3) continue;
        d.shown = true;
        d.needExit = false;
        this.grass?.clearCircle(d.pad.pos, 1.3);
        d.pad.show();
      }
      if (!d.pad.visible) continue;
      d.pad.update(dt, this.money >= d.pad.remaining);
      if (this.standing(d.pad) && this.payInto(d.pad, dt)) {
        if (d.upgrade) {
          this.applyUpgrade(d);
        } else {
          d.done = true;
          d.pad.hide();
          d.onBuy();
        }
      }
    }
  }

  applyUpgrade(d: PadDef) {
    const u = d.upgrade!;
    this.lv[u]++;
    let msg = '';
    if (u === 'basket') { this.hand.capacity = CFG.player.basket[this.lv.basket]; msg = `Basket holds ${this.hand.capacity}!`; }
    if (u === 'boots') { this.speed = CFG.player.speed[this.lv.boots]; msg = 'Faster boots!'; }
    if (u === 'grow') { this.growTime = CFG.grow.time[this.lv.grow]; msg = 'Pumpkins grow faster!'; }
    this.ui.float(this.player.position.clone().setY(2.4), msg, '#ffffff', 22, 1.4);
    sfx.levelUp();
    const prices = u === 'basket' ? CFG.player.basketPrice : u === 'boots' ? CFG.player.speedPrice : CFG.grow.timePrice;
    const lvl = this.lv[u];
    d.pad.hide();
    if (lvl < prices.length) {
      d.pad.setPrice(prices[lvl], `${d.name.split(' Lv')[0]} Lv${lvl + 1}`);
      d.shown = false;
      d.needExit = true;
    } else d.done = true;
  }

  // ===================================================================
  // Unlocks
  // ===================================================================

  buildPatchB() {
    let i = 0;
    popIn(this.bed(L.patchB), 0.4);
    for (const z of L.patchB) for (const x of L.patchCols) this.addPlot(V(x, 0, z), true, 0.05 * i++);
    this.fx.puff(V(-4.5, 0.3, 2.6), 20, 0x9a6a3a, 0.5, 2);
    this.showBanner('MORE PUMPKINS!', 'Plant the new patch');
  }

  buildUpick() {
    this.upick = true;
    const b = F.makeBooth('U-PICK', 0x2f9e5a);
    b.position.copy(L.booth);
    b.rotation.y = Math.PI;
    this.scene.add(b);
    popIn(b, 0.5);
    this.colliders.push(rectAt(L.booth.x, L.booth.z, 1.8, 1.4));
    const sign = F.makeSign(`U-PICK $${CFG.price.upick}`, '#2f9e5a', '#ffffff', 1.4, 0.45, 70);
    const post = M.box(0.1, 1.4, 0.1, 0x7a4f2e);
    const g = new THREE.Group();
    post.position.y = 0.7;
    sign.position.set(0, 1.35, 0.06);
    g.add(post, sign);
    g.position.set(-1.6, 0, 8.4);
    g.rotation.y = 0.3;
    this.scene.add(g);
    popIn(g, 0.5, 0.15);
    this.showBanner('U-PICK IS OPEN!', 'Visitors pick their own pumpkins — keep planting!');
  }

  buildOrchard() {
    this.orchard = true;
    L.trees.forEach((pos, i) => {
      const root = F.makeAppleTree();
      root.position.copy(pos);
      root.rotation.y = rand(0, 6);
      this.scene.add(root);
      popIn(root, 0.6, i * 0.08);
      const spots: THREE.Vector3[] = root.userData.spots;
      const tree: Tree = { root, pos: pos.clone(), apples: spots.map(() => null), spots, regrow: rand(0, 1), shakeT: 0, wob: 0 };
      for (let k = 0; k < CFG.apples.perTree; k++) this.growApple(tree, 0.5 + i * 0.08 + k * 0.05);
      this.trees.push(tree);
      this.colliders.push(rectAt(pos.x, pos.z, 0.45, 0.45));
    });
  }

  growApple(t: Tree, delay = 0) {
    const i = t.apples.findIndex((a) => a === null);
    if (i < 0) return;
    const a = F.makeApple();
    a.position.copy(t.spots[i]).add(V(0, -0.16, 0));
    t.root.add(a);
    t.apples[i] = a;
    popIn(a, 0.35, delay, 1.6);
  }

  buildCider() {
    const st = F.makeFarmStand(`CIDER $${CFG.price.cider}`, 0xc0392b);
    st.position.copy(L.ciderStand);
    this.scene.add(st);
    popIn(st, 0.5);
    this.cider.built = true;
    this.colliders.push(rectAt(L.ciderStand.x, L.ciderStand.z, 2.7, 1.2), rectAt(L.ciderStand.x + 1.55, L.ciderStand.z + 0.2, 0.45, 0.4));
    this.addDropPlate(L.ciderDrop, '🧃');
    const pr = F.makePress();
    pr.position.copy(L.press);
    this.scene.add(pr);
    popIn(pr, 0.5, 0.15);
    this.press.group = pr;
    this.press.built = true;
    this.colliders.push(rectAt(L.press.x, L.press.z, 1.9, 1.4));
    this.addDropPlate(L.pressIn, '🍎');
    this.addDropPlate(L.pressOut, '📦');
    this.press.label = this.ui.add('tag', '', L.press.clone().setY(2.6), 0);
    this.showBanner('ORCHARD & CIDER MILL!', 'Shake apples, press them into cider');
  }

  buildBakery() {
    const b = F.makeBakery();
    b.position.copy(L.bakery);
    this.scene.add(b);
    popIn(b, 0.5);
    this.bakery.built = true;
    this.oven.group = b;
    this.oven.built = true;
    this.colliders.push(rectAt(L.bakery.x, L.bakery.z, 3.5, 2.5), rectAt(L.bakery.x + 0.4, L.bakery.z + 1.45, 1.9, 0.6), rectAt(L.bakery.x + 2.3, L.bakery.z + 0.2, 1.7, 1.7));
    this.addDropPlate(L.bakeryDrop, '🥧');
    this.addDropPlate(L.ovenIn, '🎃');
    this.addDropPlate(L.ovenOut, '📦');
    this.oven.label = this.ui.add('tag', '', L.bakery.clone().add(V(2.3, 2.0, 0.2)), 0);
    this.showBanner('PIE SHOP!', `2 pumpkins = 1 pie · $${CFG.price.pie} each`);
  }

  buildHayride() {
    this.hay.built = true;
    const t = F.makeTractor();
    const w = F.makeWagon();
    this.scene.add(t, w);
    this.hay.tractor = t;
    this.hay.wagon = w;
    this.placeHay(L.hayStop, 0, true);
    popIn(t, 0.5);
    popIn(w, 0.5, 0.1);
    this.hay.goPlate = this.addDropPlate(L.hayGo, '🚜');
    this.hay.goLabel = this.ui.add('tag', 'GO!', L.hayGo.clone().setY(0.8), 0);
    this.ui.show(this.hay.goLabel, false);
    const sign = F.makeSign(`HAYRIDE $${CFG.price.hayride}`, '#d32f2f', '#ffffff', 1.5, 0.45, 70);
    const post = M.box(0.1, 1.4, 0.1, 0x7a4f2e);
    post.position.y = 0.7;
    sign.position.set(0, 1.35, 0.06);
    const g = new THREE.Group();
    g.add(post, sign);
    g.position.set(-0.9, 0, 0.6);
    this.scene.add(g);
    popIn(g, 0.4, 0.2);
    this.showBanner('HAYRIDE!', 'Fill the wagon, then stand on 🚜 to start the ride');
  }

  hireDriver() {
    const d = makeChar('worker', 1.5);
    d.userData.seated = true;
    this.hay.tractor!.userData.driverSeat.add(d);
    d.position.set(0, -0.3, 0);
    d.userData.legL.rotation.x = -1.4;
    d.userData.legR.rotation.x = -1.4;
    d.userData.armL.rotation.x = -1.0;
    d.userData.armR.rotation.x = -1.0;
    popIn(d, 0.4);
    this.hay.driver = d;
    this.fx.confetti(this.hay.tractor!.position.clone().setY(1.5), 30);
    this.showBanner('DRIVER HIRED!', 'Hayrides now start on their own');
  }

  buildMaze() {
    this.maze.built = true;
    const mz = L.maze;
    const nx = mz.nx, nz = mz.nz, cs = mz.cell;
    // deterministic maze (DFS backtracker)
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cells = Array.from({ length: nx * nz }, () => ({ e: true, s: true }));
    const seen = new Array(nx * nz).fill(false);
    const stack = [0];
    seen[0] = true;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const cx = c % nx, cz = Math.floor(c / nx);
      const nb: [number, string][] = [];
      if (cx > 0 && !seen[c - 1]) nb.push([c - 1, 'w']);
      if (cx < nx - 1 && !seen[c + 1]) nb.push([c + 1, 'e']);
      if (cz > 0 && !seen[c - nx]) nb.push([c - nx, 'n']);
      if (cz < nz - 1 && !seen[c + nx]) nb.push([c + nx, 's']);
      if (!nb.length) { stack.pop(); continue; }
      const [n, dir] = nb[Math.floor(rnd() * nb.length)];
      if (dir === 'e') cells[c].e = false;
      if (dir === 'w') cells[n].e = false;
      if (dir === 's') cells[c].s = false;
      if (dir === 'n') cells[n].s = false;
      seen[n] = true;
      stack.push(n);
    }
    this.maze.cells = cells;
    const entry = (nz - 1) * nx + (nx - 1); // south-east cell
    const exit = nx - 1; // north-east cell
    // wall segments -> corn positions
    const pts: THREE.Vector3[] = [];
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      for (const t of [0, 0.33, 0.66]) pts.push(V(x0 + (x1 - x0) * t + rand(-0.05, 0.05), 0, z0 + (z1 - z0) * t + rand(-0.05, 0.05)));
    };
    const X = (i: number) => mz.minX + i * cs, Z = (j: number) => mz.minZ + j * cs;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const c = cells[j * nx + i];
      const isEntry = j * nx + i === entry, isExit = j * nx + i === exit;
      if (c.e && !(i === nx - 1 && (isEntry || isExit))) seg(X(i + 1), Z(j), X(i + 1), Z(j + 1));
      if (c.s) seg(X(i), Z(j + 1), X(i + 1), Z(j + 1));
      if (i === 0) seg(X(0), Z(j), X(0), Z(j + 1));
      if (j === 0) seg(X(i), Z(0), X(i + 1), Z(0));
    }
    pts.push(V(X(nx), 0, Z(nz)));
    const inst = new THREE.InstancedMesh(F.cornGeo, F.cornMat, pts.length);
    inst.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const origin = V(-7.8, 0, -4.2);
    const scales = pts.map(() => rand(0.85, 1.1));
    const rots = pts.map(() => rand(0, 6.28));
    pts.forEach((p, i) => {
      m.compose(p, q.setFromAxisAngle(V(0, 1, 0), rots[i]), V(1, 0.001, 1));
      inst.setMatrixAt(i, m);
    });
    this.scene.add(inst);
    this.maze.inst = inst;
    // grow in a wave from the pad
    pts.forEach((p, i) => {
      const d = flatDist(p, origin);
      tweens.add(0.5, (k) => {
        m.compose(p, q.setFromAxisAngle(V(0, 1, 0), rots[i]), V(1, Math.max(0.001, k * scales[i]), 1));
        inst.setMatrixAt(i, m);
        inst.instanceMatrix.needsUpdate = true;
      }, { delay: d * 0.06, easing: ease.outBack, done: () => { if (i % 9 === 0) this.fx.puff(p.clone().setY(0.4), 2, 0xd9e86a, 0.25, 0.6); } });
    });
    // solution path (BFS)
    const prev = new Array(nx * nz).fill(-1);
    const q2 = [entry];
    prev[entry] = entry;
    while (q2.length) {
      const c = q2.shift()!;
      if (c === exit) break;
      const cx = c % nx;
      const opts: number[] = [];
      if (cx < nx - 1 && !cells[c].e) opts.push(c + 1);
      if (cx > 0 && !cells[c - 1].e) opts.push(c - 1);
      if (c + nx < nx * nz && !cells[c].s) opts.push(c + nx);
      if (c - nx >= 0 && !cells[c - nx].s) opts.push(c - nx);
      for (const n of opts) if (prev[n] < 0) { prev[n] = c; q2.push(n); }
    }
    const route: number[] = [];
    for (let c = exit; c !== entry; c = prev[c]) route.push(c);
    route.push(entry);
    route.reverse();
    this.maze.path = route.map((c) => V(X(c % nx) + cs / 2, 0, Z(Math.floor(c / nx)) + cs / 2));
    this.colliders.push({ minX: mz.minX - 0.1, maxX: X(nx) + 0.1, minZ: mz.minZ - 0.1, maxZ: Z(nz) + 0.1 });
    // sign
    const sign = F.makeSign(`CORN MAZE $${CFG.price.maze}`, '#e0a800', '#ffffff', 1.8, 0.45, 66);
    const post = M.box(0.1, 1.4, 0.1, 0x7a4f2e);
    post.position.y = 0.7;
    sign.position.set(0, 1.35, 0.06);
    const g = new THREE.Group();
    g.add(post, sign);
    g.position.set(-1.6, 0, -3.6);
    this.scene.add(g);
    popIn(g, 0.4, 0.4);
    sfx.levelUp();
    this.showBanner('CORN MAZE!', 'Visitors pay to get lost in the corn');
  }

  growGiant() {
    const g = new THREE.Group();
    const st = F.makeRibbonStage();
    st.position.copy(L.stage);
    this.scene.add(st);
    popIn(st, 0.5);
    this.colliders.push(rectAt(L.stage.x, L.stage.z, 5, 3.6));
    const pm = F.makePumpkin();
    g.add(pm);
    g.position.copy(L.stage).add(V(0, 0.4, 0.2));
    this.scene.add(g);
    this.giant = g;
    const stages = [1.5, 3, 4.5, 6.5];
    stages.forEach((s, i) => {
      tweens.add(0.6, (k) => g.scale.setScalar(Math.max(0.01, (i ? stages[i - 1] : 0.2) + (s - (i ? stages[i - 1] : 0.2)) * k)), {
        delay: 0.6 + i * 0.9, easing: ease.outElastic,
        done: () => { sfx.pop(); this.shake.add(0.25 + i * 0.1); this.fx.puff(g.position.clone().setY(0.6), 12, 0xffe0b0, 0.5, 2); },
      });
    });
    tweens.add(0.01, () => {}, {
      delay: 4.6, done: () => {
        const r = F.makeRibbon();
        r.position.copy(g.position).add(V(1.6, 2.6, 2.4));
        this.scene.add(r);
        popIn(r, 0.6);
        this.fx.confetti(g.position.clone().setY(3), 120, 2);
        sfx.levelUp();
        this.showBanner('🏆 BLUE RIBBON!', 'Biggest pumpkin in the county!');
        tweens.add(0.01, () => {}, { delay: 2.8, done: () => this.showEndCard() });
      },
    });
    this.ended = true;
  }

  hireWorker(role: Worker['role']) {
    const p = makeChar(role === 'field' ? 'worker' : 'adventurer', 1.6);
    const idle = role === 'field' ? V(-8.4, 0, 3.0) : V(8.5, 0, 6.2);
    const padPos = this.pads.find((d) => d.id === (role === 'field' ? 'farmhand1' : 'farmhand2'))!.pad.pos;
    p.position.copy(padPos);
    this.scene.add(p);
    popIn(p, 0.5);
    const hand = new Stack(p.userData.carryAnchor, this.scene, CFG.workers.carry);
    this.workers.push({ p, role, hand, state: 'idle', target: null, job: null, t: 0, plot: null, tree: null, idleSpot: idle });
    this.fx.confetti(padPos.clone().setY(1), 30);
    this.showBanner(role === 'field' ? 'FARMHAND HIRED!' : 'ORCHARD HAND HIRED!', role === 'field' ? 'Plants, picks and stocks pumpkins' : 'Shakes apples and runs the cider mill');
  }

  // ===================================================================
  // Update
  // ===================================================================

  update(dt: number) {
    this.time += dt;
    this.updatePlayer(dt);
    this.updatePlots(dt);
    this.updateTrees(dt);
    this.updateGrass(dt);
    this.updateOccluders(dt);
    this.updateMachine(this.baler, dt);
    this.updateMachine(this.press, dt);
    this.updateMachine(this.oven, dt);
    this.updateHayride(dt);
    this.updateCars(dt);
    this.updateVisitors(dt);
    this.updateWorkers(dt);
    this.updatePads(dt);
    this.updateObjective(dt);
    this.updateHud(false, dt);
  }

  moveResolve(obj: THREE.Object3D, nx: number, nz: number, radius = 0.38) {
    const pos = obj.position;
    const b = L.bounds;
    let x = clamp(nx, b.minX, b.maxX), z = clamp(nz, b.minZ, b.maxZ);
    for (const c of this.colliders) {
      const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d > 1e-4) { x = cx + (dx / d) * radius; z = cz + (dz / d) * radius; }
      else {
        const pushes = [x - c.minX, c.maxX - x, z - c.minZ, c.maxZ - z];
        const mn = Math.min(...pushes);
        if (mn === pushes[0]) x = c.minX - radius; else if (mn === pushes[1]) x = c.maxX + radius; else if (mn === pushes[2]) z = c.minZ - radius; else z = c.maxZ + radius;
      }
    }
    pos.x = x;
    pos.z = z;
  }

  updatePlayer(dt: number) {
    const p = this.player;
    const inp = this.input;
    const mag = Math.min(1, inp.length());
    const tv = mag > 0.05 ? V(inp.x, 0, inp.y).normalize().multiplyScalar(this.speed * mag) : V(0, 0, 0);
    this.playerVel.x = damp(this.playerVel.x, tv.x, 14, dt);
    this.playerVel.z = damp(this.playerVel.z, tv.z, 14, dt);
    const sp = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.moveResolve(p, p.position.x + this.playerVel.x * dt, p.position.z + this.playerVel.z * dt);
    if (sp > 0.3) p.rotation.y = angleDamp(p.rotation.y, Math.atan2(this.playerVel.x, this.playerVel.z), 14, dt);
    animateChar(p, this.time, Math.min(1, sp / 4), this.hand.count > 0, sp > 3.2);
    this.hand.update(dt, sp);
    if (sp > 3 && Math.random() < dt * 5) this.fx.puff(p.position.clone().setY(0.1), 1, 0xe8cf9a, 0.12, 0.3);

    // basket label
    const f = this.hand.count / this.hand.capacity;
    const bar = this.handLabel.el.firstElementChild as HTMLElement;
    const txt = this.handLabel.el.lastElementChild as HTMLElement;
    bar.style.width = `${f * 100}%`;
    bar.style.background = f >= 0.999 ? 'linear-gradient(#ff8787,#fa5252)' : 'linear-gradient(#ffb066,#ff8c1a)';
    txt.textContent = f >= 0.999 ? 'FULL' : `${this.hand.count}/${this.hand.capacity}`;
    this.ui.show(this.handLabel, this.hand.count > 0);

    // collect cash piles
    const chest = () => this.player.localToWorld(V(0, 0.9, 0.3));
    for (const c of this.cashPiles) {
      if (c.value > 0 && flatDist(p.position, c.origin) < 1.6) {
        const total = Math.round(c.value);
        if (c.collect(chest, (a) => this.addMoney(a))) {
          this.ui.float(c.origin.clone().setY(1.4), `+${total}`, '#ffe066', 24);
          vibrate(10);
          this.stats.collected++;
        }
      }
    }
    // drop zones
    this.dropTick(dt);
  }

  addMoney(n: number) { this.money += n; }

  /** Buildings between the camera and the farmer fade out. */
  updateOccluders(dt: number) {
    const p = this.player.position;
    for (const o of this.occluders) {
      const behind = p.x > o.rect.minX && p.x < o.rect.maxX && p.z > o.rect.minZ && p.z < o.rect.maxZ;
      const target = behind ? 0.3 : 1;
      if (Math.abs(o.k - target) < 0.01 && !o.mats) continue;
      if (!o.mats) {
        o.mats = [];
        o.obj.traverse((c) => {
          const m = c as THREE.Mesh;
          if (!m.isMesh) return;
          const cl = (Array.isArray(m.material) ? m.material[0] : m.material).clone();
          cl.transparent = true;
          m.material = cl;
          o.mats!.push(cl);
        });
      }
      o.k = damp(o.k, target, 8, dt);
      for (const m of o.mats) { m.opacity = o.k; m.depthWrite = o.k > 0.95; }
    }
  }

  updateGrass(dt: number) {
    this.grass.update(dt, this.player.position);
    const p = this.player.position;
    const ry = this.player.rotation.y;
    const c = V(p.x + Math.sin(ry) * 0.45, 0, p.z + Math.cos(ry) * 0.45);
    this.cutT -= dt;
    if (this.cutT <= 0) {
      const cut = this.grass.cutAround(c, CFG.grass.radius, 1);
      if (cut.length) {
        this.cutT = CFG.grass.every;
        this.swingT = 0.35;
        sfx.swish();
        for (const pos of cut) {
          this.fx.puff(pos, 2, pick([0x8fd14f, 0x6fbf3a, 0xc9b25a]), 0.15, 1.1);
          this.grassBits++;
          if (this.grassBits < CFG.grass.perBundle) continue;
          this.grassBits = 0;
          if (this.hand.full) { this.warnFull(); continue; }
          const m = F.makeGrassBundle();
          m.position.copy(pos);
          this.scene.add(m);
          this.hand.receive('grass', m);
          this.stats.bundles++;
          this.ui.float(pos.clone().setY(1.7), '+1 🌿', '#c8ff8a', 18, 0.8, 50);
        }
      }
    }
    this.swingT -= dt;
    const sw = this.swingT > 0;
    this.slash.visible = sw;
    if (sw) {
      this.slash.rotation.y += dt * 18;
      (this.slash.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, this.swingT / 0.12);
    }
    if (this.sickle) this.sickle.rotation.x = sw ? Math.sin(this.time * 28) * 1.3 : damp(this.sickle.rotation.x, 0, 8, dt);
  }

  // ---------------- Field ----------------

  plotAt(p: THREE.Vector3, r = 0.66) {
    let best: Plot | null = null, bd = r;
    for (const pl of this.plots) {
      const d = flatDist(pl.pos, p);
      if (d < bd) { bd = d; best = pl; }
    }
    return best;
  }

  seedGeo = new THREE.SphereGeometry(0.045, 5, 4);
  seedMat = new THREE.MeshLambertMaterial({ color: 0xf2d27a });
  wetSoil = (() => { const m = F.vcMat.clone(); m.color.setHex(0xb59a88); return m; })();

  plant(pl: Plot, byPlayer: boolean) {
    pl.state = 'growing';
    pl.t = 0;
    pl.size = rand(0.92, 1.15);
    pl.sprout.visible = true;
    pl.sprout.scale.setScalar(0.01);
    pl.vine.visible = false;
    pl.pumpkin.visible = false;
    pl.pmat.color.setHex(F.PUMPKIN_GREEN);
    pl.soil.material = this.wetSoil;
    if (byPlayer) {
      // seeds fly from the farmer's hand onto the soil, then the soil puffs and a sprout pops
      pl.sprout.visible = false;
      const from = this.player.localToWorld(V(0.25, 1.1, 0.3));
      for (let k = 0; k < 4; k++) {
        const seed = new THREE.Mesh(this.seedGeo, this.seedMat);
        seed.position.copy(from);
        this.scene.add(seed);
        const to = pl.pos.clone().add(V(rand(-0.25, 0.25), 0.18, rand(-0.25, 0.25)));
        arcMove(seed, from, to, 0.22 + k * 0.04, 0.7, () => seed.removeFromParent());
      }
      tweens.add(0.01, () => {}, { delay: 0.25, done: () => {
        if (pl.state !== 'growing') return;
        pl.sprout.visible = true;
        popIn(pl.sprout, 0.3);
        this.fx.puff(pl.pos.clone().setY(0.25), 4, 0x9a6a3a, 0.22, 0.6);
        squash(pl.root, 0.15, 0.25);
      } });
      sfx.plant(this.stats.planted);
      this.stats.planted++;
    } else {
      popIn(pl.sprout, 0.3);
      this.fx.puff(pl.pos.clone().setY(0.25), 4, 0x9a6a3a, 0.22, 0.6);
      squash(pl.root, 0.15, 0.25);
    }
  }

  harvestTo(pl: Plot, stack: Stack, byPlayer: boolean) {
    const m = F.makePumpkin();
    m.scale.setScalar(pl.size);
    pl.pumpkin.getWorldPosition(m.position);
    this.scene.add(m);
    stack.receive('pumpkin', m);
    this.clearPlot(pl);
    this.fx.puff(pl.pos.clone().setY(0.4), 5, 0x6fcf4a, 0.2, 0.8);
    if (byPlayer) { this.stats.harvested++; vibrate(6); }
  }

  clearPlot(pl: Plot) {
    pl.soil.material = F.vcMat;
    pl.state = 'empty';
    pl.t = 0;
    pl.res = null;
    pl.cool = 0.35;
    pl.vine.visible = false;
    pl.pumpkin.visible = false;
    pl.sprout.visible = false;
  }

  updatePlots(dt: number) {
    const pp = this.player.position;
    const near = this.plotAt(pp);
    for (const pl of this.plots) {
      if (pl.cool > 0) pl.cool -= dt;
      if (pl.state === 'growing') {
        pl.t += dt;
        const k = Math.min(1, pl.t / this.growTime);
        if (k >= 0.35) pl.sprout.visible = false;
        if (k > 0.2) {
          if (!pl.vine.visible) { pl.vine.visible = true; popIn(pl.vine, 0.3); }
        }
        if (k > 0.3) {
          if (!pl.pumpkin.visible) { pl.pumpkin.visible = true; pl.pumpkin.scale.setScalar(0.2); }
          const kk = (k - 0.3) / 0.7;
          const s = (0.2 + kk * 0.8) * pl.size;
          pl.pumpkin.scale.setScalar(s);
          const c = new THREE.Color(F.PUMPKIN_GREEN).lerp(new THREE.Color(F.PUMPKIN_ORANGE), clamp((kk - 0.45) / 0.55, 0, 1));
          pl.pmat.color.copy(c);
        }
        if (k >= 1) {
          pl.state = 'ripe';
          pl.pmat.color.setHex(F.PUMPKIN_ORANGE);
          squash(pl.pumpkin, 0.3, 0.35, pl.size);
          this.fx.sparkle(pl.pos.clone().setY(0.6), 3, 0xffd23f);
        }
      } else if (pl.state === 'ripe' && !pl.res) {
        const w = Math.sin(this.time * 3 + pl.pos.x * 2 + pl.pos.z) * 0.06;
        pl.pumpkin.rotation.z = w;
      }
    }
    // player interaction
    if (near && near.cool <= 0) {
      if (near.state === 'empty') this.plant(near, true);
      else if (near.state === 'ripe' && !near.res) {
        if (!this.hand.full) this.harvestTo(near, this.hand, true);
        else this.warnFull();
      }
    }
  }

  warnFull() {
    if (this.time - this.fullWarnT < 1.5) return;
    this.fullWarnT = this.time;
    this.ui.float(this.player.position.clone().setY(2.6), 'Basket full!', '#ff8a8a', 20);
    sfx.bagFull();
  }

  // ---------------- Orchard ----------------

  updateTrees(dt: number) {
    const pp = this.player.position;
    for (const t of this.trees) {
      // regrow
      if (t.apples.some((a) => !a)) {
        t.regrow -= dt;
        if (t.regrow <= 0) { t.regrow = CFG.apples.regrow; if (t.apples.filter(Boolean).length < CFG.apples.perTree) this.growApple(t); }
      }
      t.wob = damp(t.wob, 0, 6, dt);
      const canopy = t.root.userData.canopy as THREE.Object3D;
      canopy.rotation.z = Math.sin(this.time * 30) * t.wob * 0.06;
      canopy.rotation.x = Math.cos(this.time * 27) * t.wob * 0.05;
      t.shakeT -= dt;
      if (flatDist(pp, t.pos) < 1.75 && t.shakeT <= 0) {
        if (this.hand.full) { if (t.apples.some(Boolean)) this.warnFull(); continue; }
        if (this.shakeApple(t, this.hand)) { t.shakeT = 0.13; this.stats.apples++; }
      }
    }
  }

  shakeApple(t: Tree, stack: Stack) {
    const i = t.apples.findIndex(Boolean);
    if (i < 0) return false;
    const a = t.apples[i]!;
    t.apples[i] = null;
    if (t.regrow < 0.5) t.regrow = CFG.apples.regrow;
    t.wob = 1;
    this.scene.attach(a);
    a.scale.setScalar(1);
    const ground = a.position.clone().setY(0.15);
    sfx.rustle();
    if (Math.random() < 0.4) this.fx.puff(a.position.clone(), 2, 0x6fcf4a, 0.18, 0.6);
    arcMove(a, a.position.clone(), ground, 0.18, 0.1, () => {
      squash(a, 0.4, 0.15);
      stack.receive('apple', a);
    });
    return true;
  }

  // ---------------- Shops & drop zones ----------------

  dropTick(dt: number) {
    const p = this.player.position;
    for (const sh of this.shops) {
      if (!sh.built) continue;
      sh.dropT -= dt;
      const kind = sh.kinds.find((k) => this.hand.has(k));
      if (flatDist(p, sh.drop) < 0.95 && sh.dropT <= 0 && kind) {
        const slot = sh.slots.findIndex((s) => !s);
        if (slot >= 0) {
          const m = this.hand.take(kind);
          if (m) m.userData.kind = kind;
          if (m) { this.placeOnShop(sh, m, slot); sh.dropT = 0.08; this.stats.stocked++; }
        }
      }
    }
    for (const mc of [this.baler, this.press, this.oven]) {
      if (!mc.built) continue;
      mc.feedT -= dt;
      if (flatDist(p, mc.inZone) < 0.95 && mc.feedT <= 0 && this.hand.has(mc.inKind) && mc.inCount < mc.inMax) {
        const m = this.hand.take(mc.inKind);
        if (m) this.feedMachine(mc, m);
        mc.feedT = 0.07;
      }
      if (flatDist(p, mc.outZone) < 0.95 && mc.feedT <= 0 && mc.out.length && !this.hand.full) {
        const m = mc.out.pop()!;
        this.hand.receive(mc.outKind, m);
        mc.feedT = 0.08;
      }
    }
  }

  placeOnShop(sh: Shop, m: THREE.Object3D, slot: number) {
    sh.slots[slot] = m;
    const to = sh.slotPos[slot];
    arcMove(m, m.position.clone(), to, 0.22, 0.8, () => { squash(m, 0.25, 0.2, m.scale.x); sfx.drop(slot); });
    m.rotation.set(0, rand(-0.4, 0.4), 0);
  }

  feedMachine(mc: Machine, m: THREE.Object3D) {
    const top = mc.top.clone();
    mc.inCount++;
    arcMove(m, m.position.clone(), top, 0.25, 1.1, () => {
      m.removeFromParent();
      sfx.drop(mc.inCount);
      this.fx.puff(top.clone(), 2, mc.id === 'press' ? 0xffd7a0 : 0xffffff, 0.2, 0.5);
    });
  }

  updateMachine(mc: Machine, dt: number) {
    if (!mc.built || !mc.group) return;
    const working = mc.inCount >= mc.ratio && mc.out.length < mc.outMax;
    mc.work = damp(mc.work, working ? 1 : 0, 6, dt);
    if (working) {
      mc.t += dt;
      if (mc.t >= mc.every) {
        mc.t = 0;
        mc.inCount -= mc.ratio;
        const item = F.makeAnyItem(mc.outKind);
        const from = mc.spout.clone();
        item.position.copy(from);
        this.scene.add(item);
        const i = mc.out.length;
        mc.out.push(item);
        const col = i % 3, row = Math.floor(i / 3) % 2, layer = Math.floor(i / 6);
        const h = mc.outKind === 'pie' ? 0.13 : mc.outKind === 'hay' ? 0.32 : 0.45;
        const to = mc.outZone.clone().add(V((col - 1) * 0.42, layer * h, (row - 0.5) * 0.42));
        arcMove(item, from, to, 0.35, 0.9, () => { squash(item, 0.3, 0.2); });
        if (mc.id === 'baler') { sfx.squish(); this.fx.puff(from.clone(), 6, 0xf3d77a, 0.25, 1); this.stats.hay++; }
        else if (mc.id === 'press') { sfx.squish(); this.fx.splash(from.clone(), 6, 0.5); }
        else { sfx.ding(); this.fx.puff(from.clone().setY(1), 5, 0xffffff, 0.3, 0.6); }
        if (mc.outKind === 'pie') this.stats.pies++;
      }
    }
    if (mc.id === 'baler') {
      const ram = mc.group.userData.ram as THREE.Object3D;
      ram.position.y = 1.35 - Math.abs(Math.sin(this.time * 9)) * 0.35 * mc.work;
      mc.group.scale.y = 1 + Math.sin(this.time * 18) * 0.015 * mc.work;
    } else if (mc.id === 'press') {
      const screw = mc.group.userData.screw as THREE.Object3D;
      screw.rotation.y += dt * 6 * mc.work;
      screw.position.y = 1.55 - Math.abs(Math.sin(this.time * 4)) * 0.25 * mc.work;
    } else {
      const glow = mc.group.userData.glow as THREE.Mesh;
      (glow.material as THREE.MeshBasicMaterial).color.setHSL(0.08, 1, 0.45 + 0.15 * mc.work * (0.5 + 0.5 * Math.sin(this.time * 10)));
      if (mc.work > 0.5 && Math.random() < dt * 4) this.fx.smoke(L.bakery.clone().add(mc.group.userData.chimney));
    }
    if (mc.label) {
      const icon = mc.inKind === 'apple' ? '🍎' : mc.inKind === 'grass' ? '🌿' : '🎃';
      mc.label.el.textContent = `${icon} ${mc.inCount}/${mc.inMax}`;
      this.ui.show(mc.label, mc.inCount > 0 || flatDist(this.player.position, mc.inZone) < 3);
    }
  }

  // ---------------- Hayride ----------------

  hayPoint(s: number) {
    const tot = this.hay.total;
    s = ((s % tot) + tot) % tot;
    const hp = L.hayPath;
    for (let i = 0; i < hp.length; i++) {
      const len = this.hay.segs[i];
      if (s <= len) {
        const a = hp[i], b = hp[(i + 1) % hp.length];
        const k = s / len;
        return { pos: V(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k), dir: Math.atan2(b.x - a.x, b.z - a.z) };
      }
      s -= len;
    }
    return { pos: hp[0].clone(), dir: Math.PI };
  }

  placeHay(s: number, dt: number, snap = false) {
    const t = this.hay.tractor!, w = this.hay.wagon!;
    const a = this.hayPoint(s), b = this.hayPoint(s - 2.55);
    t.position.copy(a.pos);
    w.position.copy(b.pos);
    if (snap) { t.rotation.y = a.dir; w.rotation.y = b.dir; }
    else {
      t.rotation.y = angleDamp(t.rotation.y, a.dir, 7, dt);
      w.rotation.y = angleDamp(w.rotation.y, Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z), 7, dt);
    }
  }

  updateHayride(dt: number) {
    const h = this.hay;
    if (!h.built || !h.tractor) return;
    const seated = h.seats.filter((v) => v && v.state === 'ride').length;
    const reserved = h.seats.filter(Boolean).length;
    if (h.state === 'idle') {
      const ready = seated > 0 && seated === reserved;
      if (ready) h.waitT += dt; else h.waitT = 0;
      const playerGo = !h.driver && flatDist(this.player.position, L.hayGo) < 1.0;
      if (h.goLabel) this.ui.show(h.goLabel, !h.driver && ready);
      const autoGo = h.driver && ready && (seated >= h.seats.length || h.waitT > CFG.hayride.waitAuto);
      if (ready && (playerGo || autoGo)) {
        h.state = 'ride';
        h.s = L.hayStop;
        sfx.tractor();
        this.fx.puff(h.tractor.position.clone().add(V(0, 1.4, 0)), 5, 0x777777, 0.3, 0.6);
        if (playerGo) { vibrate(15); this.ui.float(L.hayGo.clone().setY(1.6), 'Off we go!', '#ffffff', 20); }
        for (const v of h.seats) if (v) this.ui.float(v.p.getWorldPosition(V(0, 0, 0)).setY(2.2), pick(['Yeehaw!', '🎉', 'Wheee!', '😄']), '#ffffff', 18);
      }
    } else {
      h.s += CFG.hayride.speed * dt;
      this.placeHay(h.s, dt);
      sfx.setEngine(1);
      if (Math.random() < dt * 6) this.fx.smoke(h.tractor.localToWorld(h.tractor.userData.exhaust.clone()), 0x9aa0a6);
      if (h.driver) animateChar(h.driver as Char, this.time, 0, false);
      const body = h.tractor.userData.body as THREE.Object3D;
      body.position.y = Math.abs(Math.sin(this.time * 18)) * 0.04;
      if (h.s >= L.hayStop + h.total) {
        h.state = 'idle';
        h.s = L.hayStop;
        this.placeHay(h.s, dt, true);
        sfx.setEngine(0);
        h.rides++;
        this.stats.rides++;
        sfx.cheer();
        this.fx.confetti(h.wagon!.position.clone().setY(1.4), 25);
        for (let i = 0; i < h.seats.length; i++) {
          const v = h.seats[i];
          if (!v) continue;
          h.seats[i] = null;
          this.scene.attach(v.p);
          v.p.position.set(L.hayBoard.x + rand(-0.6, 0.6), 0, L.hayBoard.z + rand(-0.4, 0.8));
          v.p.rotation.set(0, Math.PI, 0);
          v.p.userData.legL.rotation.x = 0;
          v.p.userData.legR.rotation.x = 0;
          v.state = 'walk';
          this.ui.float(v.p.position.clone().setY(2.2), '😄', '#ffffff', 22);
          this.nextActivity(v);
        }
      }
    }
    if (h.state === 'idle') sfx.setEngine(0);
  }

  // ---------------- Cars & visitors ----------------

  attractions(): Act[] {
    const a: Act[] = ['stand'];
    if (this.upick) a.push('upick');
    if (this.cider.built) a.push('cider');
    if (this.hay.built) a.push('hayride');
    if (this.maze.built) a.push('maze');
    if (this.bakery.built) a.push('pie');
    return a;
  }

  updateCars(dt: number) {
    const acts = this.attractions();
    const open = this.stand.slots.some(Boolean) || this.upick || this.stats.sold > 0;
    if (open) {
      this.carT -= dt;
      const interval = clamp(8.5 - acts.length * 1.2, 2.8, 8.5);
      const active = this.visitors.length;
      const maxV = 5 + acts.length * 4;
      if (this.carT <= 0 && active < maxV) {
        const slot = this.slotsUsed.findIndex((c) => !c);
        if (slot >= 0) { this.spawnCar(slot); this.carT = interval * rand(0.8, 1.2); }
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.state === 'park') continue;
      const target = c.path[0];
      if (!target) {
        if (c.state === 'in') {
          c.state = 'park';
          this.unloadCar(c);
        } else {
          c.mesh.removeFromParent();
          this.cars.splice(i, 1);
        }
        continue;
      }
      const near = c.path.length === 1 && c.state === 'in';
      const sp = near ? 4 : 9;
      if (stepTowards(c.mesh, target, sp, dt, 8)) c.path.shift();
      const body = c.mesh.userData.body as THREE.Object3D;
      body.position.y = Math.abs(Math.sin(this.time * 20)) * 0.02;
    }
  }

  spawnCar(slot: number) {
    const type = pick(['sedan', 'pickup', 'sedan', 'rv'] as M.VehicleType[]);
    const color = pick([0xff5a5f, 0x4dabf7, 0x3ccf5a, 0xffd23f, 0xb57bff, 0xff9f43, 0x2f4a73]);
    const mesh = F.makeCar(color) ?? M.makeVehicle(type, color);
    const sx = L.parkSlots[slot];
    mesh.position.set(-34, 0, L.roadZ + 0.6);
    mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);
    const c: Car = { mesh, slot, state: 'in', path: [V(sx - 2.2, 0, L.roadZ + 0.6), V(sx, 0, L.parkZ)], members: [], back: 0, speed: 9 };
    this.slotsUsed[slot] = c;
    this.cars.push(c);
    sfx.carDoor();
  }

  unloadCar(c: Car) {
    const n = Math.random() < 0.35 ? 1 : Math.random() < 0.6 ? 2 : 3;
    const acts = this.attractions();
    for (let i = 0; i < n; i++) {
      const kid = i > 0 && Math.random() < 0.5;
      const p = makeChar(pick(['char', 'char', 'worker', 'adventurer']), kid ? 1.2 : rand(1.6, 1.8));
      p.position.copy(c.mesh.position).add(V(-1.0 + i * 0.35, 0, rand(-0.4, 0.4)));
      this.scene.add(p);
      popIn(p, 0.3, i * 0.15, 1);
      const plan = this.makePlan(acts);
      const v: Visitor = {
        p, car: c, plan, act: null, kid, path: [], speed: CFG.visitors.walk * rand(0.9, 1.1) * (kid ? 1.1 : 1), onArrive: null, waitFn: null, patience: 0,
        items: [], bubble: null, shop: null, spot: -1, plot: null, seat: -1, state: 'walk',
      };
      c.members.push(v);
      this.visitors.push(v);
      this.stats.visitors++;
      v.path = [L.gateOut.clone().add(V(rand(-0.4, 0.4), 0, 0)), L.gateIn.clone().add(V(rand(-0.4, 0.4), 0, 0))];
      v.onArrive = () => this.nextActivity(v);
    }
  }

  makePlan(acts: Act[]): Act[] {
    const w: Record<Act, number> = { stand: this.upick ? 0.7 : 1, upick: 1.3, cider: 1, hayride: 1.1, maze: 1.1, pie: 1 };
    const pool = [...acts];
    const n = pool.length >= 3 && Math.random() < 0.35 ? 2 : 1;
    const plan: Act[] = [];
    for (let i = 0; i < n && pool.length; i++) {
      const total = pool.reduce((s, a) => s + w[a], 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length - 1; idx++) { r -= w[pool[idx]]; if (r <= 0) break; }
      plan.push(pool.splice(idx, 1)[0]);
    }
    return plan;
  }

  setBubble(v: Visitor, html: string | null) {
    if (!html) { this.ui.remove(v.bubble); v.bubble = null; return; }
    if (!v.bubble) v.bubble = this.ui.add('bubble', html, v.p, v.kid ? 1.5 : 2.0);
    else v.bubble.el.innerHTML = html;
  }

  walkTo(v: Visitor, pts: THREE.Vector3[], then: () => void) {
    v.state = 'walk';
    v.path = pts.map((p) => p.clone());
    v.onArrive = then;
  }

  waitFor(v: Visitor, patience: number, fn: (dt: number) => boolean) {
    v.state = 'wait';
    v.patience = patience;
    v.waitFn = fn;
  }

  nextActivity(v: Visitor) {
    v.shop = null;
    v.spot = -1;
    v.plot = null;
    const act = v.plan.shift();
    v.act = act ?? null;
    if (!act) { this.leave(v); return; }
    if (act === 'stand') this.goShop(v, this.stand);
    else if (act === 'cider') this.goShop(v, this.cider);
    else if (act === 'pie') this.goShop(v, this.bakery);
    else if (act === 'upick') this.goUpick(v);
    else if (act === 'hayride') this.goHayride(v);
    else if (act === 'maze') this.goMaze(v);
  }

  leave(v: Visitor, sad = false) {
    this.setBubble(v, null);
    if (sad) this.ui.float(v.p.position.clone().setY(2.2), '😞', '#ffffff', 22);
    const pos = v.p.position;
    const pts: THREE.Vector3[] = [];
    if (pos.z < 9.5) pts.push(L.hub.clone().add(V(rand(-0.5, 0.5), 0, 0)));
    pts.push(L.gateIn.clone(), L.gateOut.clone(), v.car.mesh.position.clone().add(V(-1.0, 0, 0)));
    this.walkTo(v, pts, () => {
      v.state = 'gone';
      this.fx.puff(v.p.position.clone().setY(0.5), 4, 0xffffff, 0.25, 0.5);
      v.p.removeFromParent();
      for (const it of v.items) it.removeFromParent();
      this.visitors.splice(this.visitors.indexOf(v), 1);
      v.car.back++;
      if (v.car.back >= v.car.members.length) this.carLeave(v.car);
    });
  }

  carLeave(c: Car) {
    c.state = 'out';
    const sx = L.parkSlots[c.slot];
    c.path = [V(sx, 0, L.roadZ - 0.6), V(40, 0, L.roadZ - 0.6)];
    tweens.add(0.01, () => {}, { delay: 1.2, done: () => { this.slotsUsed[c.slot] = null; } });
    sfx.carDoor();
  }

  hold(v: Visitor, m: THREE.Object3D, kind: ItemKind) {
    this.scene.attach(m);
    const anchor = v.p.userData.carryAnchor as THREE.Object3D;
    const idx = v.items.length;
    v.items.push(m);
    const h = kind === 'pie' ? 0.14 : kind === 'pumpkin' ? 0.4 : 0.45;
    arcMove(m, m.position.clone(), () => anchor.localToWorld(V(0, idx * h, 0)), 0.22, 0.7, () => {
      anchor.attach(m);
      m.position.set(0, idx * h, 0);
      m.rotation.set(0, 0, 0);
    });
  }

  pay(v: Visitor, cash: CashPile, amount: number) {
    const from = v.p.position.clone().setY(1.2);
    cash.add(amount, from);
    this.ui.float(from.clone().setY(2.2), `+${amount}`, '#ffe066', 20);
    sfx.chaChing();
  }

  goShop(v: Visitor, sh: Shop) {
    const pts = v.p.position.z > 9 || v.p.position.z < 0 ? [L.hub.clone().add(V(rand(-0.3, 0.3), 0, 0))] : [];
    if (sh.id === 'pie') pts.push(V(1.0, 0, -5.2));
    const queuePos = sh.spots[1].clone().add(V(rand(-0.8, 0.8), 0, 1.3));
    const claim = () => {
      const i = sh.spotUsed.findIndex((s) => !s);
      if (i < 0) return false;
      sh.spotUsed[i] = v;
      v.spot = i;
      v.shop = sh;
      this.walkTo(v, [sh.spots[i]], () => this.atShop(v, sh));
      return true;
    };
    this.walkTo(v, [...pts, queuePos], () => {
      if (claim()) return;
      this.setBubble(v, '⏳');
      this.waitFor(v, 40, () => claim() ? (this.setBubble(v, null), true) : false);
    });
  }

  atShop(v: Visitor, sh: Shop) {
    v.p.rotation.y = Math.PI;
    let want = sh.id === 'stand' && Math.random() < 0.4 ? 2 : 1;
    const inStock = sh.kinds.filter((k) => sh.slots.some((m) => m && (m.userData.kind ?? sh.kind) === k));
    const wantKind: ItemKind = inStock.length ? pick(inStock) : pick(sh.kinds);
    const EMO: Record<string, string> = { hay: '🌾', pumpkin: '🎃', cider: '🧃', pie: '🥧' };
    this.setBubble(v, `${EMO[wantKind] ?? sh.emoji}${want > 1 ? '×2' : ''}`);
    let bought = 0;
    let t = 0;
    const finish = () => {
      sh.spotUsed[v.spot] = null;
      this.setBubble(v, null);
      if (bought > 0) {
        this.pay(v, sh.cash, bought * (CFG.price as Record<string, number>)[wantKind]);
        if (sh.id === 'stand') this.stats.sold += bought;
        if (wantKind === 'pumpkin') this.stats.soldPumpkin += bought;
      }
      this.nextActivity(v);
    };
    this.waitFor(v, 40, (dt) => {
      t -= dt;
      if (t > 0) return false;
      const slot = sh.slots.findIndex((m) => m && (m.userData.kind ?? sh.kind) === wantKind);
      if (slot >= 0) {
        const m = sh.slots[slot]!;
        sh.slots[slot] = null;
        this.hold(v, m, wantKind);
        bought++;
        want--;
        t = 0.3;
        sfx.pop();
        if (want <= 0) { v.patience = 99; tweens.add(0.01, () => {}, { delay: 0.3, done: finish }); return true; }
      }
      return false;
    });
    // on patience timeout handled in updateVisitors (calls leave)
    v.waitFn = ((orig) => (dt: number) => {
      const r = orig(dt);
      if (!r && v.patience <= 0) {
        sh.spotUsed[v.spot] = null;
        if (bought > 0) { finish(); return true; }
      }
      return r;
    })(v.waitFn!);
  }

  ripeFree() { return this.plots.filter((p) => p.state === 'ripe' && !p.res); }

  goUpick(v: Visitor) {
    const tryClaim = () => {
      const free = this.ripeFree();
      if (!free.length) return false;
      free.sort((a, b) => flatDist(a.pos, v.p.position) - flatDist(b.pos, v.p.position));
      const pl = free[0];
      pl.res = v;
      v.plot = pl;
      this.setBubble(v, null);
      this.walkTo(v, [pl.pos.clone().add(V(0.35, 0, 0.35))], () => this.pickPlot(v, pl));
      return true;
    };
    const pre = v.p.position.z > 9 ? [L.hub.clone()] : [];
    this.walkTo(v, [...pre, L.upickWait.clone().add(V(rand(-0.4, 0.4), 0, rand(-0.8, 0.8)))], () => {
      if (tryClaim()) return;
      this.setBubble(v, '🎃?');
      this.waitFor(v, 40, () => tryClaim());
    });
  }

  pickPlot(v: Visitor, pl: Plot) {
    v.state = 'wait';
    v.p.lookAt(pl.pos.x, 0, pl.pos.z);
    this.waitFor(v, 99, () => false);
    tweens.add(0.01, () => {}, {
      delay: 0.5, done: () => {
        if (pl.state !== 'ripe' || pl.res !== v) { pl.res = null; this.goUpick(v); return; }
        const m = F.makePumpkin();
        m.scale.setScalar(pl.size);
        pl.pumpkin.getWorldPosition(m.position);
        this.scene.add(m);
        this.clearPlot(pl);
        this.hold(v, m, 'pumpkin');
        this.fx.puff(pl.pos.clone().setY(0.4), 5, 0x6fcf4a, 0.2, 0.8);
        sfx.pickup(2);
        this.stats.upick++;
        this.walkTo(v, [L.boothPay.clone().add(V(rand(-0.6, 0.6), 0, rand(-0.3, 0.3)))], () => {
          this.pay(v, this.upickCash, CFG.price.upick);
          this.nextActivity(v);
        });
      },
    });
  }

  goHayride(v: Visitor) {
    const h = this.hay;
    const claim = () => {
      if (h.state !== 'idle') return false;
      const i = h.seats.findIndex((s) => !s);
      if (i < 0) return false;
      h.seats[i] = v;
      v.seat = i;
      this.setBubble(v, null);
      this.walkTo(v, [L.hayBoard.clone()], () => this.board(v, i));
      return true;
    };
    const pre = v.p.position.z > 9 ? [L.hub.clone()] : [];
    this.walkTo(v, [...pre, V(-0.2 + rand(-0.5, 0.5), 0, 1.2 + rand(0, 1.2))], () => {
      if (claim()) return;
      this.setBubble(v, '🚜');
      this.waitFor(v, 60, () => claim());
    });
  }

  board(v: Visitor, i: number) {
    const h = this.hay;
    if (h.state !== 'idle') { h.seats[i] = null; this.goHayride(v); return; }
    const seat = (h.wagon!.userData.seats as THREE.Object3D[])[i];
    this.pay(v, this.hayCash, CFG.price.hayride);
    arcMove(v.p, v.p.position.clone(), () => seat.getWorldPosition(V(0, 0, 0)), 0.35, 0.8, () => {
      seat.attach(v.p);
      v.p.position.set(0, 0, 0);
      v.p.rotation.set(0, 0, 0);
      v.p.userData.legL.rotation.x = -1.4;
      v.p.userData.legR.rotation.x = -1.4;
      v.state = 'ride';
    });
    v.state = 'wait';
    this.waitFor(v, 999, () => false);
  }

  goMaze(v: Visitor) {
    const entry = this.maze.path[0];
    const exit = this.maze.path[this.maze.path.length - 1];
    const outsideIn = V(entry.x + 1.4, 0, entry.z);
    const outsideOut = V(exit.x + 1.4, 0, exit.z);
    const pre = v.p.position.z > 9 ? [L.hub.clone()] : [];
    this.walkTo(v, [...pre, V(-0.6, 0, -1.6), outsideIn], () => {
      this.pay(v, this.mazeCash, CFG.price.maze);
      const pts = this.maze.path.map((p) => p.clone().add(V(rand(-0.2, 0.2), 0, rand(-0.2, 0.2))));
      v.speed *= 0.75;
      this.walkTo(v, [...pts, outsideOut, V(-0.6, 0, -6.5), V(-0.6, 0, -1.6)], () => {
        v.speed /= 0.75;
        this.stats.maze++;
        this.ui.float(v.p.position.clone().setY(2.2), pick(['😄', 'Made it!', '🌽']), '#ffffff', 20);
        this.nextActivity(v);
      });
    });
  }

  updateVisitors(dt: number) {
    for (const v of [...this.visitors]) {
      if (v.state === 'ride' || v.state === 'gone') {
        if (v.state === 'ride') {
          animateChar(v.p, this.time, 0, v.items.length > 0);
          v.p.userData.legL.rotation.x = -1.4;
          v.p.userData.legR.rotation.x = -1.4;
        }
        continue;
      }
      if (v.state === 'walk') {
        const t = v.path[0];
        if (t) {
          if (stepTowards(v.p, t, v.speed, dt, 10)) v.path.shift();
          animateChar(v.p, this.time, 1, v.items.length > 0);
        } else {
          const f = v.onArrive;
          v.onArrive = null;
          if (f) f();
          else if (v.state === 'walk') this.nextActivity(v);
        }
      } else if (v.state === 'wait') {
        animateChar(v.p, this.time, 0, v.items.length > 0);
        v.patience -= dt;
        const fn = v.waitFn;
        if (fn && fn(dt)) { if (v.waitFn === fn) v.waitFn = null; continue; }
        if (v.patience <= 0 && v.state === 'wait') {
          v.waitFn = null;
          if (v.plot && v.plot.res === v) v.plot.res = null;
          if (v.shop && v.spot >= 0 && v.shop.spotUsed[v.spot] === v) v.shop.spotUsed[v.spot] = null;
          if (v.seat >= 0 && this.hay.seats[v.seat] === v) this.hay.seats[v.seat] = null;
          this.leave(v, v.items.length === 0);
        }
      }
    }
  }

  // ---------------- Workers ----------------

  updateWorkers(dt: number) {
    for (const w of this.workers) {
      w.hand.update(dt, w.state === 'go' ? 3 : 0);
      if (w.state === 'go' && w.target) {
        const arrived = stepTowards(w.p, w.target, CFG.workers.speed, dt, 10);
        animateChar(w.p, this.time, 1, w.hand.count > 0);
        if (arrived) { w.state = 'act'; w.t = 0; }
        continue;
      }
      animateChar(w.p, this.time, 0, w.hand.count > 0);
      if (w.state === 'act') {
        w.t -= dt;
        if (w.t > 0) continue;
        const job = w.job;
        if (job) job();
        continue;
      }
      // idle -> decide
      w.t -= dt;
      if (w.t > 0) continue;
      w.t = 0.3;
      if (w.role === 'field') this.thinkField(w); else this.thinkOrchard(w);
    }
  }

  goWorker(w: Worker, target: THREE.Vector3, job: () => void) {
    w.target = target.clone();
    w.state = 'go';
    w.job = () => { w.state = 'idle'; w.t = 0.15; job(); };
  }

  thinkField(w: Worker) {
    const pos = w.p.position;
    const byDist = (list: Plot[]) => list.sort((a, b) => flatDist(a.pos, pos) - flatDist(b.pos, pos))[0];
    const empty = this.plots.filter((p) => p.state === 'empty' && !p.res && p.cool <= 0);
    const ripe = this.ripeFree();
    const keepForUpick = this.upick ? 3 : 0;
    const standFree = this.stand.slots.filter((s) => !s).length;
    const ovenFree = this.oven.built ? this.oven.inMax - this.oven.inCount : 0;
    const wantsPumpkins = standFree + ovenFree > w.hand.count;
    if (w.hand.count > 0 && (w.hand.full || !wantsPumpkins || ripe.length <= keepForUpick)) {
      if (standFree > 0) {
        this.goWorker(w, this.stand.drop, () => this.workerDeliverShop(w, this.stand));
        return;
      }
      if (ovenFree > 0) {
        this.goWorker(w, this.oven.inZone, () => this.workerFeed(w, this.oven));
        return;
      }
    }
    if (empty.length) {
      const pl = byDist(empty);
      pl.res = w;
      this.goWorker(w, pl.pos.clone().add(V(0, 0, 0.45)), () => { pl.res = null; if (pl.state === 'empty') this.plant(pl, false); });
      return;
    }
    if (ripe.length > keepForUpick && !w.hand.full && wantsPumpkins) {
      const pl = byDist(ripe);
      pl.res = w;
      this.goWorker(w, pl.pos.clone().add(V(0, 0, 0.45)), () => { pl.res = null; if (pl.state === 'ripe') this.harvestTo(pl, w.hand, false); });
      return;
    }
    if (flatDist(pos, w.idleSpot) > 0.5) this.goWorker(w, w.idleSpot, () => {});
  }

  thinkOrchard(w: Worker) {
    const cider = this.cider;
    const free = cider.slots.filter((s) => !s).length;
    if (w.hand.has('cider')) {
      if (free > 0) { this.goWorker(w, cider.drop, () => this.workerDeliverShop(w, cider)); return; }
    }
    if (w.hand.has('apple') && (w.hand.full || !this.trees.some((t) => t.apples.some(Boolean)))) {
      if (this.press.inCount < this.press.inMax) { this.goWorker(w, this.press.inZone, () => this.workerFeed(w, this.press)); return; }
    }
    if (w.hand.count === 0 && this.press.out.length >= 2 && free >= 2) {
      this.goWorker(w, this.press.outZone, () => {
        let n = Math.min(free, w.hand.capacity);
        const step = () => {
          if (n-- <= 0 || !this.press.out.length) return;
          w.hand.receive('cider', this.press.out.pop()!);
          tweens.add(0.01, () => {}, { delay: 0.1, done: step });
        };
        step();
        w.state = 'act';
        w.t = 1.0;
        w.job = () => { w.state = 'idle'; };
      });
      return;
    }
    if (!w.hand.full && !w.hand.has('cider')) {
      const trees = this.trees.filter((t) => t.apples.some(Boolean)).sort((a, b) => b.apples.filter(Boolean).length - a.apples.filter(Boolean).length);
      if (trees.length) {
        const t = trees[0];
        this.goWorker(w, t.pos.clone().add(V(0.9, 0, 0.6)), () => {
          const shakeN = () => {
            if (w.hand.full || !this.shakeApple(t, w.hand)) return;
            tweens.add(0.01, () => {}, { delay: 0.18, done: shakeN });
          };
          shakeN();
          w.state = 'act';
          w.t = 1.2;
          w.job = () => { w.state = 'idle'; };
        });
        return;
      }
    }
    if (w.hand.count > 0 && w.hand.has('apple') && this.press.inCount < this.press.inMax) { this.goWorker(w, this.press.inZone, () => this.workerFeed(w, this.press)); return; }
    if (flatDist(w.p.position, w.idleSpot) > 0.5) this.goWorker(w, w.idleSpot, () => {});
  }

  workerDeliverShop(w: Worker, sh: Shop) {
    const step = () => {
      const slot = sh.slots.findIndex((s) => !s);
      if (slot < 0) return;
      const kind = sh.kinds.find((k) => w.hand.has(k));
      const m = kind ? w.hand.take(kind) : null;
      if (!m || !kind) return;
      m.userData.kind = kind;
      this.placeOnShop(sh, m, slot);
      tweens.add(0.01, () => {}, { delay: 0.1, done: step });
    };
    step();
    w.state = 'act';
    w.t = 0.9;
    w.job = () => { w.state = 'idle'; };
  }

  workerFeed(w: Worker, mc: Machine) {
    const step = () => {
      if (mc.inCount >= mc.inMax) return;
      const m = w.hand.take(mc.inKind);
      if (!m) return;
      this.feedMachine(mc, m);
      tweens.add(0.01, () => {}, { delay: 0.08, done: step });
    };
    step();
    w.state = 'act';
    w.t = 0.9;
    w.job = () => { w.state = 'idle'; };
  }

  // ===================================================================
  // Objective / HUD
  // ===================================================================

  updateObjective(dt: number) {
    let text = '';
    let target = null as THREE.Vector3 | null;
    const pp = this.player.position;
    const nearest = (list: Plot[]) => list.sort((a, b) => flatDist(a.pos, pp) - flatDist(b.pos, pp))[0];
    const empty = this.plots.filter((p) => p.state === 'empty');
    const ripe = this.ripeFree();
    const visible = this.pads.filter((d) => !d.done && d.pad.visible);
    const affordable = visible.filter((d) => this.money >= d.pad.remaining).sort((a, b) => a.pad.remaining - b.pad.remaining);
    const richPile = this.cashPiles.filter((c) => c.value >= 12).sort((a, b) => b.value - a.value)[0];
    const standFree = this.stand.slots.some((s) => !s);

    // quest card: icon + short text + optional progress
    let icon = '📍';
    let cur = -1, max = 0;
    const q = (i: string, t: string, tg: THREE.Vector3 | null, c = -1, m = 0) => { icon = i; text = t; target = tg; cur = c; max = m; };
    const fieldDone = this.pads.find((d) => d.id === 'field')!.done;
    const balerPad = this.pads.find((d) => d.id === 'baler')!;
    const fieldPad = this.pads.find((d) => d.id === 'field')!;
    if (!this.baler.built && this.stats.bundles < 4) {
      q('🌿', 'Cut the tall grass', this.grass.nearestUp(pp), this.stats.bundles, 4);
    } else if (!this.baler.built) {
      q('🔧', 'Fix the Hay Baler', balerPad.pad.pos);
    } else if (this.stats.hay < 2 && this.hand.has('grass') && this.baler.inCount < this.baler.inMax) {
      q('🌿', 'Put grass in the Hay Baler', L.balerIn, this.stats.hay, 2);
    } else if (this.stats.hay < 2 && !this.hand.has('grass') && this.baler.inCount < this.baler.ratio && this.baler.out.length === 0) {
      q('🌿', 'Cut more grass', this.grass.nearestUp(pp), this.stats.hay, 2);
    } else if (this.stats.stocked < 2 && this.baler.out.length && !this.hand.full && !this.hand.has('hay')) {
      q('🌾', 'Pick up the hay bales', L.balerOut);
    } else if (this.stats.stocked < 2 && this.hand.has('hay')) {
      q('🏪', 'Stock the farm stand', this.stand.drop, this.stats.stocked, 2);
    } else if (richPile && this.stats.collected < 2) {
      q('💰', 'Collect your coins', richPile.origin);
    } else if (!fieldDone && fieldPad.pad.visible) {
      q('🎃', this.money >= fieldPad.pad.remaining ? 'Build the Pumpkin Field' : 'Sell hay to build the field', fieldPad.pad.pos, Math.floor(this.money), Math.ceil(fieldPad.pad.remaining));
    } else if (!fieldDone) {
      const r = this.grass.clearedRatio(L.fieldA);
      q('🌿', 'Clear the grass for a field', this.grass.nearestUp(pp, L.fieldA), Math.min(100, Math.floor((r / 0.8) * 100)), 100);
    } else if (this.stats.planted < 6 && empty.length) {
      q('🌱', 'Plant seeds', nearest(empty).pos, this.stats.planted, 6);
    } else if (this.stats.harvested === 0 && this.plots.length) {
      if (ripe.length) q('🎃', 'Pick ripe pumpkins', nearest(ripe).pos, 0, 6);
      else q('⏳', 'Pumpkins are growing…', empty.length ? nearest(empty).pos : null);
    } else if (this.stats.harvested < 6 && !this.hand.full && ripe.length && this.stats.stocked === 0) {
      q('🎃', 'Pick ripe pumpkins', nearest(ripe).pos, this.stats.harvested, 6);
    } else if (this.hand.has('pumpkin') && standFree && this.stats.stocked < 6) {
      q('🏪', 'Stock the farm stand', this.stand.drop, this.stats.stocked, 6);
    } else if (richPile && this.stats.collected < 2) {
      q('💰', 'Collect your coins', richPile.origin);
    } else if (affordable.length) {
      const a = affordable[0];
      q(a.pad.icon || '⭐', a.upgrade ? `Upgrade ${a.pad.title}` : `Unlock ${a.name}`, a.pad.pos);
    } else if (this.hand.has('grass') && this.baler.inCount < this.baler.inMax) {
      q('🌿', 'Put grass in the Hay Baler', L.balerIn);
    } else if (this.hand.has('hay') && standFree) {
      q('🏪', 'Stock the farm stand', this.stand.drop);
    } else if (this.baler.out.length >= 3 && !this.hand.full) {
      q('🌾', 'Pick up the hay bales', L.balerOut);
    } else if (this.hand.has('cider') && this.cider.slots.some((s) => !s)) {
      q('🧃', 'Stock the cider stand', this.cider.drop);
    } else if (this.hand.has('pie') && this.bakery.slots.some((s) => !s)) {
      q('🥧', 'Stock the pie counter', this.bakery.drop);
    } else if (this.hand.has('apple') && this.press.built && this.press.inCount < this.press.inMax) {
      q('🍎', 'Press apples into cider', this.press.inZone);
    } else if (this.press.out.length >= 3 && !this.hand.full) {
      q('🧃', 'Pick up fresh cider', this.press.outZone);
    } else if (this.oven.out.length >= 2 && !this.hand.full) {
      q('🥧', 'Pick up fresh pies', this.oven.outZone);
    } else if (this.hand.has('pumpkin') && standFree) {
      q('🏪', 'Stock the farm stand', this.stand.drop);
    } else if (this.hand.has('pumpkin') && this.oven.built && this.oven.inCount < this.oven.inMax) {
      q('🔥', 'Bake pies at the oven', this.oven.inZone);
    } else if (this.hay.built && !this.hay.driver && this.hay.state === 'idle' && this.hay.seats.some((v) => v && v.state === 'ride')) {
      q('🚜', 'Start the hayride!', L.hayGo);
    } else if (richPile) {
      q('💰', 'Collect your coins', richPile.origin);
    } else if (empty.length >= 4) {
      q('🌱', 'Plant more pumpkins', nearest(empty).pos);
    } else if (ripe.length && !this.hand.full && standFree) {
      q('🎃', 'Pick ripe pumpkins', nearest(ripe).pos);
    } else if (visible.length) {
      const v = visible.sort((a, b) => a.pad.remaining - b.pad.remaining)[0];
      q(v.pad.icon || '⭐', `Save up: ${v.upgrade ? v.pad.title : v.name}`, null, Math.floor(this.money), Math.ceil(v.pad.remaining));
    } else q('🏆', this.ended ? 'Best farm in the county!' : 'Keep the farm running!', null);
    if (target && flatDist(target, pp) < 1.2 && !text.startsWith('Unlock') && !text.startsWith('Upgrade')) target = null;

    if (text !== this.objectiveKey) {
      this.objectiveKey = text;
      this.hud.objectiveText.textContent = text;
      this.hud.objIcon.textContent = icon;
      this.hud.objective.classList.remove('pop');
      void this.hud.objective.offsetWidth;
      this.hud.objective.classList.add('pop');
    }
    this.hud.objBar.style.display = max > 0 ? '' : 'none';
    if (max > 0) {
      const c = Math.min(cur, max);
      this.hud.objFill.style.width = `${(c / max) * 100}%`;
      this.hud.objCount.textContent = `${c}/${max}`;
    }
    if (target) {
      const d = flatDist(pp, target);
      this.arrow.visible = d > 2.8;
      const ang = Math.atan2(target.x - pp.x, target.z - pp.z);
      this.arrow.position.set(pp.x + Math.sin(ang) * 1.4, 0.12, pp.z + Math.cos(ang) * 1.4);
      this.arrow.rotation.y = ang;
      const s = 1 + Math.sin(this.time * 6) * 0.08;
      this.arrow.scale.set(s, 1, s);
      this.marker.visible = true;
      this.marker.position.set(target.x, 2.0 + Math.sin(this.time * 4) * 0.25, target.z);
      this.marker.rotation.y += dt * 2;
    } else {
      this.arrow.visible = false;
      this.marker.visible = false;
    }
  }

  farmProgress() {
    const main = this.pads.filter((d) => !d.upgrade);
    return main.filter((d) => d.done).length / main.length;
  }

  private lastMoney = -1;
  updateHud(force: boolean, dt = 0) {
    const diff = this.money - this.shownMoney;
    if (Math.abs(diff) < 1 || force) this.shownMoney = this.money;
    else this.shownMoney += diff * Math.min(1, dt * 12);
    const m = Math.round(this.shownMoney);
    if (m !== this.lastMoney) {
      if (m > this.lastMoney && this.lastMoney >= 0) {
        this.hud.moneyBox.classList.remove('bump');
        void this.hud.moneyBox.offsetWidth;
        this.hud.moneyBox.classList.add('bump');
      }
      this.lastMoney = m;
      this.hud.money.textContent = m >= 10000 ? `${(m / 1000).toFixed(1)}K` : `${m}`;
    }
    const pr = this.farmProgress();
    this.hud.levelNum.textContent = `${this.attractions().length}`;
    this.hud.levelFill.style.width = `${pr * 100}%`;
    this.hud.levelText.textContent = `Farm ${Math.floor(pr * 100)}%`;
  }

  showBanner(title: string, sub: string) {
    const b = this.hud.banner;
    b.innerHTML = `<div class="ribbon-red">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  showEndCard() {
    const el = document.createElement('div');
    const mins = Math.floor(this.time / 60), secs = Math.floor(this.time % 60);
    el.style.cssText = 'position:absolute;inset:0;z-index:25;display:flex;align-items:center;justify-content:center;background:rgba(20,30,45,.55);';
    el.innerHTML = `<div style="background:#fff;border-radius:22px;padding:22px 24px;width:82%;text-align:center;color:#23324a;box-shadow:0 8px 0 rgba(0,0,0,.25)">
      <div style="font-size:30px;font-weight:700">🏆 Blue Ribbon!</div>
      <div style="margin:6px 0 14px;font-size:16px">Pumpkin Hollow is the best farm in the county.<br>Thanks for playing the prototype!</div>
      <div style="text-align:left;font-size:15px;line-height:1.7;background:#fff4e6;border-radius:12px;padding:10px 14px">
        ⏱️ Time: <b>${mins}m ${secs}s</b><br>🎃 Pumpkins picked: <b>${this.stats.harvested + this.stats.upick}</b><br>👨‍👩‍👧 Visitors: <b>${this.stats.visitors}</b><br>🚜 Hayrides: <b>${this.stats.rides}</b><br>🥧 Pies baked: <b>${this.stats.pies}</b>
      </div>
      <button style="margin-top:14px;font-family:inherit;font-size:18px;font-weight:700;color:#fff;background:#2fb344;border:0;border-radius:14px;padding:10px 24px;cursor:pointer">Keep playing</button>
    </div>`;
    el.querySelector('button')!.addEventListener('click', () => el.remove());
    this.hud.stage.appendChild(el);
  }

  // ---------------- Debug ----------------
  debugMoney(n: number) { this.addMoney(n); }
  debugGrow() {
    for (const p of this.plots) {
      if (p.state === 'empty') this.plant(p, false);
      p.t = this.growTime;
    }
  }
}

export { tweens };
