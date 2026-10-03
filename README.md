# tokyo-rail-map

首都圏の路線図を、方眼紙を斜め上から見下ろしたような 3D 風の地図で表示し、2 駅間の乗換経路を地図上で強調表示するアプリ。

- React + TypeScript + Vite + Tailwind
- 描画は deck.gl（ベースマップなし。路線を少し浮かせて地面に影を落とす）
- 経路は Dijkstra（目安の所要時間 = 距離 + 停車 + 乗換のペナルティ）。時刻表は使わない
- サーバーなし。静的ホスティングで動く

## コマンド

```sh
npm install
npm run dev        # 開発サーバー
npm test           # テスト（Vitest）
npm run typecheck  # 型チェック
npm run build      # dist/ にビルド
NODE_USE_ENV_PROXY=1 npm run data   # 路線データを取り直して src/data/network.json を作り直す
```

## データの出典

路線・駅・乗換のデータは [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d)（MIT License, © Akihiko Kusanagi）の
`data/railways.json`・`stations.json`・`station-groups.json` を加工して使っています。
元データは [公共交通オープンデータセンター](https://www.odpt.org) によるものです。
対象路線と表示範囲は `scripts/build-data.ts` で絞り込んでいます。
