# 再設計の進捗と作業メモ

`docs/design.md` の再設計を、段階ごとに進めてきた。段階 1〜8 は 2026-11-07 に終わった。新しいセッションで作業を再開するときは、このファイルと `docs/design.md` を先に読む。

> [!NOTE]
> 8-C で旧版を消し、「next」の付いた名前を元に戻した（`firebase/firestore.next.rules` → `firebase/firestore.rules`、`firebase.next.json` → `firebase.json`、`firestore.next.indexes.json` → `firestore.indexes.json`、`scripts/next/` → `scripts/`、`tests/next/` → `tests/`、`vitest.next-rules.config.ts` → `vitest.rules.config.ts`、`notify:next` → `notify`、`emulators:next` → `emulators`、`test:next-rules` → `test:rules`、`web:dev`・`web:build`・`web:check` → `dev`・`build`・`check`）。各段階の記録は、当時の名前のまま残している

## 進め方の約束

- 作業は `main` を最新として進める。2026-11-06 に `redesign` の内容を main に統合した。`redesign` ブランチはその時点で止めてあり、もう使わない
- 段階ごとに、作業計画を示して確認を取ってから実装する
- 段階が終わったら、確かめた内容を報告する。コミットは確認を取ってから行う
- 指示されていないファイルは変えない

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
| 7-B. メンバーへのメール（`mails`、画面、送信スクリプト） | 完了 | `e1e362b` |
| 8-A. 受付メールとリマインド | 完了 | `4e4406a` |
| 8-B. デプロイの切り替え（`deploy.yml`、`notify.yml`）、旧版のデータを消すワークフロー、画面ごとのコード分割 | 完了 | `4274646` |
| 8-C. 旧版の削除、名前の整理、README・UPDATING | 完了 | このコミット |

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

## 段階 8（受付メール・リマインド、デプロイ、旧版の削除）

- **決まったこと**（2026-11-07、すべて案どおり）
  - 8-A（受付メールとリマインド）、8-B（デプロイの切り替え、コード分割）、8-C（旧版の削除と仕上げ）に分ける
  - 受付メールは常に送る。リマインドは開催前日の 18 時（日本時間）から。Variables の `REMINDER_HOUR`（0〜23）で変えられる
  - Firebase の Web 設定は、リポジトリの Variables（`FIREBASE_API_KEY`、`FIREBASE_AUTH_DOMAIN`、`FIREBASE_PROJECT_ID`、`FIREBASE_APP_ID`）に置く
  - 旧版のデータ（`events` とその申込、`config/admins`）は、手動で実行するワークフローで消す（`--dry-run` で件数を確かめられる）。旧版の申込の記録は消える
  - 旧版の最後のコミットにタグ `v1` を付ける。派生リポジトリには、PR の説明と `UPDATING.md` で移行の準備を伝える。デプロイを新版に切り替えるのは 8-B なので、タグは 8-B を main に入れる前（旧版として最後に動く `4e4406a`）に付ける
- **8-A でやったこと**
  - `scripts/next/lib/notify.ts`：承認の通知のあと、管理者のメールの前に、開始前の公開中のイベントの申込者へ送る。受付メールは `confirmedAt`、リマインドは `remindedAt` を申込に記録する（Actions だけが書く。キャンセルした人は申込が消えているので送らない）。リマインドの時間帯（前日の指定の時刻〜開催日の 0 時）は旧版と同じ。その時間帯に申し込んだ人には、受付メールとリマインドを続けて送る
  - 日本時間の計算と表示は `scripts/next/lib/time.ts`（旧版の `app/src/lib/time.ts` から必要な分を書き写した）
  - 文面は `confirmationMail`・`reminderMail`（イベント名、日時、会場、住所、詳細ページの URL、キャンセルの期限）。`--dry-run` では、イベントの内容で見本を出す（名前は伏せる）
  - 環境変数 `REMINDER_HOUR`（省略すると 18。範囲外ならエラーで止める）
  - テスト：送信の流れ 8 件、日本時間 9 件、文面 3 件を足した

