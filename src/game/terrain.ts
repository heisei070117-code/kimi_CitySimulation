import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import {
  MAP_SIZE, TERRAIN_CELLS, TERRAIN_VERTS, HALF,
} from './types';

const CELL = MAP_SIZE / TERRAIN_CELLS;

// 簡易バリューノイズ(初期地形用)
function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed * 144269;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const xf = x - xi; const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi); const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export class Terrain {
  heights = new Float32Array(TERRAIN_VERTS * TERRAIN_VERTS);
  mesh!: THREE.Mesh;
  water!: Water;
  dirty = false;
  colorsDirty = false;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3) {
    this.scene = scene;
    this.buildInitial();
    this.buildMesh();
    this.buildWater(sunDir);
  }

  idx(ix: number, iz: number) { return iz * TERRAIN_VERTS + ix; }

  private buildInitial() {
    const n1 = makeNoise(11);
    const n2 = makeNoise(47);
    for (let iz = 0; iz < TERRAIN_VERTS; iz++) {
      for (let ix = 0; ix < TERRAIN_VERTS; ix++) {
        const x = ix / TERRAIN_CELLS; const z = iz / TERRAIN_CELLS;
        // なだらかな起伏
        let h = 7
          + n1(x * 6, z * 6) * 6
          + n2(x * 18, z * 18) * 1.8;
        // 外周に向かって下げて海にする (海岸線つきの島)
        const dx = x - 0.5; const dz = z - 0.5;
        const r = Math.sqrt(dx * dx + dz * dz) * 2; // 0(中心)〜1.41(角)
        const shore = THREE.MathUtils.smoothstep(r, 0.78, 1.02);
        h = h * (1 - shore) - shore * 14;
        this.heights[this.idx(ix, iz)] = h;
      }
    }
  }

  private buildMesh() {
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, TERRAIN_CELLS, TERRAIN_CELLS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.scene.add(this.mesh);
    this.applyHeights();
    this.recolorAll();
  }

  private buildWater(sunDir: THREE.Vector3) {
    // プロシージャルな法線ノイズテクスチャ
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const nz = makeNoise(99);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const a = nz(x / 10, y / 10) * Math.PI * 2;
        img.data[i] = 128 + Math.cos(a) * 90;
        img.data[i + 1] = 128 + Math.sin(a) * 90;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const normals = new THREE.CanvasTexture(canvas);
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;

    this.water = new Water(new THREE.PlaneGeometry(MAP_SIZE * 4, MAP_SIZE * 4), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: sunDir.clone(),
      sunColor: 0xffffff,
      waterColor: 0x0e3a45,
      distortionScale: 2.6,
      fog: true,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    this.scene.add(this.water);
  }

  private applyHeights() {
    const pos = this.mesh.geometry.attributes.position;
    for (let iz = 0; iz < TERRAIN_VERTS; iz++) {
      for (let ix = 0; ix < TERRAIN_VERTS; ix++) {
        // PlaneGeometry(rotateX後): xは-半分〜+半分、zも同様。頂点の並びは行優先
        pos.setY(this.idx(ix, iz), this.heights[this.idx(ix, iz)]);
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }

  // 高さ問い合わせ (双線形補間)
  getHeight(x: number, z: number): number {
    const fx = THREE.MathUtils.clamp((x + HALF) / CELL, 0, TERRAIN_CELLS - 0.001);
    const fz = THREE.MathUtils.clamp((z + HALF) / CELL, 0, TERRAIN_CELLS - 0.001);
    const ix = Math.floor(fx); const iz = Math.floor(fz);
    const tx = fx - ix; const tz = fz - iz;
    const h00 = this.heights[this.idx(ix, iz)];
    const h10 = this.heights[this.idx(ix + 1, iz)];
    const h01 = this.heights[this.idx(ix, iz + 1)];
    const h11 = this.heights[this.idx(ix + 1, iz + 1)];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // ブラシで盛る/掘る (ガウス減衰)
  sculpt(x: number, z: number, radius: number, delta: number) {
    const cix = Math.round((x + HALF) / CELL);
    const ciz = Math.round((z + HALF) / CELL);
    const rCells = Math.ceil(radius / CELL);
    const sigma = radius / 2.2;
    for (let iz = Math.max(0, ciz - rCells); iz <= Math.min(TERRAIN_CELLS, ciz + rCells); iz++) {
      for (let ix = Math.max(0, cix - rCells); ix <= Math.min(TERRAIN_CELLS, cix + rCells); ix++) {
        const wx = ix * CELL - HALF; const wz = iz * CELL - HALF;
        const dist = Math.hypot(wx - x, wz - z);
        if (dist > radius) continue;
        const fall = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        const i = this.idx(ix, iz);
        this.heights[i] = THREE.MathUtils.clamp(this.heights[i] + delta * fall, -18, 220);
      }
    }
    this.dirty = true;
    this.colorsDirty = true;
  }

  // 毎フレーム: 変更があれば反映
  flush() {
    if (this.dirty) {
      this.applyHeights();
      this.dirty = false;
    }
    if (this.colorsDirty) {
      this.recolorAll();
      this.colorsDirty = false;
    }
  }

  private recolorAll() {
    const pos = this.mesh.geometry.attributes.position;
    const col = this.mesh.geometry.attributes.color as THREE.BufferAttribute;
    const sand = new THREE.Color('#c9b98a');
    const grass = new THREE.Color('#6e8f52');
    const grass2 = new THREE.Color('#7fa05c');
    const rock = new THREE.Color('#8d8d90');
    const deepRock = new THREE.Color('#7a7d80');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i);
      const nx = pos.getX(i); const nz2 = pos.getZ(i);
      // 勾配(法線y成分)で岩判定
      const ny = this.mesh.geometry.attributes.normal?.getY(i) ?? 1;
      if (h < 0.6) tmp.copy(sand);
      else if (h < 2.2) tmp.copy(sand).lerp(grass, (h - 0.6) / 1.6);
      else if (h < 90) {
        const v = (Math.sin(nx * 0.05) + Math.cos(nz2 * 0.045)) * 0.25 + 0.5;
        tmp.copy(grass).lerp(grass2, v);
      } else tmp.copy(rock).lerp(deepRock, Math.min(1, (h - 90) / 80));
      if (ny < 0.72 && h > 2) tmp.lerp(rock, 0.75);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  }

  update(elapsed: number) {
    const uni = (this.water.material as THREE.ShaderMaterial).uniforms;
    if (uni.time) uni.time.value = elapsed * 0.6;
  }

  setWaterQuality(high: boolean) {
    const uni = (this.water.material as THREE.ShaderMaterial).uniforms;
    if (uni.size) uni.size.value = high ? 4 : 2;
  }

  serialize(): string {
    const bytes = new Uint8Array(this.heights.buffer);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  deserialize(b64: string) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    this.heights.set(new Float32Array(bytes.buffer));
    this.dirty = true;
    this.colorsDirty = true;
    this.flush();
  }
}
