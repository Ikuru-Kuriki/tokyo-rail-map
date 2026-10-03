# tokyo-rail-map

首都圏の路線図（3D 風）と乗換経路の検索アプリ。React + TypeScript + Vite + Tailwind + deck.gl、静的ホスティング。

## コマンド

- `npm run dev` / `npm test` / `npm run typecheck` / `npm run build`
- `NODE_USE_ENV_PROXY=1 npm run data` で `src/data/network.json` を再生成（生成物もコミットする）

変更後は `npm run typecheck && npm test` を通すこと。

## 構成と規約

- `src/domain/` は UI に依存しない純粋関数（経路探索・検索）。変更したらテストを書く
- `src/map/` は描画（deck.gl のレイヤー、HTML のラベル配置）。見た目の定数は `src/map/style.ts`
- 駅は「路線ごとの駅（Station）」と「同じ名前の駅の集まり（Place）」を分けて扱う。検索・表示は Place、経路探索は Station
- 乗換は `network.transfers`（同じ構内 / 徒歩連絡）から作る
- UI の文言は日本語
