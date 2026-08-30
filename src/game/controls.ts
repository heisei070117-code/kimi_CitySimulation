import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { Terrain } from './terrain';
import type { City } from './city';
import { HALF } from './types';

export type CameraMode = 'orbit' | 'walk';

export class CameraRig {
  orbit: OrbitControls;
  walk: PointerLockControls;
  mode: CameraMode = 'orbit';
  keys = new Set<string>();
  private vel = new THREE.Vector3();
  private camera: THREE.PerspectiveCamera;
  private dom: HTMLElement;
  private terrain: Terrain;
  private city: City;

  constructor(
    camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    terrain: Terrain,
    city: City,
  ) {
    this.camera = camera;
    this.dom = dom;
    this.terrain = terrain;
    this.city = city;
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = Math.PI * 0.47;
    this.orbit.minDistance = 3;
    this.orbit.maxDistance = 2600;
    this.orbit.target.set(0, 5, 0);
    camera.position.set(180, 160, 260);

    this.walk = new PointerLockControls(camera, dom);

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.dom && this.mode === 'walk') {
        this.exitWalk();
      }
    });
  }

  enterWalk() {
    // 現在の注視点付近に立つ
    const t = this.orbit.target;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.mode = 'walk';
    this.orbit.enabled = false;
    this.camera.position.set(t.x, this.terrain.getHeight(t.x, t.z) + 1.7, t.z);
    this.camera.lookAt(t.x + dir.x * 30, this.camera.position.y + dir.y * 30, t.z + dir.z * 30);
    this.walk.lock();
  }

  exitWalk() {
    if (this.walk.isLocked) this.walk.unlock();
    const p = this.camera.position;
    this.mode = 'orbit';
    this.orbit.enabled = true;
    this.orbit.target.set(p.x, this.terrain.getHeight(p.x, p.z), p.z);
    this.camera.position.set(p.x, this.orbit.target.y + 120, p.z + 160);
  }

  update(dt: number) {
    if (this.mode === 'orbit') {
      // 注視点をマップ内に制限
      const t = this.orbit.target;
      t.x = THREE.MathUtils.clamp(t.x, -HALF, HALF);
      t.z = THREE.MathUtils.clamp(t.z, -HALF, HALF);
      t.y = THREE.MathUtils.clamp(t.y, -5, 250);
      this.orbit.update();
      return;
    }
    // 一人称歩行
    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 28 : 8;
    const f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const r = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    const wish = new THREE.Vector3().addScaledVector(dir, f).addScaledVector(right, r);
    if (wish.lengthSq() > 0) wish.normalize();
    this.vel.lerp(wish.multiplyScalar(speed), 1 - Math.exp(-dt * 8));
    this.camera.position.addScaledVector(this.vel, dt);

    // マップ端クランプ
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -HALF + 2, HALF - 2);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -HALF + 2, HALF - 2);

    // 建物との衝突 (円 vs 回転矩形の押し出し)
    const p = this.camera.position;
    const R = 1.0;
    for (const b of this.city.near(p.x, p.z, 40)) {
      if (b.presetId === 'tree' || b.presetId === 'park') continue;
      const cos = Math.cos(-b.rotY); const sin = Math.sin(-b.rotY);
      const dx = p.x - b.x; const dz = p.z - b.z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const hw = b.w / 2; const hd = b.d / 2;
      const cx = THREE.MathUtils.clamp(lx, -hw, hw);
      const cz = THREE.MathUtils.clamp(lz, -hd, hd);
      const ddx = lx - cx; const ddz = lz - cz;
      const dist = Math.hypot(ddx, ddz);
      if (dist < R && p.y < b.y + b.h + 0.5) {
        let pushX: number; let pushZ: number;
        if (dist > 0.001) {
          const push = (R - dist) / dist;
          pushX = ddx * push; pushZ = ddz * push;
        } else {
          // 内部にいる場合: 最も近い面から押し出す
          const px = hw - Math.abs(lx); const pz = hd - Math.abs(lz);
          if (px < pz) { pushX = (lx > 0 ? px + R : -(px + R)); pushZ = 0; }
          else { pushX = 0; pushZ = (lz > 0 ? pz + R : -(pz + R)); }
        }
        // ローカル→ワールド
        const wc = Math.cos(b.rotY); const ws = Math.sin(b.rotY);
        p.x += pushX * wc - pushZ * ws;
        p.z += pushX * ws + pushZ * wc;
      }
    }

    // 地面追従
    const groundY = this.terrain.getHeight(p.x, p.z) + 1.7;
    p.y += (groundY - p.y) * Math.min(1, dt * 12);
  }
}
