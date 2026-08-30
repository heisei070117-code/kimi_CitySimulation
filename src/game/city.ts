import type { Placement, RoadSeg } from './types';

const CELL = 60; // 空間ハッシュのセルサイズ (m)

// 2D回転矩形の重なり判定 (SAT)
function obbOverlap(a: Placement, b: Placement): boolean {
  const test = (p: Placement, q: Placement) => {
    const cos = Math.cos(p.rotY); const sin = Math.sin(p.rotY);
    const axes = [[cos, sin], [-sin, cos]];
    const dx = q.x - p.x; const dz = q.z - p.z;
    const qCos = Math.cos(q.rotY); const qSin = Math.sin(q.rotY);
    for (const [ax, az] of axes) {
      const ra = p.w / 2 * Math.abs(ax * cos + az * sin) + p.d / 2 * Math.abs(-ax * sin + az * cos);
      const rb = q.w / 2 * Math.abs(ax * qCos + az * qSin) + q.d / 2 * Math.abs(-ax * qSin + az * qCos);
      if (Math.abs(dx * ax + dz * az) > ra + rb - 0.5) return false;
    }
    return true;
  };
  return test(a, b) && test(b, a);
}

interface UndoAction {
  kind: 'building' | 'road';
  op: 'add' | 'remove';
  data: Placement | RoadSeg;
}

export class City {
  placements: Placement[] = [];
  roads: RoadSeg[] = [];
  private grid = new Map<string, Placement[]>();
  private nextId = 1;
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];

  private gridAdd(p: Placement) {
    const r = Math.max(p.w, p.d) / 2;
    const x0 = Math.floor((p.x - r) / CELL); const x1 = Math.floor((p.x + r) / CELL);
    const z0 = Math.floor((p.z - r) / CELL); const z1 = Math.floor((p.z + r) / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = `${gx},${gz}`;
        const arr = this.grid.get(k) ?? [];
        arr.push(p);
        this.grid.set(k, arr);
      }
    }
  }

  private gridRemove(p: Placement) {
    const r = Math.max(p.w, p.d) / 2;
    const x0 = Math.floor((p.x - r) / CELL); const x1 = Math.floor((p.x + r) / CELL);
    const z0 = Math.floor((p.z - r) / CELL); const z1 = Math.floor((p.z + r) / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = `${gx},${gz}`;
        const arr = this.grid.get(k);
        if (arr) {
          const i = arr.indexOf(p);
          if (i >= 0) arr.splice(i, 1);
        }
      }
    }
  }

  // 指定位置のOBBが既存と重なるか
  checkOverlap(p: Omit<Placement, 'id' | 'y'>): boolean {
    const probe = { ...p, id: -1, y: 0 };
    const seen = new Set<Placement>();
    const r = Math.max(p.w, p.d) / 2;
    const x0 = Math.floor((p.x - r - CELL) / CELL); const x1 = Math.floor((p.x + r + CELL) / CELL);
    const z0 = Math.floor((p.z - r - CELL) / CELL); const z1 = Math.floor((p.z + r + CELL) / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const arr = this.grid.get(`${gx},${gz}`);
        if (!arr) continue;
        for (const q of arr) {
          if (seen.has(q)) continue;
          seen.add(q);
          if (obbOverlap(probe, q)) return true;
        }
      }
    }
    return false;
  }

  addPlacement(p: Omit<Placement, 'id'>, recordUndo = true): Placement {
    const placed: Placement = { ...p, id: this.nextId++ };
    this.placements.push(placed);
    this.gridAdd(placed);
    if (recordUndo) {
      this.undoStack.push({ kind: 'building', op: 'add', data: placed });
      this.redoStack = [];
    }
    return placed;
  }

  removePlacement(id: number, recordUndo = true): Placement | null {
    const i = this.placements.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const p = this.placements[i];
    this.placements.splice(i, 1);
    this.gridRemove(p);
    if (recordUndo) {
      this.undoStack.push({ kind: 'building', op: 'remove', data: p });
      this.redoStack = [];
    }
    return p;
  }

  addRoad(seg: Omit<RoadSeg, 'id'>, recordUndo = true): RoadSeg {
    const s: RoadSeg = { ...seg, id: this.nextId++ };
    this.roads.push(s);
    if (recordUndo) {
      this.undoStack.push({ kind: 'road', op: 'add', data: s });
      this.redoStack = [];
    }
    return s;
  }

  removeRoad(id: number, recordUndo = true): RoadSeg | null {
    const i = this.roads.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const s = this.roads[i];
    this.roads.splice(i, 1);
    if (recordUndo) {
      this.undoStack.push({ kind: 'road', op: 'remove', data: s });
      this.redoStack = [];
    }
    return s;
  }

  undo(): boolean {
    const a = this.undoStack.pop();
    if (!a) return false;
    this.redoStack.push(a);
    if (a.op === 'add') {
      if (a.kind === 'building') this.removePlacement((a.data as Placement).id, false);
      else this.removeRoad(a.data.id, false);
    } else {
      if (a.kind === 'building') {
        const p = a.data as Placement;
        this.placements.push(p); this.gridAdd(p);
        this.nextId = Math.max(this.nextId, p.id + 1);
      } else {
        this.roads.push(a.data as RoadSeg);
        this.nextId = Math.max(this.nextId, a.data.id + 1);
      }
    }
    return true;
  }

  redo(): boolean {
    const a = this.redoStack.pop();
    if (!a) return false;
    this.undoStack.push(a);
    if (a.op === 'add') {
      if (a.kind === 'building') {
        const p = a.data as Placement;
        this.placements.push(p); this.gridAdd(p);
        this.nextId = Math.max(this.nextId, p.id + 1);
      } else {
        this.roads.push(a.data as RoadSeg);
        this.nextId = Math.max(this.nextId, a.data.id + 1);
      }
    } else {
      if (a.kind === 'building') this.removePlacement((a.data as Placement).id, false);
      else this.removeRoad(a.data.id, false);
    }
    return true;
  }

  // 指定座標周辺の建物 (一人称モードの衝突判定用)
  near(x: number, z: number, radius: number): Placement[] {
    const out: Placement[] = [];
    const seen = new Set<Placement>();
    const x0 = Math.floor((x - radius) / CELL); const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL); const z1 = Math.floor((z + radius) / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const arr = this.grid.get(`${gx},${gz}`);
        if (!arr) continue;
        for (const p of arr) {
          if (!seen.has(p)) { seen.add(p); out.push(p); }
        }
      }
    }
    return out;
  }

  clear() {
    this.placements = [];
    this.roads = [];
    this.grid.clear();
    this.undoStack = [];
    this.redoStack = [];
  }

  load(placements: Placement[], roads: RoadSeg[]) {
    this.clear();
    for (const p of placements) {
      this.placements.push(p);
      this.gridAdd(p);
      this.nextId = Math.max(this.nextId, p.id + 1);
    }
    for (const r of roads) {
      this.roads.push(r);
      this.nextId = Math.max(this.nextId, r.id);
    }
  }
}
