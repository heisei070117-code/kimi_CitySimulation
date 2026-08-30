import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// 昼夜サイクル: 太陽・空・環境光・星をまとめて管理
export class DayNight {
  sky: Sky;
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  stars: THREE.Points;
  sunDir = new THREE.Vector3(0, 1, 0);
  nightFactor = 0; // 0=昼 1=夜
  dayFactor = 1;

  constructor(scene: THREE.Scene) {
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.8;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 2500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 2;
    this.setShadowExtent(420);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x8fa8cc, 0);
    scene.add(this.moon);
    scene.add(this.moon.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7f6a, 0.7);
    scene.add(this.hemi);

    // 星
    const starGeo = new THREE.BufferGeometry();
    const N = 1400;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.95 + 0.05;
      v.multiplyScalar(9000);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xcdd8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0 }),
    );
    this.stars.frustumCulled = false;
    scene.add(this.stars);
  }

  setShadowExtent(e: number) {
    const c = this.sun.shadow.camera;
    c.left = -e; c.right = e; c.top = e; c.bottom = -e;
    c.updateProjectionMatrix();
  }

  // timeOfDay: 0-24。focus: 影を追従させる中心(カメラ注視点)
  update(timeOfDay: number, focus: THREE.Vector3, renderer: THREE.WebGLRenderer) {
    const ang = ((timeOfDay - 6) / 12) * Math.PI; // 6時=日の出 18時=日没
    const elev = Math.sin(ang);
    const azim = ang + Math.PI / 2;
    this.sunDir.set(Math.cos(azim) * Math.cos(ang) * -1, Math.max(elev, -0.4), Math.sin(azim) * Math.cos(ang)).normalize();

    const uni = this.sky.material.uniforms;
    uni.sunPosition.value.copy(this.sunDir);

    const day = THREE.MathUtils.smoothstep(elev, -0.04, 0.25);
    this.dayFactor = day;
    this.nightFactor = 1 - day;

    // 太陽光
    const warm = THREE.MathUtils.clamp(1 - elev * 2.2, 0, 1); // 朝夕は暖色
    this.sun.color.setHSL(0.1, 0.5 * warm, 0.97 - warm * 0.12);
    this.sun.intensity = Math.max(0, elev) * 3.4;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 900);
    this.sun.target.position.copy(focus);
    this.sun.visible = elev > -0.02;

    // 月光
    this.moon.intensity = this.nightFactor * 0.22;
    this.moon.position.copy(focus).add(new THREE.Vector3(300, 700, -400));
    this.moon.target.position.copy(focus);

    // 環境光
    this.hemi.intensity = 0.12 + day * 0.65;
    this.hemi.color.setHSL(0.6, 0.4, 0.25 + day * 0.55);
    this.hemi.groundColor.setHSL(0.08, 0.3, 0.12 + day * 0.3);

    // 露出
    renderer.toneMappingExposure = 0.28 + day * 0.72;

    // 星
    (this.stars.material as THREE.PointsMaterial).opacity = this.nightFactor * 0.9;
  }
}
