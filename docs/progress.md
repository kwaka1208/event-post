# 再設計の進捗と作業メモ

`docs/design.md` の再設計を、段階ごとに進めている。新しいセッションで作業を再開するときは、このファイルと `docs/design.md` を先に読む。

## 進め方の約束

- 作業は `main` を最新として進める。2026-11-06 に `redesign` の内容を main に統合した。`redesign` ブランチはその時点で止めてあり、もう使わない
- 段階ごとに、作業計画を示して確認を取ってから実装する
- 段階が終わったら、確かめた内容を報告する。コミットは確認を取ってから行う
- 指示されていないファイルは変えない。旧版（`app/`、`site/`、`scripts/`、`tests/` の `next/` 以外）は、段階 8 まで触らない

## 進捗

| 段階 | 状態 | コミット |
|---|---|---|
| 1. `web/` に SPA の骨組み、Firebase Hosting の設定 | 完了。のちに GitHub Pages 用に変更 | `af3c1eb` |
| 1'. 配信先を GitHub Pages に変更し、main に統合。CI に新版の確認を追加 | 完了 | `5193916`、このコミット |
| 2. Firestore のルールとテスト（グループ、`members`、`applications`、承認） | 完了 | `0fc9659` |
| 3. トップページ、ログイン、`/setup`、`/join`、画面の振り分け | 完了 | `fa7b04c` |
| 4-A. 申し込み一覧（`/admin/applications`）、管理者用のナビ | 完了 | `2ecfe0e` |
| 4-B. 通知メール（申請・承認）。`scripts/next/` | 完了 | `e8ef288` |
| 5. イベントの作成・編集、一覧・詳細、申込とキャンセル | **次はここ**。作業計画を示すところから | |
| 6〜8 | 未着手 | |

## 配信先を GitHub Pages に変えたこと（2026-11-06）

ほかのサイトと運用を揃えるため、Firebase Hosting をやめて GitHub Pages で配信する。

- Firebase の Web 設定：`/__/firebase/init.json`（Hosting 専用）は使えないので、ビルド時に `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_APP_ID` で埋め込む（`web/src/lib/firebase.ts`）。ないまま本番用にビルドすると、開いたときにエラーになる
- サブパス：`BASE_PATH`（例：`/event-post`）を Vite の `base` と React Router の `basename` に使う。省略すると `/`
- 直接開いた URL：ビルドの最後に `index.html` を `404.html` に複製する（`web/vite.config.ts`）。ステータスは 404 になるが、画面は出る
- `firebase/firebase.json` から `hosting` を外し、main と同じ内容に戻した
- main の `deploy.yml` は `app/`（旧版）だけをビルドして公開する。そのため、新版を main に入れても、公開中のサイトは段階 8 まで旧版のまま
- **段階 8 でやること**：`deploy.yml` を新版用にする。`VITE_FIREBASE_*` の出どころ（設定ファイルかリポジトリの Variables か）、`BASE_PATH`（`actions/configure-pages` の `base_path`）、通知メールの `SITE_URL`（サブパスを含める）を決める。Firebase Authentication の承認済みドメインに `<ユーザー>.github.io`（または独自ドメイン）を足す手順を README に書く

## 派生リポジトリへの反映（2026-11-06）

テンプレートから作ったリポジトリ（例：`kwaka1208/asugaku`）に本体の更新を届ける仕組み。

- `.github/workflows/update.yml`（Update EventPost）：派生リポジトリで、毎週月曜と手動で、元のリポジトリの本体を取り込む PR を作る。元のリポジトリ自身では動かない
- 残すのは `site/`、`.eventpost-keep`（とそこに書いたパス）、`.eventpost-version`（取り込んだ版の記録）。それ以外は元と同じにする。本体のパスを一覧で持たないので、`web/` のような新しいディレクトリにも追従する
- 派生リポジトリには、Secret `EVENTPOST_UPDATE_TOKEN`（fine-grained PAT。Contents・Pull requests・Workflows を Read and write）が要る。`GITHUB_TOKEN` では `.github/workflows/` の変更を push できず、作った PR で CI も動かないため
- 手順は `UPDATING.md`。手作業の手順も同じ方式に揃えた
- **注意**：main には作業中の新版（`web/` など）が入っている。派生リポジトリが取り込んでも、`deploy.yml` が旧版を公開する間は影響がない。段階 8 で `deploy.yml` を新版に切り替えると、取り込んだ時点で新版に移る。段階 8 では、派生リポジトリの移行手順（Firebase の設定、データ）を先に用意する

## 段階 4 の計画

4-A（画面）と 4-B（通知メール）は完了。

- **画面**：`/admin/applications`
  - 申し込みを申込日時の順に並べる（本名、ニックネーム、メールアドレス、理由、申込日時）
  - 1 件ごとに、役割の選択（参加者 / 管理者）、承認、削除のボタンを置く。「管理者」を選べるのは特権管理者だけ
  - 削除は確認してから行う。ブラウザの `confirm()` は使わず、画面の中で確かめる
  - 管理者以外は `/` に戻す。管理者用のナビゲーション（ヘッダーなど）を追加する
