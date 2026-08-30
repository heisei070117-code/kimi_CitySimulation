import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Terrain } from './terrain';
import { DayNight } from './sky';
import { BuildingRenderer } from './buildings';
import { RoadRenderer } from './roads';
import { City } from './city';
import { CameraRig } from './controls';
import { saveToDB, loadFromDB, exportJSON, importJSON } from './save';
import {
  DEFAULT_SETTINGS, HALF, presetById,
  type GameSettings, type OverlapMode, type QualityLevel,
  type SaveData, type TerrainMode, type ToolId,
} from './types';

export interface SelectionInfo {
  name: string;
  w: number; d: number; h: number;
}

export interface GameCallbacks {
  onSelection: (info: SelectionInfo | null) => void;
  onTimeChange: (t: number) => void;
  onWalkChange: (walk: boolean) => void;
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158; const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private useComposer = false;
  private terrain: Terrain;
  private daynight: DayNight;
  private buildings: BuildingRenderer;
  private roadR: RoadRenderer;
  private city = new City();
  private rig: CameraRig;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();

  private tool: ToolId = 'build';
  private presetId = 'house';
  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private timeOfDay = DEFAULT_SETTINGS.timeOfDay;

  private ghost: THREE.Mesh | null = null;
  private ghostVariant = 0;
  private ghostRot = 0;
  private ghostValid = false;
  private ghostPos = new THREE.Vector3();

  private roadStart: THREE.Vector3 | null = null;
  private roadMarker: THREE.Mesh;
  private roadPreview: THREE.Line;

