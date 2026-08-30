// 共有型定義・定数・建物プリセット

export type QualityLevel = 'high' | 'medium' | 'low';
export type ToolId = 'select' | 'build' | 'road' | 'terrain' | 'bulldoze';
export type TerrainMode = 'raise' | 'lower';
export type OverlapMode = 'prevent' | 'allow';

export const MAP_SIZE = 4096; // マップ一辺 (m)
export const TERRAIN_CELLS = 256; // 高度マップ分割数
export const TERRAIN_VERTS = TERRAIN_CELLS + 1;
export const WATER_LEVEL = 0; // 水位 (m)
export const HALF = MAP_SIZE / 2;

export interface BuildingPreset {
  id: string;
  name: string;
  category: string;
  minW: number;
  maxW: number;
  minD: number;
  maxD: number;
  minH: number;
  maxH: number;
  roof: 'flat' | 'gable' | 'pyramid' | 'skylight' | 'none';
  palette: string[]; // 壁色
  roofPalette: string[]; // 屋根色
  windowColWidth: number; // 窓グリッド目安幅 (m)
  windowRowHeight: number; // 窓グリッド目安高 (m)
  litRatio: number; // 夜に点灯する窓の割合
  glassy?: boolean; // ガラス張り系
  vegetation?: boolean;
  park?: boolean;
  variants: number; // バリエーション数
}

export const CATEGORIES = ['住宅', '商業', 'オフィス', '工業', '自然'] as const;

