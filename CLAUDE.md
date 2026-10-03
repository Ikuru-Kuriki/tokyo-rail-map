# tokyo-rail-map

首都圏の路線図（3D 風）と乗換経路の検索アプリ。React + TypeScript + Vite + Tailwind + deck.gl、静的ホスティング。

## コマンド

- `npm run dev` / `npm test` / `npm run typecheck` / `npm run build`
- `NODE_USE_ENV_PROXY=1 npm run data` で `src/data/network.json` を再生成（生成物もコミットする）
- `NODE_USE_ENV_PROXY=1 npm run timetable` で `public/timetable/*.json` を再生成（network.json の後に。元データは `.cache/` に保存）

変更後は `npm run typecheck && npm test` を通すこと。

## 構成と規約

- `src/domain/` は UI に依存しない純粋関数（経路探索・検索）。変更したらテストを書く
- `src/map/` は描画（deck.gl のレイヤー、HTML のラベル配置）。見た目の定数は `src/map/style.ts`
- 駅は「路線ごとの駅（Station）」と「同じ名前の駅の集まり（Place）」を分けて扱う。検索・表示は Place、経路探索は Station
- 乗換は `network.transfers`（同じ構内 / 徒歩連絡）から作る
- 終電は `src/domain/lastTrain.ts`（逆向き Connection Scan）。時刻は「営業日の分」（0:30 = 1470）で扱い、表示は `formatMinutes`
- 時刻表は終電タブを開いたときに `src/data/timetable.ts` で遅延読み込みする
- 終電マップの色は `src/domain/lastTrainColors.ts`（1 色の連続スケール。色を増やすときは同じ青の段階から）
- UI の文言は日本語
