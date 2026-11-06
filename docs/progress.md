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
| 5-A. イベントのルールとテスト、管理者のイベント作成・編集（`/admin/events`） | 完了 | `8ea2623` |
| 5-B. 一覧・詳細（`/events`、`/events/:id`）、申込とキャンセル、申込者の一覧 | 完了 | `22f97fd` |
| 6. マイページ（`/me`）、メンバー用のナビ | 完了 | `64676db` |
| 7-A. メンバー管理（`/admin/members`）、グループの設定（`/admin/settings`） | 完了 | `733e645` |
| 7-B. メンバーへのメール（`mails`、画面、送信スクリプト） | 完了 | このコミット |
| 8. 受付メール・リマインド、デプロイのワークフロー、README、旧版の削除 | **次はここ**。作業計画を示すところから | |

## 段階 5 の計画

5-A、5-B とも完了。

- **決まったこと**（2026-11-06、すべて案どおり）
  - 日時は開始と終了の両方を持つ
  - 定員なし（`capacity: null`）を選べる。締切を入れなければ、開始日時を締切にする
  - 申込（`registrations/{uid}`）に保存するのは、uid、ニックネーム、本名、メールアドレス、申込日時
  - キャンセルは開始日時までできる（締切後でも、開始前ならできる）
  - 申込がないイベントだけ削除できる。申込があるときは、下書きに戻すだけにする
  - 定員を今の申込数より少なくできない（ルールで禁止）
  - 申込者の一覧（名前とメールアドレス）は 5-B に入れる
  - 本文の Markdown の表示には `marked` と `DOMPurify` を使う（5-B で足す）
- **5-A でやったこと**
  - `events/{id}` の項目：`title`、`body`（Markdown）、`startAt`、`endAt`、`deadlineAt`、`venue`、`address`、`capacity`（null は定員なし）、`published`、`registrationCount`、`createdAt`、`updatedAt`
  - ルール：公開中はメンバー、下書きは管理者だけが読める（メンバーの一覧は `where('published', '==', true)` で読む）。作成・編集は管理者。申込数と作成日時は編集で変えられない。編集は変える項目だけを確かめるので、Actions が送信日時などを書き足しても編集できる。削除は申込数が 0 のときだけ
  - 入力の確かめ（終了は開始より後、締切は開始以前、定員は 1〜10000）は、ルールと画面（`web/src/lib/eventForm.ts`）の両方で行う
  - 画面：`/admin/events`（一覧）、`/admin/events/new`（作成）、`/admin/events/:id`（編集、削除）。管理者ナビに「イベント管理」を足した
  - テスト：ルール `tests/next/rules/events.test.ts`（32 件）、単体 `tests/next/unit/eventForm.test.ts`（11 件）
- **5-B でやったこと**
  - `registrations/{uid}` の項目：`uid`、`realName`、`nickname`、`email`、`createdAt`。名前とメールアドレスは、ルールで `members` の内容と一致を確かめる
  - 申込：メンバー本人が、公開中で締切前のイベントに申し込む。申込の作成と申込数の +1 を 1 回の書き込みで行い、定員は書き込んだあとの申込数で確かめる
  - キャンセル：本人が開始日時まで。申込の削除と申込数の -1 を 1 回の書き込みで行う。管理者もほかの人の申込は消せない
  - 申込数は `increment` で変える。同時に申し込んでも片方が誤って失敗せず、定員を超える分だけが拒否される（テストで確かめた）
  - イベントの更新のルールは「管理者の編集」か「申込数だけの ±1（同じ書き込みで自分の申込を作る・消すときだけ）」
  - 読み取り：申込は本人と管理者。collectionGroup（`match /{path=**}/registrations/{uid}`）は `where('uid', '==', 自分)` で絞り込めば読める（段階 6 のマイページで使う。`listMyRegistrations`）
  - 画面：`/events`（これから・過去。申込済み・受付中・満員・締切・終了のバッジ）、`/events/:id`（概要、申込とキャンセル、本文の Markdown）、管理者の編集画面に申込者の一覧。`/events` 以下は `RequireMember` でメンバー以外を `/` に戻す
  - 本文は `marked`（改行をそのまま改行にする）で HTML にし、`DOMPurify` で危ないタグや属性を取り除く。外部リンクは新しいタブで開く
  - 本文の文字の大きさを 16px にした（`body`）
  - テスト：ルール `tests/next/rules/registrations.test.ts`（28 件）、単体 `tests/next/unit/registrationStatus.test.ts`（5 件）
- **残っていること**
  - 管理者が申込を取り消す機能はない（必要なら段階 7 で検討する）

## 段階 6（マイページ）

- **決まったこと**（2026-11-06、すべて案どおり）
  - 申し込んだあとに下書きに戻されたイベントは、「非公開になったイベントが n 件あります」とだけ表示する
  - メンバー全員にナビ（イベント、マイページ）を出す。管理者には、その後ろに管理のリンクを続ける
  - 本名・ニックネームの変更は入れない（必要なら段階 7 以降で検討）
  - マイページにはキャンセルのボタンを置かず、詳細画面へのリンクだけにする