- **ルール**：申し込みの一覧（list クエリ）を管理者が読めることを、テストで確かめる。今のルールのままで通るはず
- **通知メール**：`scripts/next/` に新しく作る（Admin SDK を使う。旧版の `scripts/lib/smtp.ts` を参考に流用する）
  - 新しい申し込み → 管理者全員（`owner` と `admin`）に通知し、`applications` に `notifiedAt` を書く
  - 承認 → 本人に通知し、`members` に `welcomedAt` を書く。グループを作った特権管理者には送らない
  - `notifiedAt` が「ない」ドキュメントは `== null` のクエリで取れない。そのため、全件を読んでコードで絞り込む
  - サイトの URL は環境変数（例：`SITE_URL`）で渡す
  - テストは Firestore エミュレーターで行い、`--dry-run`（送らずに内容を表示する）を用意する
  - GitHub Actions のワークフローは段階 8 で作る
- **決まったこと**
  - メールの文面はコードに書く（テンプレートファイルは作らない）
  - 返信先（Reply-To）は環境変数 `REPLY_TO` で指定する
  - SMTP は環境変数 `SMTP_USER`、`SMTP_PASSWORD`、`SMTP_HOST`（既定 `smtp.gmail.com`）、`SMTP_PORT`（既定 465）。差出人名は `group/profile` のグループ名
  - 旧版の `scripts/lib/smtp.ts` は `site/config.yml` に依存するので、import せず書き写して流用する
- **4-B の仕様**（`npm run notify:next`、`--dry-run` で送らずに内容を表示する）
  - 環境変数：`SITE_URL`、`SMTP_USER`、`SMTP_PASSWORD` は必須。`SMTP_HOST` の既定は `smtp.gmail.com`、`SMTP_PORT` の既定は 465。`REPLY_TO` は省略できる
  - 接続先：`FIRESTORE_EMULATOR_HOST` があれば `demo-event-post`、なければ `GOOGLE_CLOUD_PROJECT`
  - 申し込みの通知：その回の新しい申し込みをまとめて、管理者（`owner` と `admin`）1 人につき 1 通送る。1 人にでも届けば `notifiedAt` を書く
  - 承認の通知：`welcomedAt` がなく、`role != 'owner'` のメンバーに送る
  - 送信：3 回続けて失敗したら止める。失敗があれば終了コード 1 で終わる。ログには名前やメールアドレスを出さない
  - テスト：文面は `tests/next/unit/messages.test.ts`、送信の流れは `tests/next/notify/`（`npm run test:next-rules` に含まれる）
- **段階 8 でやること（4-B から）**
  - ワークフロー（`notify.yml`）に上の環境変数を渡す
  - 最初に本番で動かすと、`welcomedAt` がない既存メンバー全員に承認の通知が届く。本番ではまだ誰も承認されていないので問題はないが、念のため確かめる

## 開発環境のメモ

- 新しいルールは `firebase/firestore.next.rules`、エミュレーターの設定は `firebase/firebase.next.json`（Auth は 9199、Firestore は 8180）。段階 8 で、旧版の `firestore.rules` と `firebase.json` と入れ替える
- CI（`ci.yml`）は、旧版の確認に加えて、新版の `web:check`、`web:build`、`test:next-rules` も実行する
- テストの置き場所
  - ルール：`tests/next/rules/`（`npm run test:next-rules`）
  - 通知メール：`tests/next/notify/`（`npm run test:next-rules` に含まれる）
  - 単体：`tests/next/unit/`（`npm test` に含まれる）
- 画面の確認：`npm run emulators:next` と `npx vite --config web/vite.config.ts --port 5179` を起動する
  - エミュレーターのデータを消すとき：`curl -X DELETE "http://127.0.0.1:8180/emulator/v1/projects/demo-event-post/databases/(default)/documents"`
- この端末では `java` に PATH が通っていない。エミュレーターを使うコマンドの前に `export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"` を付ける
- `scripts/` 用の tsconfig はない。型チェックは一時的な tsconfig（`strict`、`moduleResolution: Bundler`、`types: ["node"]`、対象は `scripts/next/notify.ts` と `tests/next/**`）で行う
- ポート 8080 では、利用者が旧版のエミュレーターを動かしていることがある。止めたり、データを消したりしない
- Chrome での確認：ログインのポップアップは別ウィンドウで開くため、拡張機能からは操作できない。ページ上の JavaScript で、エミュレーターのテスト用アカウントでログインする

  ```js
  const src = await fetch('/src/lib/firebase.ts').then(r => r.text());
  const authUrl = src.match(/from "([^"]*firebase_auth[^"]*)"/)[1];
  const fb = await import('/src/lib/firebase.ts');
  const a = await import(authUrl);
  await a.signInWithCredential(fb.auth, a.GoogleAuthProvider.credential(
    JSON.stringify({ sub: 'alice-1', email: 'alice@example.com', email_verified: true, name: '山田 花子' })));
  ```

  ページを移動すると、この関数は消える。移動するたびに実行し直す

## 後回しにしていること

- ビルドした JS が約 900KB あり、サイズの警告が出ている。主な原因は Firebase の SDK。段階 8 で、画面ごとにコードを分割する
- ポップアップでのログインは、利用者が手元で確かめる必要がある（拡張機能からは操作できないため）
- 旧版のヘルプページの変更は `main` の `git stash` に退避してある（名前は「help page (before redesign)」）
