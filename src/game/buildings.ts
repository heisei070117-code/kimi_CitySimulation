import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingPreset, Placement } from './types';
import { presetById } from './types';

// --- 再現性のある乱数 ---
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALL_UV_MAX = 0.92; // 壁が使うUV範囲。右上の残りが屋根色パッチ
const ROOF_UV: [number, number] = [0.96, 0.96];
const WALL_CORNER_UV: [number, number] = [0.03, 0.97];

export interface VariantDef {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  w: number;
  d: number;
  h: number;
}

// --- ファサード(窓)テクスチャ生成 ---
function makeFacadeTextures(
  wallColor: string, roofColor: string,
  cols: number, rows: number, litRatio: number, glassy: boolean,
  rng: () => number,
): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const S = 256;
  const mapC = document.createElement('canvas'); mapC.width = mapC.height = S;
  const emiC = document.createElement('canvas'); emiC.width = emiC.height = S;
  const m = mapC.getContext('2d')!;
  const e = emiC.getContext('2d')!;
  m.fillStyle = wallColor; m.fillRect(0, 0, S, S);
  e.fillStyle = '#000000'; e.fillRect(0, 0, S, S);
  // 屋根色パッチ (右上)
  m.fillStyle = roofColor; m.fillRect(S * 0.93, 0, S * 0.07, S * 0.07);
  m.fillRect(S * 0.93, S * 0.93, S * 0.07, S * 0.07);
  m.fillRect(0, S * 0.93, S * 0.07, S * 0.07);

  if (cols > 0 && rows > 0) {
    const areaW = S * WALL_UV_MAX;
    const mx = 14; const my = 12; // マージン
    const cw = (areaW - mx * 2) / cols;
    const ch = (areaW - my * 2) / rows;
    const ww = cw * (glassy ? 0.92 : 0.58);
    const wh = ch * (glassy ? 0.55 : 0.6);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = mx + c * cw + (cw - ww) / 2;
        const y = my + r * ch + (ch - wh) / 2;
        const shade = glassy ? 40 + rng() * 50 : 26 + rng() * 34;
        m.fillStyle = `rgb(${shade | 0},${(shade + 8) | 0},${(shade + 18) | 0})`;
        m.fillRect(x, y, ww, wh);
        if (glassy) { // カーテンウォールの反射帯
          m.fillStyle = 'rgba(255,255,255,0.18)';
          m.fillRect(x, y, ww, wh * 0.25);
        }
        if (rng() < litRatio) {
          e.fillStyle = `rgb(255,${175 + rng() * 50 | 0},${100 + rng() * 50 | 0})`;
          e.fillRect(x, y, ww, wh);
        }
      }
    }
  }
  const map = new THREE.CanvasTexture(mapC);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(emiC);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

// BoxのUVを壁/屋根に振り分け
function adjustBoxUV(geo: THREE.BoxGeometry) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      if (face === 2 || face === 3) uv.setXY(i, ROOF_UV[0], ROOF_UV[1]); // 天面・底面
      else uv.setXY(i, uv.getX(i) * WALL_UV_MAX, uv.getY(i) * WALL_UV_MAX);
    }
  }
}

function gableRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2; const hd = d / 2;
  const A = [-hw, 0, -hd]; const B = [hw, 0, -hd]; const C = [hw, 0, hd]; const D = [-hw, 0, hd];
  const E = [0, h, -hd]; const F = [0, h, hd];
  const pos: number[] = []; const uv: number[] = [];
  const tri = (p: number[][], uvPt: [number, number]) => {
    p.forEach((q) => pos.push(...q));
    p.forEach(() => uv.push(...uvPt));
  };
  // 斜面は屋根色、妻壁は壁色コーナー
  tri([A, F, E], ROOF_UV); tri([A, D, F], ROOF_UV); // 左斜面
  tri([B, E, F], ROOF_UV); tri([B, F, C], ROOF_UV); // 右斜面
  tri([A, E, B], WALL_CORNER_UV); // 前の妻壁
  tri([D, C, F], WALL_CORNER_UV); // 後の妻壁
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function pyramidRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2; const hd = d / 2;
  const A = [-hw, 0, -hd]; const B = [hw, 0, -hd]; const C = [hw, 0, hd]; const D = [-hw, 0, hd];
  const P = [0, h, 0];
  const pos: number[] = []; const uv: number[] = [];
  const tri = (p: number[][]) => { p.forEach((q) => pos.push(...q)); p.forEach(() => uv.push(...ROOF_UV)); };
  tri([A, P, B]); tri([B, P, C]); tri([C, P, D]); tri([D, P, A]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function setVertexColor(geo: THREE.BufferGeometry, color: THREE.Color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// インデックス有無が混在していてもマージできるように非インデックス化して統合
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  return mergeGeometries(nonIndexed)!;
}

function treeGeometry(rng: () => number): { geo: THREE.BufferGeometry; h: number } {
  const pine = rng() < 0.5;
  const trunkH = 1.8 + rng() * 1.2;
  const trunk = new THREE.CylinderGeometry(0.25, 0.4, trunkH, 6);
  trunk.translate(0, trunkH / 2, 0);
  setVertexColor(trunk, new THREE.Color('#6b4a34'));
  let foliage: THREE.BufferGeometry;
  let h: number;
  if (pine) {
    const fh = 4.5 + rng() * 3;
    foliage = new THREE.ConeGeometry(1.6 + rng() * 0.9, fh, 8);
    foliage.translate(0, trunkH + fh / 2 - 0.3, 0);
    h = trunkH + fh;
    setVertexColor(foliage, new THREE.Color('#3e6b33').offsetHSL(0, 0, (rng() - 0.5) * 0.08));
  } else {
    const fr = 2 + rng() * 1.4;
    foliage = new THREE.IcosahedronGeometry(fr, 1);
    foliage.translate(0, trunkH + fr * 0.8, 0);
    h = trunkH + fr * 1.8;
    setVertexColor(foliage, new THREE.Color('#4c7a3a').offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.08));
  }
  return { geo: mergeAll([trunk, foliage]), h };
}

function parkGeometry(rng: () => number, radius: number): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(radius, radius, 0.4, 24);
  disc.translate(0, 0.2, 0);
  setVertexColor(disc, new THREE.Color('#5d8a48').offsetHSL(0, 0, (rng() - 0.5) * 0.05));
  const parts: THREE.BufferGeometry[] = [disc];
  const trees = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < trees; i++) {
    const { geo } = treeGeometry(rng);
    const a = rng() * Math.PI * 2;
    const r = rng() * radius * 0.55;
    geo.translate(Math.cos(a) * r, 0.3, Math.sin(a) * r);
    parts.push(geo);
  }
  // ベンチ的な小さな石
  const stone = new THREE.BoxGeometry(2.2, 0.5, 1);
  stone.translate(radius * 0.3, 0.45, radius * 0.2);
  setVertexColor(stone, new THREE.Color('#9a9a96'));
  parts.push(stone);
  return mergeAll(parts);
}

// --- バリエーション生成 ---
export function generateVariants(preset: BuildingPreset): VariantDef[] {
  const rng = mulberry([...preset.id].reduce((s, c) => s + c.charCodeAt(0), 0) * 7919);
  const out: VariantDef[] = [];
  for (let v = 0; v < preset.variants; v++) {
    const w = preset.minW + rng() * (preset.maxW - preset.minW);
    const d = preset.minD + rng() * (preset.maxD - preset.minD);
    let h = preset.minH + rng() * (preset.maxH - preset.minH);

    if (preset.vegetation) {
      const { geo, h: th } = treeGeometry(rng);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
      out.push({ geometry: geo, material: mat, w, d, h: th });
      continue;
    }
    if (preset.park) {
      const geo = parkGeometry(rng, w / 2);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
      out.push({ geometry: geo, material: mat, w, d, h: 8 });
      continue;
    }

    const wall = preset.palette[Math.floor(rng() * preset.palette.length)];
    const roof = preset.roofPalette[Math.floor(rng() * preset.roofPalette.length)];
    const cols = Math.max(1, Math.round((w + d) / 2 / preset.windowColWidth));
    const rows = Math.max(1, Math.round(h / preset.windowRowHeight));
    const { map, emissive } = makeFacadeTextures(wall, roof, cols, rows, preset.litRatio, !!preset.glassy, rng);

    const parts: THREE.BufferGeometry[] = [];
    const box = new THREE.BoxGeometry(w, h, d);
    adjustBoxUV(box);
    box.translate(0, h / 2, 0);
    parts.push(box);

    if (preset.roof === 'gable') {
      const rh = Math.min(w, d) * (0.35 + rng() * 0.25);
      const g = gableRoof(w, d, rh);
      g.translate(0, h, 0);
      parts.push(g);
      h += rh;
    } else if (preset.roof === 'pyramid') {
      const g = pyramidRoof(w, d, Math.min(w, d) * 0.4);
      g.translate(0, h, 0);
      parts.push(g);
    } else if (preset.roof === 'skylight') {
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const sky = new THREE.BoxGeometry(w * 0.12, 1.4, d * 0.7);
        const uvA = sky.attributes.uv as THREE.BufferAttribute;
        for (let k = 0; k < uvA.count; k++) uvA.setXY(k, ROOF_UV[0], ROOF_UV[1]);
        sky.translate((i - (n - 1) / 2) * (w / (n + 1)), h + 0.7, 0);
        parts.push(sky);
      }
    } else if (preset.roof === 'flat' && preset.glassy) {
      // 高層ビルの冠(セットバック)
      if (rng() < 0.6) {
        const capH = 4 + rng() * 8;
        const cap = new THREE.BoxGeometry(w * (0.5 + rng() * 0.3), capH, d * (0.5 + rng() * 0.3));
        adjustBoxUV(cap);
        cap.translate(0, h + capH / 2, 0);
        parts.push(cap);
        h += capH;
      }
    }

    const geo = mergeAll(parts);
    const mat = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0,
      roughness: preset.glassy ? 0.35 : 0.85,
      metalness: preset.glassy ? 0.4 : 0.05,
    });
    out.push({ geometry: geo, material: mat, w, d, h });
  }
  return out;
}