- **8-B でやったこと**
  - `deploy.yml`：新版用に書き直した。Firestore のルールとインデックス（`firebase.next.json`）を反映してから、`web/` をビルドして Pages に公開する。`BASE_PATH` は `actions/configure-pages` の `base_path`、Firebase の Web 設定は Variables から `VITE_FIREBASE_*` で渡す。Secret の `FIREBASE_SERVICE_ACCOUNT` と 4 つの Variables のどれかがなければ、足りないものを名前で知らせて、何もしない。旧版の同期（`npm run sync`）はなくなった
  - `notify.yml`：`npm run notify:next` に切り替えた。`SITE_URL` は `configure-pages` の `base_url`。Variables の `SMTP_HOST`、`SMTP_PORT`、`REPLY_TO`、`REMINDER_HOUR` を渡す（空なら既定の値）。旧版の件数の補正と古い申込の削除はなくなった
  - `cleanup-old-data.yml`（Clean up old data）：手動で実行し、旧版のデータを消す（`npm run cleanup:old`、`scripts/next/cleanup-old.ts`）。`dry_run` が既定。旧版のイベントは `registrationCount` を持たないことで見分け、申込ごと消す。`config/admins` も消す。新版のデータには触らない（テスト 4 件）
  - 画面ごとのコード分割：トップと「見つかりません」以外のページを `React.lazy` で読み込み、`Layout` の `Suspense` で読み込み中を出す。最初に読み込む JS は 1,044KB → 917KB（`index` 239KB、Firebase の SDK 678KB）。Markdown の表示（約 83KB）は詳細画面だけで読む。警告の上限は 700KB にした（Firebase の SDK が分けられないため）。さらに小さくするなら `firebase/firestore/lite` に替える案があるが、ルールのテストの作りも変わるので見送った
  - 本番での確かめ（Firebase への実際のデプロイ、SMTP での送信）は、まだできていない

- **8-C でやったこと**
  - 旧版（`app/`、`site/`、旧 `scripts/`・`tests/`、旧ルール、`vitest` の旧設定）を消し、「next」の付いた名前を元に戻した（冒頭の注を参照）。Astro、`yaml`、`zod` の依存を外した
  - `npm run check` は、画面（`web/tsconfig.json`）と、スクリプトとテスト（ルートの `tsconfig.json`。新しく作った）の両方を型チェックする。CI は型チェック、単体テスト、ビルド、ルールとスクリプトのテストだけにした
  - README を新版の手順で書き直した（セットアップ、使い方、メール、Variables、運用、トラブル、開発者向け）。画面の写真（`docs/images/`）も新版で撮り直した
  - `UPDATING.md`：残すパスの説明を新版に合わせ、「旧版（v1）から移る」を足した（Variables の登録、切り替え、旧データの削除、グループの作成、旧版に留まるとき）
  - `update.yml`：旧版（`app/` がある）から新版への切り替えを含む PR には、移行の準備を促す注意を説明の先頭に入れる
  - タグ `v1`（`4e4406a`）は、この環境からは push できなかった（タグの push だけが接続を切られる）。GitHub の画面で付ける必要がある
- **段階 8 のあとに残っていること**
  - タグ `v1` を GitHub に付ける
  - 本番での確かめ：Firebase へのデプロイ、Pages への公開、ログイン（ポップアップ）、SMTP での送信、collectionGroup のインデックス
  - asugaku の移行（`UPDATING.md` の「旧版（v1）から移る」）
  - さらに軽くするなら、Firestore の軽量版（`firebase/firestore/lite`）に替える（ルールのテストの作りも変わる）

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

- ルールは `firebase/firestore.rules`、インデックスは `firebase/firestore.indexes.json`、エミュレーターの設定は `firebase/firebase.json`（Auth は 9199、Firestore は 8180）
- CI（`ci.yml`）は、型チェック（`npm run check`）、単体テスト、ビルド、ルールとスクリプトのテスト（`npm run test:rules`）を実行する
- テストの置き場所
  - ルール：`tests/rules/`（`npm run test:rules`）
  - スクリプト（通知メール、旧データの削除）：`tests/notify/`（`npm run test:rules` に含まれる）
  - 単体：`tests/unit/`（`npm test`）
- 型チェック：`npm run check`（画面は `web/tsconfig.json`、スクリプトとテストはルートの `tsconfig.json`）
- 画面の確認：`npm run emulators` と `npx vite --config web/vite.config.ts --port 5179` を起動する
  - エミュレーターのデータを消すとき：`curl -X DELETE "http://127.0.0.1:8180/emulator/v1/projects/demo-event-post/databases/(default)/documents"`
  - スクリーンショットで日時を確かめるときは、ブラウザを日本時間にする（Playwright なら `timezoneId: 'Asia/Tokyo'`）
- この端末では `java` に PATH が通っていない。エミュレーターを使うコマンドの前に `export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"` を付ける
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

- ポップアップでのログインは、利用者が手元で確かめる必要がある（拡張機能からは操作できないため）
- 旧版のヘルプページの変更は `main` の `git stash` に退避してある（名前は「help page (before redesign)」）
