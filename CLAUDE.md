# tokyo-rail-map

首都圏の路線図（3D 風）と乗換経路の検索アプリ。React + TypeScript + Vite + Tailwind + deck.gl、静的ホスティング。

## コマンド

- `npm run dev` / `npm test` / `npm run typecheck` / `npm run build`
- `NODE_USE_ENV_PROXY=1 npm run data` で `src/data/network.json` を再生成（生成物もコミットする）
- `NODE_USE_ENV_PROXY=1 npm run data:kansai` で関西の `src/data/regions/kansai/network.json` を再生成（国土数値情報 N02。元データは `.cache/n02/`）
- `NODE_USE_ENV_PROXY=1 npm run ground` で乗換駅のまわりの建物・道路 `public/ground/{place}.json` を再生成（国土地理院ベクトルタイル。タイルは `.cache/gsi/`）
- `NODE_USE_ENV_PROXY=1 npm run timetable` で `public/timetable/*.json` を再生成（network.json の後に。元データは `.cache/` に保存）

変更後は `npm run typecheck && npm test` を通すこと。

## 構成と規約

- `src/domain/` は UI に依存しない純粋関数（経路探索・検索）。変更したらテストを書く
- `src/map/` は描画（deck.gl のレイヤー、HTML のラベル配置）。見た目の定数は `src/map/style.ts`
- 地下の深さ（m、目安）は `src/domain/depth.ts` の表から `npm run data` で `Station.depth` に入れる。
  描画の高さは `elevationOf(depth, depthExaggeration(zoom))`。レイヤーの順番と深度テストの設定は `layers.ts` 冒頭のコメント参照
- 駅は「路線ごとの駅（Station）」と「同じ名前の駅の集まり（Place）」を分けて扱う。検索・表示は Place、経路探索は Station
- 乗換は `network.transfers`（同じ構内 / 徒歩連絡）から作る
- 終電は `src/domain/lastTrain.ts`（逆向き Connection Scan）。時刻は「営業日の分」（0:30 = 1470）で扱い、表示は `formatMinutes`
- 最近使った駅は `src/data/history.ts`（localStorage。読み書きは必ず try/catch。使えなくても動くこと）
- 路線の強調は複数可（`focusRailways: string[]`）。カメラは `src/map/camera.ts` の `sideViewFor`（駅の広がりの主成分を左右に）
- 駅ナンバリングは `npm run data` で `Station.code` に入る。補正の表は `src/domain/numbering.ts`（規則の駅名が無いと生成が止まる）
- シミュレーションは `src/domain/simulate.ts`（前向き Connection Scan と、時刻 t の位置の補間）。
  時刻表は `public/timetable/day/{weekday,holiday}/{HH}.json`（1 時間ごと）と `index.json`。必要な時間だけ `src/data/dayTimetable.ts` で読み込む
- 時刻表は終電タブを開いたときに `src/data/timetable.ts` で遅延読み込みする
- 終電マップの色は `src/domain/lastTrainColors.ts`（1 色の連続スケール。色を増やすときは同じ青の段階から）
- 「乗換を見る」と、地図を寄せて傾けたとき（ズーム 15.5 以上）の近くの乗換駅の立体は `src/map/transferLayers.ts`（建物・道路は半透明で深度を書かない。ホームと歩く線は経路より手前）。データの形と高さ・幅の目安は `src/domain/ground.ts`
- UI の文言は日本語
- 別の地域（関西版など）を足すときは `.claude/skills/add-region/SKILL.md` に従う