  private sculpting = false;
  private terrainMode: TerrainMode = 'raise';
  private animating = new Map<number, number>();
  private saveTimer: number | null = null;
  private disposed = false;
  private lastWalkMode = false;
  private lastTimeNotify = 0;
  private canvas: HTMLCanvasElement;
  private cb: GameCallbacks;

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.fog = new THREE.Fog(0xbfd0e0, 900, 6000);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 20000);
    this.daynight = new DayNight(this.scene);
    this.terrain = new Terrain(this.scene, this.daynight.sunDir);
    this.buildings = new BuildingRenderer(this.scene);
    this.roadR = new RoadRenderer(this.scene, this.terrain);
    this.rig = new CameraRig(this.camera, canvas, this.terrain, this.city);

    // 道路の開始点マーカー
    this.roadMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
    );
    this.roadMarker.visible = false;
    this.scene.add(this.roadMarker);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.roadPreview = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffcc44 }));
    this.roadPreview.visible = false;
    this.roadPreview.frustumCulled = false;
    this.scene.add(this.roadPreview);

    this.applyQuality(this.settings.quality);
    this.onResize();
    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);

    this.refreshGhost();
    this.loadAutosave();
    this.loop();
  }

  // ---------- 公開API (UIから呼ぶ) ----------
  setTool(t: ToolId) {
    this.tool = t;
    this.roadStart = null;
    this.roadMarker.visible = false;
    this.roadPreview.visible = false;
    this.refreshGhost();
    this.rig.orbit.enableZoom = t !== 'build';
  }

  setPreset(id: string) {
    this.presetId = id;
    this.refreshGhost();
  }

  setQuality(q: QualityLevel) {
    this.settings.quality = q;
    this.applyQuality(q);
    this.scheduleSave();
  }

  setOverlap(m: OverlapMode) {
    this.settings.overlap = m;
    this.scheduleSave();
  }

  setTimeOfDay(t: number) {
    this.timeOfDay = t;
    this.settings.timeOfDay = t;
    this.settings.autoCycle = false;
  }

  setAutoCycle(b: boolean) {
    this.settings.autoCycle = b;
  }

  setBrush(radius: number, strength: number) {
    this.settings.brushRadius = radius;
    this.settings.brushStrength = strength;
  }

  setTerrainMode(m: TerrainMode) {
    this.terrainMode = m;
  }

  enterWalk() {
    this.cancelGhost();
    this.rig.enterWalk();
  }

  undo() {
    if (this.city.undo()) this.refreshWorld();
  }

  redo() {
    if (this.city.redo()) this.refreshWorld();
  }

  exportCity() {
    exportJSON(this.collect());
  }

  async importCity(file: File) {
    const data = await importJSON(file);
    this.applySave(data);
    this.scheduleSave();
  }

  async newCity() {
    if (!window.confirm('現在の都市を破棄して新しい地形にしますか?')) return;
    this.city.clear();
    this.scene.remove(this.terrain.mesh);
    this.scene.remove(this.terrain.water);
    this.terrain = new Terrain(this.scene, this.daynight.sunDir);
    this.roadR = new RoadRenderer(this.scene, this.terrain);
    (this.rig as unknown as { terrain: Terrain }).terrain = this.terrain;
    this.refreshWorld();
    this.scheduleSave();
  }

  // ---------- 内部 ----------
  private refreshWorld() {
    this.buildings.rebuild(this.city.placements, this.animating);
    this.roadR.rebuild(this.city.roads);
    this.scheduleSave();
  }

  private collect(): SaveData {
    return {
      version: 1,
      heights: this.terrain.serialize(),
      placements: this.city.placements,
      roads: this.city.roads,
      settings: { ...this.settings, timeOfDay: this.timeOfDay },
    };
  }

  private applySave(data: SaveData) {
    this.terrain.deserialize(data.heights);
    this.city.load(data.placements, data.roads);
    this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    this.timeOfDay = this.settings.timeOfDay;
    this.applyQuality(this.settings.quality);
    // 配置物の高さを地形に合わせ直す
    for (const p of this.city.placements) p.y = this.terrain.getHeight(p.x, p.z);
    this.refreshWorld();
  }

  private async loadAutosave() {
    const data = await loadFromDB();
    if (data && !this.disposed) this.applySave(data);
  }

  private scheduleSave() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      saveToDB(this.collect()).catch(() => undefined);
    }, 1500);
  }

  private applyQuality(q: QualityLevel) {
    const dpr = window.devicePixelRatio;
    if (q === 'high') {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.daynight.sun.shadow.mapSize.set(4096, 4096);
      this.useComposer = true;
      (this.scene.fog as THREE.Fog).far = 8000;
    } else if (q === 'medium') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.daynight.sun.shadow.mapSize.set(2048, 2048);
      this.useComposer = false;
      (this.scene.fog as THREE.Fog).far = 6000;
    } else {
      this.renderer.setPixelRatio(1);
      this.daynight.sun.shadow.mapSize.set(1024, 1024);
      this.useComposer = false;
      (this.scene.fog as THREE.Fog).near = 500;
      (this.scene.fog as THREE.Fog).far = 4200;
    }
    if (this.daynight.sun.shadow.map) {
      this.daynight.sun.shadow.map.dispose();
      (this.daynight.sun.shadow as { map: unknown }).map = null;
    }
    this.terrain.setWaterQuality(q === 'high');
    this.onResize();
  }

  private ensureComposer() {
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.85);
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  private onResize = () => {
    const w = window.innerWidth; const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  };

  // ---------- ゴースト (配置プレビュー) ----------
  private cancelGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      (this.ghost.material as THREE.Material).dispose();
      this.ghost = null;
    }
  }

  private refreshGhost() {
    this.cancelGhost();
    if (this.tool !== 'build') return;
    const variants = this.buildings.getVariants(this.presetId);
    this.ghostVariant = Math.floor(Math.random() * variants.length);
    const vd = variants[this.ghostVariant];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x88ff99, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.8,
    });
    this.ghost = new THREE.Mesh(vd.geometry, mat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  private updateGhost(pt: THREE.Vector3) {
    if (!this.ghost) return;
    this.ghost.visible = true;
    const y = this.terrain.getHeight(pt.x, pt.z);
    this.ghost.position.set(pt.x, y, pt.z);
    this.ghost.rotation.y = this.ghostRot;
    this.ghostPos.copy(pt);
    const vd = this.buildings.getVariants(this.presetId)[this.ghostVariant];
    const overlap = this.city.checkOverlap({
      presetId: this.presetId, variant: this.ghostVariant,
      x: pt.x, z: pt.z, rotY: this.ghostRot, w: vd.w, d: vd.d, h: vd.h,
    });
    const inBounds = Math.abs(pt.x) < HALF - 10 && Math.abs(pt.z) < HALF - 10;
    this.ghostValid = inBounds && (this.settings.overlap === 'allow' || !overlap);
    const mat = this.ghost.material as THREE.MeshStandardMaterial;
    mat.color.set(this.ghostValid ? 0x88ff99 : 0xff5544);
  }

  // ---------- 入力 ----------
  private rayToTerrain(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain.mesh, false);
    return hit.length > 0 ? hit[0].point : null;
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.rig.mode === 'walk') return;
    const pt = this.rayToTerrain(e);
    if (!pt) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (this.tool === 'build') this.updateGhost(pt);
    if (this.tool === 'road' && this.roadStart) {
      const pos = this.roadPreview.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, this.roadStart.x, this.roadStart.y + 1, this.roadStart.z);
      pos.setXYZ(1, pt.x, pt.y + 1, pt.z);
      pos.needsUpdate = true;
    }
    if (this.tool === 'terrain' && this.sculpting) {
      const lower = this.terrainMode === 'lower' !== e.shiftKey;
      this.terrain.sculpt(pt.x, pt.z, this.settings.brushRadius,
        (lower ? -1 : 1) * this.settings.brushStrength * 0.08);
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.rig.mode === 'walk') return;
    const pt = this.rayToTerrain(e);
    if (e.button === 2) { // 右クリック
      if (this.tool === 'build') {
        this.deleteBuildingAt(e);
      } else if (this.tool === 'road') {
        if (this.roadStart) { this.roadStart = null; this.roadMarker.visible = false; this.roadPreview.visible = false; }
        else if (pt) {
          const seg = this.roadR.nearest(this.city.roads, pt.x, pt.z, 14);
          if (seg) { this.city.removeRoad(seg.id); this.roadR.rebuild(this.city.roads); this.scheduleSave(); }
        }
      }
      return;
    }
    if (e.button !== 0 || !pt) return;

    if (this.tool === 'build') {
      if (!this.ghost || !this.ghostValid) return;
      const vd = this.buildings.getVariants(this.presetId)[this.ghostVariant];
      const placed = this.city.addPlacement({
        presetId: this.presetId, variant: this.ghostVariant,
        x: this.ghostPos.x, z: this.ghostPos.z, rotY: this.ghostRot,
        w: vd.w, d: vd.d, h: vd.h, y: this.terrain.getHeight(this.ghostPos.x, this.ghostPos.z),
      });
      this.animating.set(placed.id, this.clock.elapsedTime);
      this.buildings.rebuild(this.city.placements, this.animating);
      this.scheduleSave();
      // 次のバリエーション
      this.refreshGhost();
    } else if (this.tool === 'road') {
      if (!this.roadStart) {
        this.roadStart = pt.clone();
        this.roadMarker.position.copy(pt).add(new THREE.Vector3(0, 0.5, 0));
        this.roadMarker.visible = true;
        this.roadPreview.visible = true;
      } else {
        if (this.roadStart.distanceTo(pt) > 5) {
          this.city.addRoad({ ax: this.roadStart.x, az: this.roadStart.z, bx: pt.x, bz: pt.z });
          this.roadR.rebuild(this.city.roads);
          this.scheduleSave();
        }
        this.roadStart = pt.clone();
        this.roadMarker.position.copy(pt).add(new THREE.Vector3(0, 0.5, 0));
      }
    } else if (this.tool === 'terrain') {
      this.sculpting = true;
      const lower = this.terrainMode === 'lower' !== e.shiftKey;
      this.terrain.sculpt(pt.x, pt.z, this.settings.brushRadius,
        (lower ? -1 : 1) * this.settings.brushStrength * 0.08);
    } else if (this.tool === 'bulldoze') {
      if (!this.deleteBuildingAt(e) && pt) {
        const seg = this.roadR.nearest(this.city.roads, pt.x, pt.z, 14);
        if (seg) { this.city.removeRoad(seg.id); this.roadR.rebuild(this.city.roads); this.scheduleSave(); }
      }
    } else if (this.tool === 'select') {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.buildings.raycast(this.raycaster);
      if (hit) {
        const p = hit.placement;
        this.cb.onSelection({ name: presetById(p.presetId).name, w: p.w, d: p.d, h: p.h });
      } else {
        this.cb.onSelection(null);
      }
    }
  };

  private deleteBuildingAt(e: PointerEvent): boolean {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.buildings.raycast(this.raycaster);
    if (hit) {
      this.city.removePlacement(hit.placement.id);
      this.buildings.rebuild(this.city.placements, this.animating);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  private onPointerUp = () => {
    if (this.sculpting) {
      this.sculpting = false;
      // 地形に追従して道路と建物を更新
      for (const p of this.city.placements) p.y = this.terrain.getHeight(p.x, p.z);
      this.refreshWorld();
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.tool === 'build') {
      e.preventDefault();
      this.ghostRot += (e.deltaY > 0 ? 1 : -1) * (Math.PI / 12);
      if (this.ghost) this.ghost.rotation.y = this.ghostRot;
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); this.redo(); }
    }
  };

  // ---------- メインループ ----------
  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = this.clock.elapsedTime;

    if (this.settings.autoCycle) {
      this.timeOfDay = (this.timeOfDay + dt * (24 / 120)) % 24;
      if (now - this.lastTimeNotify > 0.25) {
        this.lastTimeNotify = now;
        this.cb.onTimeChange(this.timeOfDay);
      }
    }

    this.rig.update(dt);
    const focus = this.rig.mode === 'orbit' ? this.rig.orbit.target : this.camera.position;
    this.daynight.update(this.timeOfDay, focus, this.renderer);

    // フォグ色を昼夜で調整
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHSL(0.58, 0.35, 0.08 + this.daynight.dayFactor * 0.72);

    // 夜間の窓・街灯
    this.buildings.setNight(this.daynight.nightFactor);
    this.roadR.setNight(this.daynight.nightFactor);

    // 水面
    const wu = (this.terrain.water.material as THREE.ShaderMaterial).uniforms;
    if (wu.sunDirection) wu.sunDirection.value.copy(this.daynight.sunDir);
    if (wu.sunColor) wu.sunColor.value.setScalar(0.4 + this.daynight.dayFactor * 0.6);
    this.terrain.update(now);
    this.terrain.flush();

    // ポップインアニメーション
    for (const [id, t0] of this.animating) {
      const t = (now - t0) / 0.28;
      const p = this.city.placements.find((q) => q.id === id);
      if (!p) { this.animating.delete(id); continue; }
      if (t >= 1) {
        this.buildings.updateAnim(p, 1);
        this.animating.delete(id);
      } else {
        this.buildings.updateAnim(p, easeOutBack(Math.max(0.01, t)));
      }
    }

    // 一人称モード変化の通知
    const walk = this.rig.mode === 'walk';
    if (walk !== this.lastWalkMode) {
      this.lastWalkMode = walk;
      this.cb.onWalkChange(walk);
    }

    if (this.useComposer) {
      this.ensureComposer();
      this.composer!.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };

  get placementCount() { return this.city.placements.length; }
  get roadCount() { return this.city.roads.length; }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    saveToDB(this.collect()).catch(() => undefined);
    this.renderer.dispose();
  }
}
