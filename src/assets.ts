// Loads glTF/GLB models (CC0 packs in public/models) once, then hands out clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

type Entry = { scene: THREE.Group; animations: THREE.AnimationClip[] };
const cache = new Map<string, Entry>();
const loader = new GLTFLoader();

/** Load every model in the list (key -> url). Missing files are skipped with a warning. */
export async function loadModels(list: Record<string, string>, onProgress?: (done: number, total: number) => void) {
  const keys = Object.keys(list);
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    try {
      const g = await loader.loadAsync(list[k]);
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      cache.set(k, { scene: g.scene, animations: g.animations });
    } catch (e) {
      console.warn('[assets] failed', k, list[k], e);
    }
    onProgress?.(++done, keys.length);
  }));
}

export function has(key: string) { return cache.has(key); }

/**
 * Clone a loaded model. `height` rescales it so its bounding box is that tall;
 * the model is re-centered so its base sits on y = 0.
 */
export function model(key: string, opts: { height?: number; width?: number; skinned?: boolean } = {}): THREE.Group {
  const e = cache.get(key);
  const root = new THREE.Group();
  if (!e) return root;
  const inner = (opts.skinned ? skeletonClone(e.scene) : e.scene.clone(true)) as THREE.Group;
  root.add(inner);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner, true);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (opts.height && size.y > 0) s = opts.height / size.y;
  else if (opts.width && Math.max(size.x, size.z) > 0) s = opts.width / Math.max(size.x, size.z);
  inner.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  root.userData.animations = e.animations;
  return root;
}

/** Merge all meshes of a model into one geometry per material (for InstancedMesh forests). */
export function flatGeometry(key: string, height: number) {
  const g = model(key, { height });
  g.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    parts.push({ geo, mat: mats[0] });
  });
  return parts;
}

/** Models used by the game (all CC0, see public/models/CREDITS.md). */
export const MODELS: Record<string, string> = Object.fromEntries(
  ['pumpkin', 'corn', 'apple', 'pie', 'jug', 'tree', 'pine', 'bush', 'bush_berries', 'barn', 'silo', 'hay', 'fence', 'fruit_crate', 'crate',
    'pickup', 'car', 'car2', 'wagon_car', 'farmer', 'char', 'worker', 'adventurer'].map((k) => [k, `./models/${k}.glb`]),
);