export const PRESETS: BuildingPreset[] = [
  {
    id: 'house', name: '戸建て住宅', category: '住宅',
    minW: 8, maxW: 13, minD: 8, maxD: 12, minH: 4.5, maxH: 7.5,
    roof: 'gable',
    palette: ['#e8e0d0', '#d8c8b0', '#c8d0d8', '#e0c8b8', '#d0d8c8', '#e8e8e8'],
    roofPalette: ['#8a4a3a', '#5a5a62', '#4a5a6a', '#7a5a4a', '#666666'],
    windowColWidth: 3, windowRowHeight: 2.8, litRatio: 0.35, variants: 8,
  },
  {
    id: 'mansion_low', name: '低層マンション', category: '住宅',
    minW: 14, maxW: 22, minD: 12, maxD: 18, minH: 10, maxH: 20,
    roof: 'flat',
    palette: ['#ddd5c5', '#c5cdd5', '#d5c5b5', '#cdd5c5'],
    roofPalette: ['#777777', '#666a70', '#8a8578'],
    windowColWidth: 3.2, windowRowHeight: 3, litRatio: 0.3, variants: 6,
  },
  {
    id: 'mansion_high', name: '高層マンション', category: '住宅',
    minW: 16, maxW: 26, minD: 14, maxD: 22, minH: 32, maxH: 65,
    roof: 'flat',
    palette: ['#d8d8d2', '#c2ccd6', '#d2c8bc', '#ccd2cc'],
    roofPalette: ['#6a6e74', '#5e6266'],
    windowColWidth: 3, windowRowHeight: 3, litRatio: 0.3, variants: 6,
  },
  {
    id: 'shop', name: '小型店舗', category: '商業',
    minW: 8, maxW: 16, minD: 8, maxD: 14, minH: 5, maxH: 9,
    roof: 'flat',
    palette: ['#e0d8c8', '#d0c0a8', '#c8b8a8', '#dcc8c0', '#c0ccd8'],
    roofPalette: ['#555a60', '#6a5a50', '#4a5258'],
    windowColWidth: 2.6, windowRowHeight: 3.2, litRatio: 0.5, variants: 8,
  },
  {
    id: 'commercial', name: '商業ビル', category: '商業',
    minW: 18, maxW: 32, minD: 18, maxD: 30, minH: 20, maxH: 48,
    roof: 'flat',
    palette: ['#c8ccd2', '#b8c0ca', '#d0c8be', '#bcc4c8'],
    roofPalette: ['#5a5e64', '#4e5256'],
    windowColWidth: 3, windowRowHeight: 3.2, litRatio: 0.45, variants: 6,
  },
  {
    id: 'office_mid', name: '中層オフィス', category: 'オフィス',
    minW: 20, maxW: 32, minD: 20, maxD: 30, minH: 25, maxH: 55,
    roof: 'flat',
    palette: ['#b8c2cc', '#a8b4c0', '#c0c8d0', '#9fa8b4'],
    roofPalette: ['#4a4e54', '#565a60'],
    windowColWidth: 3, windowRowHeight: 3.4, litRatio: 0.28, variants: 6,
  },
  {
    id: 'office_high', name: '高層ビル', category: 'オフィス',
    minW: 26, maxW: 42, minD: 26, maxD: 40, minH: 60, maxH: 130,
    roof: 'flat',
    palette: ['#8ea2b4', '#94a8bc', '#8898aa', '#a0aec0'],
    roofPalette: ['#3e4248', '#464a50'],
    windowColWidth: 2.8, windowRowHeight: 3.4, litRatio: 0.25, glassy: true, variants: 6,
  },
  {
    id: 'tower', name: '超高層タワー', category: 'オフィス',
    minW: 36, maxW: 52, minD: 36, maxD: 50, minH: 140, maxH: 240,
    roof: 'flat',
    palette: ['#7e94a8', '#8a9eb2', '#76889c'],
    roofPalette: ['#383c42', '#40444a'],
    windowColWidth: 2.6, windowRowHeight: 3.4, litRatio: 0.25, glassy: true, variants: 5,
  },
  {
    id: 'factory', name: '工場', category: '工業',
    minW: 30, maxW: 60, minD: 24, maxD: 48, minH: 10, maxH: 16,
    roof: 'skylight',
    palette: ['#b0b4b8', '#a0a8ac', '#b8b0a4', '#98a0a8'],
    roofPalette: ['#6a7076', '#5e6468'],
    windowColWidth: 4, windowRowHeight: 3.5, litRatio: 0.15, variants: 5,
  },
  {
    id: 'warehouse', name: '倉庫', category: '工業',
    minW: 24, maxW: 44, minD: 20, maxD: 40, minH: 8, maxH: 13,
    roof: 'flat',
    palette: ['#a8acb0', '#98a0a4', '#b0a89c', '#8e989e'],
    roofPalette: ['#5e646a', '#54585e', '#6a6e72'],
    windowColWidth: 5, windowRowHeight: 4, litRatio: 0.08, variants: 5,
  },
  {
    id: 'tree', name: '樹木', category: '自然',
    minW: 2, maxW: 4, minD: 2, maxD: 4, minH: 5, maxH: 9,
    roof: 'none', palette: [], roofPalette: [],
    windowColWidth: 0, windowRowHeight: 0, litRatio: 0, vegetation: true, variants: 6,
  },
  {
    id: 'park', name: '公園', category: '自然',
    minW: 22, maxW: 40, minD: 22, maxD: 40, minH: 0.5, maxH: 0.5,
    roof: 'none', palette: [], roofPalette: [],
    windowColWidth: 0, windowRowHeight: 0, litRatio: 0, park: true, variants: 4,
  },
];

export const presetById = (id: string): BuildingPreset =>
  PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export interface Placement {
  id: number;
  presetId: string;
  variant: number;
  x: number;
  z: number;
  rotY: number;
  w: number;
  d: number;
  h: number;
  y: number; // 地面高
}

export interface RoadSeg {
  id: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface GameSettings {
  quality: QualityLevel;
  overlap: OverlapMode;
  timeOfDay: number; // 0-24
  autoCycle: boolean;
  brushRadius: number;
  brushStrength: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  overlap: 'prevent',
  timeOfDay: 10,
  autoCycle: false,
  brushRadius: 40,
  brushStrength: 3,
};

export interface SaveData {
  version: 1;
  heights: string; // base64 Float32Array
  placements: Placement[];
  roads: RoadSeg[];
  settings: GameSettings;
}