// --- インスタンシングによる描画管理 ---
export class BuildingRenderer {
  private pools = new Map<string, { mesh: THREE.InstancedMesh; capacity: number }>();
  private variants = new Map<string, VariantDef[]>();
  private nightMats: { mat: THREE.MeshStandardMaterial; max: number }[] = [];
  group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  getVariants(presetId: string): VariantDef[] {
    let vs = this.variants.get(presetId);
    if (!vs) {
      const preset = presetById(presetId);
      vs = generateVariants(preset);
      this.variants.set(presetId, vs);
      for (const vd of vs) {
        if (vd.material.emissiveMap) this.nightMats.push({ mat: vd.material, max: preset.glassy ? 1.5 : 1.1 });
      }
    }
    return vs;
  }

  // 全再構築 (配置・削除のたびに呼ぶ)
  rebuild(placements: Placement[], animating: Map<number, number>) {
    const byPool = new Map<string, Placement[]>();
    for (const p of placements) {
      const key = `${p.presetId}:${p.variant}`;
      const arr = byPool.get(key) ?? [];
      arr.push(p);
      byPool.set(key, arr);
    }
    // 不要プールの削除
    for (const [key, pool] of this.pools) {
      if (!byPool.has(key)) {
        this.group.remove(pool.mesh);
        pool.mesh.dispose();
        this.pools.delete(key);
      }
    }
    const dummy = new THREE.Object3D();
    for (const [key, list] of byPool) {
      const [presetId, vStr] = key.split(':');
      const vd = this.getVariants(presetId)[Number(vStr)];
      let pool = this.pools.get(key);
      if (!pool || pool.capacity < list.length) {
        if (pool) { this.group.remove(pool.mesh); pool.mesh.dispose(); }
        const capacity = Math.max(16, Math.ceil(list.length * 1.6));
        const mesh = new THREE.InstancedMesh(vd.geometry, vd.material, capacity);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.userData.poolKey = key;
        this.group.add(mesh);
        pool = { mesh, capacity };
        this.pools.set(key, pool);
      }
      pool.mesh.userData.list = list;
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        const s = animating.has(p.id) ? 0.01 : 1;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        pool!.mesh.setMatrixAt(i, dummy.matrix);
      });
      pool.mesh.count = list.length;
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.mesh.computeBoundingSphere();
    }
  }

  setNight(f: number) {
    for (const n of this.nightMats) n.mat.emissiveIntensity = f * n.max;
  }

  raycast(raycaster: THREE.Raycaster): { placement: Placement } | null {
    const hits = raycaster.intersectObjects(this.group.children, false);
    for (const h of hits) {
      const mesh = h.object as THREE.InstancedMesh;
      const list = mesh.userData.list as Placement[] | undefined;
      if (list && h.instanceId !== undefined && list[h.instanceId]) {
        return { placement: list[h.instanceId] };
      }
    }
    return null;
  }

  // ポップインアニメーション中のインスタンス行列更新
  updateAnim(p: Placement, scale: number) {
    const key = `${p.presetId}:${p.variant}`;
    const pool = this.pools.get(key);
    if (!pool) return;
    const list = pool.mesh.userData.list as Placement[];
    const idx = list.indexOf(p);
    if (idx < 0) return;
    const dummy = new THREE.Object3D();
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.setScalar(Math.max(0.01, scale));
    dummy.updateMatrix();
    pool.mesh.setMatrixAt(idx, dummy.matrix);
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
}