- **やったこと**
  - `/me`：これから参加するイベント（終了前、早い順）、参加したイベント（終了後、新しい順）、自分の情報。自分の申込を collectionGroup で検索し、イベントを 1 件ずつ読む（`web/src/lib/myPage.ts` の `splitMyEvents` で分ける）
  - ヘッダーのナビをメンバー全員に出す（クラス名を `admin-nav` から `site-nav` に変えた）
  - 本番用のインデックス `firebase/firestore.next.indexes.json`：`registrations` の `uid` に collectionGroup 用の単一フィールドのインデックスを足す（本番では自動で作られないため）。`firebase.next.json` から参照する。本番への反映は段階 8
  - テスト：単体 `tests/next/unit/myPage.test.ts`（3 件）。ルールは 5-B で確かめ済み

## 段階 7（メンバー管理、グループの設定、メール）

- **決まったこと**（2026-11-06、すべて案どおり）
  - 7-A（メンバー管理、グループの設定）と 7-B（メール）に分ける
  - グループから削除した人の申込は残す（申込者の一覧に残るので、管理者が判断する）
  - 送信待ちのメールは、送信前なら管理者が削除できる。内容の編集はできない
  - 宛先は「全員」「一覧から選んだ人」「イベントの申込者」から選ぶ（イベントの編集画面に「申込者にメールを送る」を置く）
  - 1 通のメールの宛先は 500 人まで（Gmail の 1 日の上限が約 500 通のため）。画面に注意書きを出す
- **7-A でやったこと**
  - `/admin/members`：役割ごとにメンバーを並べる。削除（参加者は管理者が、管理者は特権管理者が。画面の中で確かめる）と、役割の変更（特権管理者だけ）。ボタンを出すかどうかは `canRemoveMember`・`canChangeRole`（ルールと同じ条件）で決める
  - `/admin/settings`：グループ名、説明、管理者の名前（特権管理者だけ。ほかの人は `/` に戻す）
  - ナビに「メンバー」（管理者）と「設定」（特権管理者）を足した
  - ルールは段階 2 のまま。メンバーの一覧を管理者が読める・参加者は読めないテストを足した（2 件）。単体 `tests/next/unit/memberPermissions.test.ts`（4 件）
- **7-B でやったこと**
  - `mails/{id}` の項目：`subject`、`body`、`recipients`（uid・name・email の写し、1〜500 人）、`createdByUid`、`createdByName`、`createdAt`、`status`（`pending` で作る）。Actions が `deliveredUids`、`failedUids`、`attempts`、`sentAt` を書き、`status` を `sent` か `failed` にする
  - ルール：管理者だけが読み書きする。内容は変えられない。削除は `pending` で、まだ誰にも届けていないときだけ。宛先が本当にメンバーかはルールで確かめない（管理者を信頼する）
  - 送信（`scripts/next/lib/notify.ts`）：申し込み・承認の通知のあと、`pending` のメールを書いた順に、宛先へ 1 人ずつ送る。届けた人はその都度 `deliveredUids` に足すので、途中で止まっても二重に送らない。全員に届けば `sent`。届かない人がいれば次の回にその人だけ送り直し、3 回（`MAX_MAIL_ATTEMPTS`）続いたら `failed`。失敗が続いて送信をやめた回は数えない。送信中に削除されたら残りは送らない。件名に【グループ名】、本文の後ろに送り主とサイトの URL を付ける。公開のログに本文を出さないよう、`--dry-run` でも見本は出さない
  - 画面：`/admin/mails`（履歴、送信状況、届かなかった人、本文と宛先、送信前の削除）、`/admin/mails/new`（宛先は全員・選んだ人・`?event=ID` のときはイベントの申込者。確かめてから保存）。メンバー一覧と申込者一覧からのリンク、ナビの「メール」
  - テスト：ルール `tests/next/rules/mails.test.ts`（12 件）、送信 `tests/next/notify/notify.test.ts`（8 件追加）、文面 `tests/next/unit/messages.test.ts`（1 件追加）
- **段階 8 でやること（7-B から）**：`notify.yml` は今のままで管理者のメールも送る（新版のスクリプトに切り替えたあと）。Gmail の 1 日の上限を超えたときの動き（失敗が続いて止まり、次の回に続きを送る）を本番で確かめる

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
- Auth エミュレーターでは、`sub` に何を渡しても uid は別に振られる。テストでメンバーを REST などで用意するときは、ログインしたあとに `cred.user.uid` を取り出して、その uid で作る

## 後回しにしていること

- ビルドした JS が約 900KB あり、サイズの警告が出ている。主な原因は Firebase の SDK。段階 8 で、画面ごとにコードを分割する
- ポップアップでのログインは、利用者が手元で確かめる必要がある（拡張機能からは操作できないため）
- 旧版のヘルプページの変更は `main` の `git stash` に退避してある（名前は「help page (before redesign)」）
