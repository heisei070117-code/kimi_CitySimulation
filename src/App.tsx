import { useEffect, useRef, useState } from 'react';
import {
  MousePointer2, Building2, Route, Mountain, Trash2,
  PersonStanding, Undo2, Redo2, Download, Upload, FilePlus2,
  Sun, Moon,
} from 'lucide-react';
import { Game, type SelectionInfo } from '@/game/Game';
import { CATEGORIES, PRESETS, type QualityLevel, type ToolId } from '@/game/types';

const TOOLS: { id: ToolId; name: string; icon: typeof Building2 }[] = [
  { id: 'select', name: '選択', icon: MousePointer2 },
  { id: 'build', name: '建物', icon: Building2 },
  { id: 'road', name: '道路', icon: Route },
  { id: 'terrain', name: '地形', icon: Mountain },
  { id: 'bulldoze', name: '削除', icon: Trash2 },
];

const HINTS: Record<ToolId, string> = {
  select: 'クリックで建物の情報を表示',
  build: 'クリックで配置 / ホイールで回転 / 右クリックで削除 / Ctrl+ホイールでズーム',
  road: 'クリックで区間を追加(連続可) / 右クリックで終了・削除',
  terrain: 'ドラッグで編集 / Shift押下中は逆方向',
  bulldoze: 'クリックで建物・道路を削除',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<ToolId>('build');
  const [category, setCategory] = useState<string>('住宅');
  const [presetId, setPresetId] = useState('house');
  const [quality, setQuality] = useState<QualityLevel>('medium');
  const [overlapFree, setOverlapFree] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState(10);
  const [autoCycle, setAutoCycle] = useState(false);
  const [brushRadius, setBrushRadius] = useState(40);
  const [brushStrength, setBrushStrength] = useState(3);
  const [terrainMode, setTerrainMode] = useState<'raise' | 'lower'>('raise');
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [isWalk, setIsWalk] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const game = new Game(canvasRef.current!, {
      onSelection: setSelection,
      onTimeChange: (t) => setTimeOfDay(Math.round(t * 10) / 10),
      onWalkChange: setIsWalk,
    });
    gameRef.current = game;
    (window as unknown as { __game: Game }).__game = game;
    setReady(true);
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  const g = () => gameRef.current!;

  const timeLabel = () => {
    const h = Math.floor(timeOfDay);
    const m = Math.floor((timeOfDay - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-sans">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {ready && !isWalk && (
        <>
          {/* 左: ツールバー */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 rounded-xl bg-black/60 p-1.5 backdrop-blur">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                title={t.name}
                onClick={() => { setTool(t.id); g().setTool(t.id); }}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-[10px] transition-colors ${
                  tool === t.id ? 'bg-sky-500 text-white' : 'text-zinc-300 hover:bg-white/10'
                }`}
              >
                <t.icon size={20} />
                {t.name}
              </button>
            ))}
          </div>

          {/* 右上: 環境設定 */}
          <div className="absolute right-3 top-3 w-60 rounded-xl bg-black/60 p-3 text-xs text-zinc-200 backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-sm">Diorama City</span>
              <button
                onClick={() => g().enterWalk()}
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 hover:bg-emerald-500"
              >
                <PersonStanding size={14} /> 散歩
              </button>
            </div>

            <label className="mb-1 block text-zinc-400">品質</label>
            <select
              value={quality}
              onChange={(e) => { setQuality(e.target.value as QualityLevel); g().setQuality(e.target.value as QualityLevel); }}
              className="mb-2 w-full rounded-md bg-zinc-800 px-2 py-1"
            >
              <option value="high">高品質(影・ブルーム)</option>
              <option value="medium">標準</option>
              <option value="low">軽量</option>
            </select>

            <label className="mb-1 flex items-center justify-between text-zinc-400">
              時刻 <span className="text-zinc-200">{timeLabel()}</span>
            </label>
            <div className="mb-1 flex items-center gap-2">
              <Sun size={13} className="shrink-0 text-amber-300" />
              <input
                type="range" min={0} max={24} step={0.1} value={timeOfDay}
                onChange={(e) => { const t = Number(e.target.value); setTimeOfDay(t); g().setTimeOfDay(t); }}
                className="w-full accent-sky-400"
              />
              <Moon size={13} className="shrink-0 text-indigo-300" />
            </div>
            <label className="mb-2 flex items-center gap-1.5 text-zinc-400">
              <input
                type="checkbox" checked={autoCycle}
                onChange={(e) => { setAutoCycle(e.target.checked); g().setAutoCycle(e.target.checked); }}
                className="accent-sky-400"
              />
              昼夜を自動で進める
            </label>

            <label className="mb-3 flex items-center gap-1.5 text-zinc-400">
              <input
                type="checkbox" checked={overlapFree}
                onChange={(e) => {
                  setOverlapFree(e.target.checked);
                  g().setOverlap(e.target.checked ? 'allow' : 'prevent');
                }}
                className="accent-sky-400"
              />
              建物の重なりを許可
            </label>

            <div className="flex gap-1.5">
              <button title="元に戻す (Ctrl+Z)" onClick={() => g().undo()} className="rounded-md bg-zinc-700 p-1.5 hover:bg-zinc-600"><Undo2 size={15} /></button>
              <button title="やり直し (Ctrl+Y)" onClick={() => g().redo()} className="rounded-md bg-zinc-700 p-1.5 hover:bg-zinc-600"><Redo2 size={15} /></button>
              <div className="flex-1" />
              <button title="JSONで保存" onClick={() => g().exportCity()} className="rounded-md bg-zinc-700 p-1.5 hover:bg-zinc-600"><Download size={15} /></button>
              <button title="JSONを読み込み" onClick={() => importRef.current?.click()} className="rounded-md bg-zinc-700 p-1.5 hover:bg-zinc-600"><Upload size={15} /></button>
              <button title="新しい地形" onClick={() => g().newCity()} className="rounded-md bg-zinc-700 p-1.5 hover:bg-zinc-600"><FilePlus2 size={15} /></button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              都市は自動でブラウザに保存されます
            </p>
          </div>

          {/* 下部: 建物パレット */}
          {tool === 'build' && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-xl bg-black/60 p-2 backdrop-blur">
              <div className="mb-1.5 flex gap-1 px-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCategory(c);
                      const first = PRESETS.find((p) => p.category === c)!;
                      setPresetId(first.id);
                      g().setPreset(first.id);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs ${category === c ? 'bg-sky-500 text-white' : 'text-zinc-300 hover:bg-white/10'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 px-1">
                {PRESETS.filter((p) => p.category === category).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setPresetId(p.id); g().setPreset(p.id); }}
                    className={`rounded-md px-3 py-1.5 text-xs whitespace-nowrap ${presetId === p.id ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 下部: 地形ブラシ設定 */}
          {tool === 'terrain' && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-80 rounded-xl bg-black/60 p-3 text-xs text-zinc-200 backdrop-blur">
              <div className="mb-2 flex gap-1">
                <button
                  onClick={() => { setTerrainMode('raise'); g().setTerrainMode('raise'); }}
                  className={`flex-1 rounded-md py-1 ${terrainMode === 'raise' ? 'bg-emerald-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                >盛り上げる</button>
                <button
                  onClick={() => { setTerrainMode('lower'); g().setTerrainMode('lower'); }}
                  className={`flex-1 rounded-md py-1 ${terrainMode === 'lower' ? 'bg-sky-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                >掘る(水場・川)</button>
              </div>
              <label className="text-zinc-400">ブラシ半径: {brushRadius}m</label>
              <input type="range" min={10} max={160} value={brushRadius}
                onChange={(e) => { const v = Number(e.target.value); setBrushRadius(v); g().setBrush(v, brushStrength); }}
                className="mb-1 w-full accent-sky-400" />
              <label className="text-zinc-400">強さ: {brushStrength}</label>
              <input type="range" min={1} max={10} value={brushStrength}
                onChange={(e) => { const v = Number(e.target.value); setBrushStrength(v); g().setBrush(brushRadius, v); }}
                className="w-full accent-sky-400" />
            </div>
          )}

          {/* ヒント */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1 text-[11px] text-zinc-300 backdrop-blur">
            {HINTS[tool]}
          </div>

          {/* 選択情報 */}
          {selection && tool === 'select' && (
            <div className="absolute bottom-3 right-3 rounded-xl bg-black/60 p-3 text-xs text-zinc-200 backdrop-blur">
              <div className="font-semibold">{selection.name}</div>
              <div className="text-zinc-400">
                幅 {selection.w.toFixed(0)}m × 奥行 {selection.d.toFixed(0)}m × 高さ {selection.h.toFixed(0)}m
              </div>
            </div>
          )}
        </>
      )}

      {/* 一人称モードのオーバーレイ */}
      {isWalk && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <div className="rounded-full bg-black/60 px-5 py-2 text-xs text-zinc-200 backdrop-blur">
            WASD で移動 / Shift で走る / ESC で俯瞰に戻る
          </div>
        </div>
      )}

      <input
        ref={importRef} type="file" accept=".json" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) g().importCity(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
