# tokyo-rail-map

首都圏の路線図を、方眼紙を斜め上から見下ろしたような 3D 風の地図で表示するアプリ。

- **経路**: 2 駅間の乗換経路を地図上で強調表示（距離ベースの目安）
- **終電**: 帰る駅を選ぶと、各駅から「何時までに出れば帰れるか」を地図に色と時刻で表示。
  今いる駅を選ぶ（または地図でクリックする）と、その駅からの終電ルートを発着時刻つきで表示。平日 / 土休日を切り替えられる

- React + TypeScript + Vite + Tailwind
- 描画は deck.gl（ベースマップなし）。地上の路線は方眼紙の地面の上に、地下の路線は深さに応じて地面の下に描き、
  地下の駅から地面まで縦線を引く。深さはズームによらず見やすいように強調している
- 経路は Dijkstra（目安の所要時間 = 距離 + 停車 + 乗換のペナルティ）
- 終電は時刻表を使った逆向きの Connection Scan（`src/domain/lastTrain.ts`）。21 時以降に発車する区間だけを使う
- サーバーなし。静的ホスティングで動く

## コマンド

```sh
npm install
npm run dev        # 開発サーバー
npm test           # テスト（Vitest）
npm run typecheck  # 型チェック
npm run build      # dist/ にビルド
NODE_USE_ENV_PROXY=1 npm run data       # 路線データを取り直して src/data/network.json を作り直す
NODE_USE_ENV_PROXY=1 npm run timetable  # 時刻表から public/timetable/{weekday,holiday}.json を作り直す（data の後に）
```

## データの出典

路線・駅・乗換のデータは [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d)（MIT License, © Akihiko Kusanagi）の
`data/railways.json`・`stations.json`・`station-groups.json`・`train-timetables/*.json` を加工して使っています。
元データは [公共交通オープンデータセンター](https://www.odpt.org) によるものです。
対象路線と表示範囲は `scripts/build-data.ts` で絞り込んでいます。

地下の深さは実測データではなく目安です。元データには「地下かどうか」しか無いため、路線ごとの代表的な深さと、
よく知られた深い駅（大江戸線 六本木 など）の値を `src/domain/depth.ts` に手で持っています。

時刻表は元データの時点のものです。ダイヤ改正や臨時ダイヤ、遅延は反映されません。実際の終電は各社の案内で確認してください。
