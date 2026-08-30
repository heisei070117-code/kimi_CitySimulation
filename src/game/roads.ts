import * as THREE from 'three';
import type { RoadSeg } from './types';
import type { Terrain } from './terrain';

const ROAD_WIDTH = 12;
const LIFT = 0.3; // 地形からの浮かせ量

function makeRoadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3c4046';
  ctx.fillRect(0, 0, 128, 128);
  // 端の白線 (u方向の両端)
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(4, 0, 3, 128);
  ctx.fillRect(121, 0, 3, 128);
  // 中央破線 (v方向に破線)
  ctx.fillStyle = '#e8e8e0';
  ctx.fillRect(62, 12, 4, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class RoadRenderer {
  mesh: THREE.Mesh | null = null;
  lampPoles: THREE.InstancedMesh | null = null;
  lampHeads: THREE.InstancedMesh | null = null;
  private tex = makeRoadTexture();
  private headMat = new THREE.MeshStandardMaterial({
    color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0,
  });
  private scene: THREE.Scene;
  private terrain: Terrain;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.scene = scene;
    this.terrain = terrain;
  }

  rebuild(roads: RoadSeg[]) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (roads.length === 0) {
      this.rebuildLamps([]);
      return;
    }

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const lampPos: { x: number; z: number; side: number }[] = [];

    let vBase = 0;
    for (const seg of roads) {
      const dx = seg.bx - seg.ax; const dz = seg.bz - seg.az;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const nx = -dz / len; const nz = dx / len; // 法線
      const step = 8;
      const n = Math.max(1, Math.ceil(len / step));
      const startIdx = vBase;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const cx = seg.ax + dx * t; const cz = seg.az + dz * t;
        const lx = cx + nx * ROAD_WIDTH / 2; const lz = cz + nz * ROAD_WIDTH / 2;
        const rx = cx - nx * ROAD_WIDTH / 2; const rz = cz - nz * ROAD_WIDTH / 2;
        positions.push(lx, this.terrain.getHeight(lx, lz) + LIFT, lz);
        positions.push(rx, this.terrain.getHeight(rx, rz) + LIFT, rz);
        uvs.push(0, t * len / ROAD_WIDTH, 1, t * len / ROAD_WIDTH);
        if (i < n) {
          const a = startIdx + i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      vBase += (n + 1) * 2;
      // 街灯位置 (45mごと・左右交互)
      const lamps = Math.floor(len / 45);
      for (let i = 1; i <= lamps; i++) {
        const t = i / (lamps + 1);
        lampPos.push({ x: seg.ax + dx * t, z: seg.az + dz * t, side: (i % 2 === 0 ? 1 : -1) });
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: this.tex, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this.rebuildLamps(lampPos);
  }

  private rebuildLamps(lamps: { x: number; z: number; side: number }[]) {
    if (this.lampPoles) {
      this.scene.remove(this.lampPoles); this.lampPoles.dispose();
      this.scene.remove(this.lampHeads!); this.lampHeads!.dispose();
      this.lampPoles = null; this.lampHeads = null;
    }
    if (lamps.length === 0) return;
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 7, 5);
    poleGeo.translate(0, 3.5, 0);
    const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
    headGeo.translate(0, 7, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.6, metalness: 0.6 });

    this.lampPoles = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);
    this.lampHeads = new THREE.InstancedMesh(headGeo, this.headMat, lamps.length);
    const dummy = new THREE.Object3D();
    lamps.forEach((l, i) => {
      dummy.position.set(l.x, this.terrain.getHeight(l.x, l.z), l.z);
      dummy.updateMatrix();
      this.lampPoles!.setMatrixAt(i, dummy.matrix);
      this.lampHeads!.setMatrixAt(i, dummy.matrix);
    });
    this.lampPoles.castShadow = true;
    this.scene.add(this.lampPoles);
    this.scene.add(this.lampHeads);
  }

  setNight(f: number) {
    this.headMat.emissiveIntensity = f * 3.5;
    this.headMat.color.setScalar(f * 0.8 + 0.13);
  }

  // カーソル位置に最も近い道路区間を探す
  nearest(roads: RoadSeg[], x: number, z: number, maxDist: number): RoadSeg | null {
    let best: RoadSeg | null = null;
    let bestD = maxDist;
    for (const s of roads) {
      const dx = s.bx - s.ax; const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 0.01) continue;
      const t = THREE.MathUtils.clamp(((x - s.ax) * dx + (z - s.az) * dz) / len2, 0, 1);
      const px = s.ax + dx * t; const pz = s.az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
}
