# Lift Board v2.0.0

チーム共有の筋トレ記録アプリ。設計の詳細は「Lift Board 設計書」を参照。

## ファイル
- `index.html` / `css/app.css` — 画面の骨組みとデザイン
- `js/app.js` — 5画面の描画と操作
- `js/calc.js` — 1RM・ボリューム・ランキングなどの計算（純粋関数）
- `js/body.js` — 人体図SVG
- `js/catalog.js` — 筋群・種目・バージョン（種目追加はここ）
- `js/coach.js` — 指南（次回重量・メニュー提案・気づき）、バッジ、筋力レベル
- `js/programs.js` — 定番メニュー8種（追加はここ）
- `js/store.js` — 保存先の切り替え（Claude共有DB / ブラウザ保存）
- `js/store-supabase.js` — 独立アプリ版の保存先（Supabase）
- `js/config.js` — 独立アプリ版の接続設定（SETUP.md 参照）
- `sw.js` / `manifest.webmanifest` / `icons/` — ホーム画面に追加・プッシュ通知・オフライン
- `supabase/schema.sql` — DB定義と権限（RLS）、`supabase/functions/notify/` — 通知送信、`supabase/test/` — 権限テスト
- `tools/vapid.html` — 通知用の鍵の作成
- `js/demo.js` — ローカルモード用デモデータ
- `tests/` — 単体テスト（計算・コーチ）

## 手元で動かす
```
python3 -m http.server 8000   # このフォルダで実行
# → http://localhost:8000 を開く（ローカルモードで動作。マイデータ→デモデータで画面確認）
node --test tests/*.test.mjs   # テスト
```
ES モジュールを使っているため、index.html を直接ダブルクリックでは動かない（ローカルサーバー経由で開く）。

## 独立アプリ版
SETUP.md の手順で Supabase とつなぐと、ログイン不要（チームコード参加）・閉じていても届く通知になる。

## 更新の流れ
1. コードを編集
2. `js/catalog.js` の `APP_VERSION` と `CHANGELOG` を更新
3. テストを実行
4. 同じアーティファクトに再公開（URLとチームのデータはそのまま）
