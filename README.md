# kimi_CitySimulation — Diorama City (仮称)

制約なしで自由に都市のジオラマを作れる3Dシティビルダー。PCのWebブラウザで動作します。

## コンセプト

SimCity や Cities: Skylines のような都市開発シミュレーションから、資金・需要・インフラといった制約要素を取り除き、住宅・ビル・工場・各種施設を完全に自由に配置できる「都市ジオラマ作成ゲーム」。作ること自体と、できあがった街を眺めることが楽しさの中心。

詳細な仕様は [docs/SPEC.md](docs/SPEC.md) を参照。

## 機能 (MVP)

- 建物の完全自由配置(位置・角度、ホイールで回転)/ 重なり防止⇔許可の切替
- プリセット+自動バリエーション: 住宅・商業・オフィス・工業・自然(12種、色・高さ・窓が自動で変化)
- 道路ツール(直線区間+交差点、街路灯の自動配置)
- 地形編集(盛り上げ/掘削ブラシ、掘ると川・池になる水位方式)
- 昼夜サイクル(夜は窓明かり・街灯が点灯)、写実的な空・水・影
- 俯瞰カメラ ⇔ 一人称散歩モード(WASD)
- 品質プリセット(高品質/標準/軽量)
- 自動保存(IndexedDB + localStorageミラー)と JSON エクスポート/インポート

## 技術スタック

- Three.js + TypeScript (プロシージャル建物生成、InstancedMesh による大量描画)
- React + Tailwind CSS (UI)
- Vite

## 開発

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # dist/ に出力
```

## ディレクトリ構成

```
src/game/
  types.ts      プリセット・型定義
  terrain.ts    高度マップ地形・掘削・水面
  sky.ts        昼夜サイクル・空・ライティング
  buildings.ts  プロシージャル建物生成・インスタンシング
  roads.ts      道路リボン・街灯
  city.ts       配置状態・重なり判定・Undo/Redo
  controls.ts   俯瞰/一人称カメラ
  save.ts       保存・読み込み
  Game.ts       全体の統括(レンダリングループ・入力)
src/App.tsx     UIオーバーレイ
```
