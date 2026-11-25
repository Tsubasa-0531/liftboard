# Lift Board 独立アプリ版のセットアップ（約20分・無料）

これを済ませると、チームの人は **claude.ai のアカウントなしで**「リンクを開く → 名前を入れる」だけで参加でき、
**アプリを閉じていても**「○○がトレーニングを開始しました」の通知が届くようになる。

必要なもの：パソコン、GitHub アカウント（なければ作る）、メールアドレス。コマンド操作は不要。

---

## 1. Supabase（データベース）を作る ― 5分

1. https://supabase.com で無料アカウントを作り、**New project**。
   - Name：`liftboard`（何でもよい）／ Region：**Northeast Asia (Tokyo)**／ Database Password：自動生成でよい（使わない）
2. 左メニュー **SQL Editor** → **New query** → `supabase/schema.sql` の中身を全部貼って **Run**。
   「Success」と出ればOK。（何度実行しても大丈夫）
3. 左メニュー **Authentication** → **Sign In / Providers** → **Allow anonymous sign-ins** をオン → Save。
4. 左メニュー **Project Settings** → **API Keys**（または Data API）で次の2つを控える。
   - **Project URL**（`https://xxxx.supabase.co`）
   - **anon / publishable key**（公開してよい鍵。`service_role` / secret の方は**使わない・貼らない**）

## 2. 通知用の鍵 ― 不要

通知用の鍵（VAPID）は notify 関数が初回に自動で作り、DBの利用者から読めない表に保管する。
自分で用意した鍵を使いたい場合だけ、`tools/vapid.html` で作って Secrets に `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` を入れる。

## 3. 通知を送る仕組み（Edge Function）を置く ― 5分

1. Supabase の左メニュー **Edge Functions** → **Deploy a new function** → **Via Editor**。
2. 関数名を **`notify`** にし、エディタの中身を `supabase/functions/notify/index.ts` で丸ごと置き換えて **Deploy**。
3. 関数の **Settings** で **Verify JWT with legacy secret** をオフにして Save（ログイン確認は関数の中で行っている。新しい形式のログイン情報が弾かれないようにするため）。

## 4. アプリに接続先を書く ― 1分

`js/config.js` を開いて3か所を埋める。

```js
export const CONFIG = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'sb_publishable_...（publishable key）',
  vapidPublicKey: '',
};
```

## 5. 公開する（GitHub Pages）― 5分

1. GitHub で新しいリポジトリ（例 `liftboard`、Public）を作る。
2. **Add file → Upload files** で、このフォルダの中身を**フォルダ構成ごと**ドラッグしてアップロード → Commit。
3. リポジトリの **Settings → Pages** → Source：**Deploy from a branch**、Branch：`main` / `/(root)` → Save。
4. 1〜2分で `https://ユーザー名.github.io/liftboard/` が使えるようになる。
5. Supabase の **Authentication → URL Configuration** の **Site URL** にこのURLを入れて Save（メールでの引き継ぎ用）。

> Netlify を使う場合：https://app.netlify.com/drop にフォルダをドラッグするだけでも公開できる（更新時は再ドラッグ）。

## 6. 使い始める

1. 公開URLを開く → **新しくチームを作る** → チーム名と自分の表示名。
2. **マイデータ → チーム → 招待リンクを送る** で LINE などに貼る。メンバーは開いて名前を入れるだけ。
3. 各自 **通知をオンにする**。
   - **iPhone**：Safari で開く → 共有ボタン → **ホーム画面に追加** → ホーム画面のアイコンから開いて「通知をオンにする」（iOS 16.4以降。Safariのタブのままでは通知を受け取れない）
   - **Android / PC**：そのまま「通知をオンにする」でよい（ホーム画面に追加するとアプリのように使える）

---

## 更新のしかた（逐一アップデート）

1. ファイルを編集（種目の追加は `js/catalog.js`、メニューは `js/programs.js`）。
2. `js/catalog.js` の `APP_VERSION` と `CHANGELOG`、`sw.js` の `CACHE` の数字を1つ上げる。
   ※ `js/config.js` は Claude 版の公開には含めない（Claude 上では自動で Claude の共有DBを使うので、含めても動くが不要）。
3. GitHub に同じファイルをアップロードし直す（上書き）。→ 各自が次に開いたとき新しい版になる。データはそのまま。

データ形式を変えるとき（DBの列を増やすなど）は `supabase/schema.sql` を直して SQL Editor でもう一度 Run。

## 知っておくこと

- **無料枠**：DB 500MB、Edge Function 月50万回、同時接続200。チーム規模なら十分。
- **1週間だれも開かないとプロジェクトが一時停止**（無料プランの仕様）。オフ明けは Supabase のダッシュボードで **Restore** を押せば戻る。
- **アカウント**：最初はその端末だけの匿名アカウント。機種変更に備えて **マイデータ → アカウント** でメールを登録しておくと、新しい端末で「別の端末で使っていた記録を引き継ぐ」からログインできる。
- **権限**：読むのは同じチームの記録だけ、書けるのは自分の記録だけ（DBの行レベルセキュリティで強制。`supabase/test/rls_test.sql` で検証済み）。
- 通知は「開始」と「終了」。同じ人の同じ通知は10分に1回まで。

## 困ったとき

| 症状 | 確認すること |
|---|---|
| 「サインインできませんでした」 | 手順1-3 の匿名サインインがオンか |
| 参加・記録でエラー | 手順1-2 の SQL を Run したか。`config.js` のURLと鍵が正しいか |
| 通知が来ない | 関数名が `notify` か／Verify JWT がオフか／iPhoneはホーム画面から開いているか／Edge Functions → notify → Logs |
| 古い画面のまま | アプリを完全に閉じて開き直す（`sw.js` の CACHE を上げ忘れていないか） |
