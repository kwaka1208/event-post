# ハンドオフ：EventPost — GitHub Pages + Actions で運用するイベント管理サイト

Claude Code で実装するための仕様書です。設計上の決定事項は「2. 決定事項」に確定版としてまとめています。迷ったときはここに立ち返ってください。

---

## 1. 目的

小さなグループ（地域団体、CoderDojo など）が、サーバーを持たずに次のことをできるようにする。

- イベントページを Markdown + Frontmatter で書いて公開する
- Google アカウントでログインした人から申込を受け付ける
- 申込受付メールと、開催前日のリマインドメールを自動で送る

テンプレートリポジトリとして公開し、各グループが「Use this template」で複製して使う。

### 名前

- ツール名：**EventPost**（イベントを掲示＝post して、申込を受け付ける道具）
- リポジトリ名・パッケージ名：`event-post`
- README の冒頭、サイトのフッター（「Powered by EventPost」とテンプレートへのリンク）、`package.json` の `name` にこの名前を使う
- 画面上のグループ名はあくまで config の `group.name`。ツール名を前面に出しすぎない

---

## 2. 決定事項

| 項目 | 決定内容 |
|---|---|
| 運用単位 | 1 リポジトリ ＝ 1 グループ。マルチテナントにはしない |
| 配布方法 | テンプレートリポジトリ（フォークではない。フォークは Actions が既定で無効なため） |
| ホスティング | GitHub Pages（Actions でビルド・デプロイ） |
| サイト生成 | Astro（v7 系） |
| 認証 | Firebase Authentication（Google ログインのみ） |
| データ | Cloud Firestore |
| Firebase のプラン | 無料の Spark プランで完結させる。**Cloud Functions は使わない** |
| サーバー処理 | すべて GitHub Actions（デプロイ時の同期、定期実行のメール送信） |
| 定員 | あり。Frontmatter で任意指定、省略時は無制限。キャンセル待ちはなし |
| キャンセル | 申込者が自分でキャンセルできる（開催開始まで） |
| 入力項目 | Google の名前・メールに加え、Frontmatter で追加項目を定義できる |
| 申込受付メール | 送る。定期実行で拾うため、申込から最大 1 時間程度遅れる |
| リマインド | 開催前日の指定時刻（JST）以降に送る |
| メール送信 | Gmail のアプリパスワード + SMTP（nodemailer） |
| 個人情報 | 開催から一定日数後に申込データを自動削除 |
| 想定利用者 | 少し GitHub を触れる人。README を画面付きで丁寧に書く |

### 設計の方針

- **引き算の設計。** UI フレームワーク（React など）は使わない。クライアント側の処理は Astro の `<script>`（TypeScript）で書く。
- **Markdown が正、Firestore は写し。** イベント情報はリポジトリの Markdown が唯一の正。Firestore の `events` はルールで参照するための写しで、デプロイ時に Actions が同期する。
- **グループ固有のものと本体を分ける。** テンプレートから作ったリポジトリには元の更新が自動反映されない。本体の差し替えで更新できるよう、ディレクトリを明確に分ける。

---

## 3. ディレクトリ構成

```
/
├─ site/                     # ← グループが編集する場所（本体更新で上書きしない）
│  ├─ config.yml             # グループ設定
│  ├─ events/                # イベントの Markdown
│  │  └─ 2026-11-20-hajimete.md
│  ├─ templates/             # メール文面
│  │  ├─ confirmation.md
│  │  └─ reminder.md
│  └─ assets/                # ロゴ・画像
│
├─ app/                      # ← 本体：Astro プロジェクト
│  ├─ src/
│  │  ├─ pages/
│  │  │  ├─ index.astro            # イベント一覧
│  │  │  ├─ events/[id].astro      # イベント詳細＋申込
│  │  │  └─ admin/index.astro      # 管理ページ
│  │  ├─ lib/                      # config 読込、Firebase 初期化など
│  │  └─ content.config.ts         # Content Collections（site/events を読む）
│  └─ astro.config.mjs
├─ scripts/                  # ← 本体：Actions から実行する Node スクリプト
│  ├─ sync-firestore.ts      # イベント・管理者を Firestore に同期
│  ├─ notify.ts              # 受付メール・リマインド・削除・件数補正
│  └─ lib/
├─ firebase/                 # ← 本体
│  ├─ firestore.rules
│  ├─ firestore.indexes.json
│  └─ firebase.json
├─ tests/                    # ← 本体：ルールのテスト（エミュレーター）
├─ .github/workflows/
│  ├─ deploy.yml
│  └─ notify.yml
├─ README.md                 # セットアップ手順（画面付き）
└─ UPDATING.md               # 本体の更新方法（site/ 以外を差し替える手順）
```

---

## 4. 設定ファイル `site/config.yml`

```yaml
group:
  name: CoderDojo 奈良
  description: 子どものためのプログラミング道場
  contact_email: info@example.org   # サイトとメールに表示する問い合わせ先

theme:
  accent: "#0F6E8C"                 # アクセントカラー（白文字とのコントラスト 4.5:1 以上をビルド時に検証）
  logo: assets/logo.png             # 任意。省略時はグループ名の頭文字を表示

site:
  # GitHub Pages のパス（例: /repo-name）。空なら Actions の configure-pages の値を使う
  base: ""
  custom_domain: ""                 # 独自ドメインを使う場合のみ

timezone: Asia/Tokyo                # 当面は Asia/Tokyo 固定でよい

admins:                             # 管理ページを閲覧できる Google アカウント
  - organizer@example.org

firebase:                           # Firebase の Web 設定（公開してよい値）
  apiKey: "..."
  authDomain: "xxx.firebaseapp.com"
  projectId: "xxx"
  appId: "..."

mail:
  from_name: CoderDojo 奈良
  smtp_host: smtp.gmail.com
  smtp_port: 465
  confirmation: true                # 申込受付メールを送るか
  reminder_hour: 18                 # 前日の何時（JST）以降にリマインドを送るか

retention_days: 30                  # 開催日から何日後に申込データを削除するか
```

- 読み込み時に **スキーマ検証**（zod など）を行い、誤りがあればビルドとスクリプトを分かりやすいメッセージで失敗させる。
- SMTP のユーザー名・パスワード、サービスアカウントは config に書かない（Secrets で渡す）。

---

## 5. イベントの Frontmatter

ファイル名（拡張子なし）をイベント ID とする。例：`2026-11-20-hajimete`。ID は Firestore のドキュメント ID と URL に使うため、英数字とハイフンのみ許可し、ビルド時に検証する。

```yaml
---
title: はじめてのプログラミング体験会
date: 2026-11-20          # 開催日（JST）
start: "13:00"
end: "16:00"
venue: 奈良市○○公民館
address: 奈良県奈良市...  # 任意
capacity: 20             # 任意。省略で無制限
deadline: 2026-11-19T23:59  # 任意。省略時は開始時刻まで受付
published: true          # false ならページを出さず、申込も不可
fields:                  # 任意。追加の入力項目
  - id: grade
    label: 学年
    type: select         # text | textarea | number | select
    options: [小1, 小2, 小3, 小4, 小5, 小6, 中学生]
    required: true
  - id: note
    label: 連絡事項
    type: textarea
    required: false
reminder_note: |         # 任意。リマインドメールに追記する文
  ノートパソコンをお持ちの方はご持参ください。
---

本文（Markdown）
```

- 日時はすべて `timezone`（JST）として解釈し、Firestore には Timestamp で保存する。
- 開催日が過ぎたイベントは一覧の「過去のイベント」に表示し、申込ボタンは出さない。

---

## 6. Firestore のデータモデル

```
config/admins
  emails: string[]                  # config.yml の admins（デプロイ時に同期）

events/{eventId}                    # Markdown の写し（デプロイ時に同期）
  title: string
  startAt: Timestamp
  endAt: Timestamp
  deadline: Timestamp               # 未指定なら startAt
  capacity: number | null           # null = 無制限
  count: number                     # 現在の申込数（申込・キャンセル時にクライアントが±1）
  fieldIds: string[]                # 追加項目の id 一覧（ルールでの検証用）
  published: boolean
  archived: boolean                 # Markdown が削除されたら true

events/{eventId}/registrations/{uid}
  uid: string
  name: string                      # Google の表示名（申込時に編集可）
  email: string                     # auth token の email
  answers: map                      # 追加項目の回答 { grade: "小3", ... }
  createdAt: Timestamp              # serverTimestamp
  confirmationSentAt: Timestamp?    # Actions が書く
  remindedAt: Timestamp?            # Actions が書く
```

### 同期スクリプト（`scripts/sync-firestore.ts`）の注意点

- **`count` を上書きしない。** 新規作成時のみ `count: 0` を入れ、既存のドキュメントは `count` 以外のフィールドだけをマージ更新する。
- Markdown から消えたイベントは削除せず `archived: true` にする（申込データを失わないため）。
- `config/admins` を config.yml の内容で上書きする。

---

## 7. セキュリティルール（最重要）

Functions を使わないため、不正や定員超過はすべてルールで防ぐ。**ルールのテストを必ず書くこと**（10 章）。

### 要件

**events/{eventId}**
- read：誰でも可（残席表示のため）
- create / delete：不可（Actions の Admin SDK のみ。Admin SDK はルールを迂回する）
- update：ログインユーザーは `count` のみ変更可。次のどちらかを満たすこと
  - **申込**：`count` がちょうど +1、かつこのバッチの後に自分の registration が存在し、前には存在しない。定員がある場合は加算後の `count <= capacity`
  - **キャンセル**：`count` がちょうど −1、かつこのバッチの前に自分の registration が存在し、後には存在しない

**events/{eventId}/registrations/{uid}**
- create：次をすべて満たすこと
  - `request.auth.uid == uid`
  - `request.auth.token.email_verified == true`、かつ `email == request.auth.token.email`
  - 対象イベントが `published == true`、`archived == false`、`request.time < deadline`
  - 同じバッチで events の `count` が +1 されている（`getAfter()` で確認）
  - キーは `uid, name, email, answers, createdAt` のみ。`createdAt == request.time`
  - `answers` のキーは events の `fieldIds` の部分集合。値は文字列か数値で、長さに上限（例：1000 文字）。`name` も長さ上限
- update：不可（変更したい場合はキャンセルして申し込み直す）
- delete：本人のみ。`request.time < startAt`。同じバッチで `count` が −1 されていること
- read：本人、または管理者

**config/admins**
- read：管理者のみ
- write：不可

**管理者の判定**
- `request.auth.token.email_verified == true` かつ `request.auth.token.email in get(/databases/$(database)/documents/config/admins).data.emails`

### クライアント側の書き込み

申込とキャンセルは **トランザクション** で行う（registration の作成または削除と、events の `count` の ±1 を同時に）。トランザクションにすることで、同時申込による `count` の食い違いをルール側で弾ける。

### 件数のずれへの備え

ルールが正しくても、事故的に `count` が実数とずれる可能性に備えて、`notify.ts` で毎回「registrations の実数」と `count` を照合し、ずれていれば Admin SDK で補正してログに出す。

---

## 8. 画面

画面デザインは Claude の Design キャンバス「イベント管理 画面デザイン」にある（参加者向け 5 枚、主催者向け 1 枚）。見た目はキャンバスに合わせ、以下の要点を守ること。

### デザインの基本
- フォント：見出し Zen Maru Gothic（700）、本文 Zen Kaku Gothic New（400/500/700）。Google Fonts から読み込む
- 色（CSS 変数で定義し、`--accent` だけを config の `theme.accent` で差し替える）

  | 用途 | 値 |
  |---|---|
  | 背景 | `#F4F6F8` |
  | カード | `#FFFFFF`、枠線 `#E2E6EA`、角丸 14px |
  | 文字 | `#1B2430`、補足 `#4A5562` |
  | アクセント（既定） | `#0F6E8C`（白文字を載せる前提） |
  | アクセントの淡色 | `color-mix(in srgb, var(--accent) 12%, #fff)` |
  | 残りわずか | 背景 `#FCEBDD`、文字 `#8F3A08` |
  | 満席・無効 | 背景 `#E6E9ED`、文字 `#3A4552` |
  | 完了 | `#2E7D4F` |
  | 危険（キャンセル・エラー） | `#B42318`、エラー背景 `#FDECEA` |
- 参加者向けページの本文幅は最大 640px、左右 20px の余白。スマホ幅（390px）で崩れないこと
- ボタン・リンクのタップ領域は高さ 44px 以上。主ボタンは高さ 52px・角丸 12px・アクセント塗り
- アイコンは線画の SVG（絵文字は使わない）
- ロゴは `theme.logo`。未指定ならアクセント色の角丸四角にグループ名の頭文字

### イベント一覧（`/`）
- 冒頭にグループ名と説明（config の `group.description`）、「参加には Google アカウントでのログインが必要」の一文
- 「これからのイベント」（日付昇順）：カード形式。左にアクセント色の日付ブロック（月・日・曜日）、右にタイトル、時間・会場、残席バッジ
- 残席バッジ：`残り N 席`（アクセント淡色）／残り 3 席以下で `残りわずか N 席`（オレンジ）／`満席`（グレー）／定員未指定で `定員なし`
- 「過去のイベント」：日付とタイトルだけの簡素な行
- フッターに問い合わせ先

### イベント詳細（`/events/{id}`）
- 戻るリンク → 日付（アクセント色）→ タイトル → 開催情報カード（日時・会場と住所・定員・締切）→ **申込パネル** → 本文（Markdown）の順
- 申込パネルはアクセント色の枠線で目立たせ、状態ごとに中身を切り替える

  | 状態 | パネルの内容 |
  |---|---|
  | 読み込み中 | スケルトン（灰色の帯） |
  | 未ログイン | 残席数と進捗バー（申込数/定員）、「Google でログインして申し込む」、名前とメールが主催者に共有される旨と保存期間 |
  | ログイン済み・未申込 | ログイン中のメールとログアウト、申込フォーム（名前＝Google の表示名を初期値・必須、追加項目）、「この内容で申し込む」、受付メールの宛先 |
  | 申込済み | 緑のチェックと「申し込みました」、受付メールは 1 時間ほどで届く旨とリマインド時刻、申込内容の一覧、「申込をキャンセルする」（赤枠）とキャンセル期限 |
  | キャンセル確認 | モーダル「申込をキャンセルしますか？」＋「やめる」「キャンセルする」（赤塗り） |
  | キャンセル後 | 「キャンセルしました」＋「もう一度申し込む」 |
  | 満席 | `満席` バッジ、定員に達した旨、無効化したボタン |
  | 締切後 | 締切日時を示して受付終了を伝える |
  | 開催後 | 終了した旨と一覧へのリンク |
  | 定員なし | 残席・進捗バーを出さず「定員はありません」 |
  | ログイン失敗 | エラー表示（ポップアップのブロックを確認するよう案内）＋再試行 |
  | 申込中に満席 | トランザクションが定員超過で失敗したとき。申込は完了していない旨を明示 |
- 必須項目には赤い「必須」、任意項目には灰色の「任意」ラベル。入力欄は高さ 48px、文字 16px（iOS の自動ズーム防止）
- ログインは **`signInWithPopup`** を使う（`signInWithRedirect` は Firebase Hosting 以外のドメインで、ブラウザのサードパーティストレージ制限により失敗しやすい）

### 管理ページ（`/admin`）
- ヘッダーに「管理」バッジ、ログイン中のメール、ログアウト
- 左にイベントの一覧（日付・タイトル・申込数/定員、選択中はアクセント色の枠）、右に選択中のイベント。狭い画面では縦に積む
- 右側の上部：日付・タイトル、「イベントページを開く」「CSV をダウンロード」
- 3 つの数字カード：申込数/定員、受付メールの送信済み件数、リマインドの送信予定時刻（または送信済み）
- 申込者の表：お名前、メールアドレス、追加項目（列は `fields` から自動生成）、申込日時、受付メールの状態（`送信済み` 緑／`送信待ち` オレンジ）。横にはみ出す場合は表の枠内で横スクロール
- 表の下に、申込データの自動削除日
- 管理者でログインしたときだけ内容を表示（判定はルール任せ。読み取りが拒否されたら「権限がありません」）
- CSV は BOM 付き UTF-8（Excel で文字化けしないように）
- 検索エンジンに載らないよう `noindex`

### 共通
- Firebase の Web 設定は config.yml からビルド時に埋め込む
- アクセシビリティ：ボタンは `<button>`、入力欄には `<label>`、エラーは `role="alert"`、モーダルは `role="dialog"` とフォーカス管理

---

## 9. GitHub Actions

### `deploy.yml`
- トリガー：`main` への push、`workflow_dispatch`
- 手順
  1. config.yml と全イベントの検証
  2. Firestore ルールとインデックスのデプロイ（`firebase-tools`、サービスアカウントで認証）
  3. `sync-firestore.ts` の実行
  4. Astro のビルド（`base` は config か `actions/configure-pages` の出力）
  5. `actions/upload-pages-artifact` → `actions/deploy-pages`
- 同期をページ公開より先に行う（新しいイベントのページが出たとき、Firestore 側が準備済みであるように）

### `notify.yml`
- トリガー：`schedule`（毎時。分は `17` など 0 分を避ける）、`workflow_dispatch`（入力 `dry_run: boolean`）
- `concurrency` を設定して同時実行を防ぐ（二重送信対策）
- `notify.ts` の処理
  1. **受付メール**：`confirmation: true` のとき、`confirmationSentAt` が未設定の申込に送信し、送信成功後に時刻を記録
  2. **リマインド**：開催日（JST）が「明日」で、現在時刻（JST）が `reminder_hour` 以降、かつ `remindedAt` が未設定の申込に送信し、記録。開催当日の申込にはリマインドを送らない
  3. **件数補正**：7 章のとおり
  4. **削除**：開催日から `retention_days` を過ぎたイベントの registrations を削除
  5. **キープアライブ**（下記）
- 送信が失敗した申込は記録しないので、次の回で再試行される。1 回の実行で失敗が続く場合はワークフローを失敗させ、GitHub の通知で気づけるようにする
- `dry_run` のときは送信も書き込みもせず、送る予定の内容をログに出す

### 60 日問題への対策
公開リポジトリで 60 日間アクティビティがないと、schedule のワークフローは自動で無効化される。イベントが空く期間にリマインドが黙って止まるのを防ぐため、`notify.yml` の中で GitHub API を使ってワークフロー自身を再有効化する（`PUT /repos/{owner}/{repo}/actions/workflows/{id}/enable`、`permissions: actions: write`）。**この方法で無効化カウントがリセットされるか、実装時に最新の情報で確認すること。** うまくいかない場合は、空コミットを作る方式（`contents: write`）に切り替える。

### メール
- テンプレートは `site/templates/*.md`。Frontmatter に `subject`、本文はプレースホルダー付きのテキスト
  - プレースホルダー例：`{{name}}` `{{event.title}}` `{{event.date}}` `{{event.start}}` `{{event.venue}}` `{{event.url}}` `{{reminder_note}}` `{{group.name}}` `{{group.contact_email}}`
- 本文はプレーンテキスト（HTML メールは作らない）
- 受付メールに、キャンセルはイベントページから行えることを書く
- 任意（余力があれば）：受付メールに `.ics` を添付

---

## 10. テスト

- **ルールのテスト**（`@firebase/rules-unit-testing` + Firestore エミュレーター）。最低限、次を確認する
  - 本人の申込が成功し、`count` が +1 される
  - 他人の uid での申込、メール不一致、未ログインは拒否
  - 定員ちょうどまでは成功し、定員を超える申込は拒否
  - `count` を +2 するなど不正な更新は拒否
  - 締切後・非公開・アーカイブ済みのイベントへの申込は拒否
  - 二重申込は拒否
  - 本人のキャンセルは成功し、`count` が −1 される。他人の申込は削除できない
  - 開催開始後のキャンセルは拒否
  - `fieldIds` にない回答キー、長すぎる値は拒否
  - registration の更新は拒否
  - 管理者は申込一覧を読める。一般ユーザーは他人の申込を読めない
- **スクリプトの単体テスト**：JST の日付判定（「明日」「reminder_hour 以降」）、テンプレートの差し込み、Frontmatter の検証
- CI：PR と push でルールのテストと単体テストを実行

---

## 11. Secrets とセットアップ

### GitHub Secrets
| 名前 | 内容 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | サービスアカウントの JSON（そのまま貼る） |
| `SMTP_USER` | 送信に使う Gmail アドレス |
| `SMTP_PASSWORD` | Gmail のアプリパスワード |

サービスアカウントに必要な最小限のロール（Firestore の読み書き、ルールのデプロイ）を実装時に確認し、README に明記する。

### README に書く手順（画面付き）
1. テンプレートからリポジトリを作成（公開リポジトリ）
2. Firebase プロジェクトを作成し、Authentication（Google）と Firestore を有効化
3. Authentication の承認済みドメインに `ユーザー名.github.io`（独自ドメインならそれも）を追加
4. サービスアカウントを作成し、JSON をダウンロード
5. Gmail で 2 段階認証を有効にし、アプリパスワードを発行
6. GitHub Secrets を登録
7. Settings → Pages で Source を「GitHub Actions」に設定
8. `site/config.yml` を編集してコミット → 初回デプロイ
9. サンプルイベントで申込を試し、`notify.yml` を `dry_run` で手動実行して確認
10. よくあるトラブル（ログインのポップアップが閉じる＝承認済みドメインの漏れ、メールが届かない＝アプリパスワード、など）

あわせて、Gmail の 1 日の送信上限、個人情報の扱い（保存期間）、Firebase の無料枠の目安を書く。

---

## 12. 実装の順序

1. Astro の骨組み、config.yml とイベント Frontmatter の検証、一覧・詳細ページ（Firebase なし）
2. Firestore ルールとエミュレーターでのテスト（7 章・10 章）
3. `sync-firestore.ts` と `deploy.yml`
4. 詳細ページのログイン・申込・キャンセル
5. 管理ページと CSV
6. `notify.ts`（dry_run から）と `notify.yml`、キープアライブ
7. README・UPDATING.md、サンプルイベント 2 件（未来と過去）

各段階で動作確認できる状態にしてから次に進むこと。

---

## 13. 対象外（今回は作らない）

- 複数グループの相乗り（マルチテナント）
- キャンセル待ち、抽選
- 決済
- Cloud Functions を使う処理（即時の受付メールなど）
- 申込内容の編集（キャンセルして再申込で代替）
- HTML メール

### 将来の拡張候補：受付メールの即時送信

今回は GitHub Pages + Actions + Firebase で完結させ、受付メールは毎時の cron で送る。将来、即時送信が必要になったときは、各グループが自分でデプロイする GAS を中継役にする案を検討する（申込完了後にブラウザが ID トークンを送り、GAS が検証して本人宛てにだけ送る）。その場合も `confirmationSentAt` で送信済みを管理する今の設計がそのまま使えるので、**送信済み判定は必ずこのフィールドに一本化しておくこと。**

---

## 14. 実装時に確認してほしいこと

- 60 日問題の再有効化 API が、無効化までのカウントをリセットするか（9 章）
- サービスアカウントの最小ロール（11 章）
- Astro・Firebase JS SDK・firebase-admin・firebase-tools の最新の安定版と、それに合わせた API の書き方
- ルールの `getAfter()` / `existsAfter()` をトランザクションで使う際の挙動（テストで担保）

---

## 15. 進捗メモ（実装セッションの引き継ぎ）

### 完了
| ステップ | 内容 | コミット |
|---|---|---|
| 1 | Astro 7 の骨組み、config / Frontmatter の検証、一覧・詳細ページ、サンプル 2 件、単体テスト | `b6ee601` |
| 2 | Firestore ルールとエミュレーターでのテスト（36 件） | `c9ca8a2` |
| — | リポジトリ名・パッケージ名を `event-post` に統一（表示名は EventPost のまま） | `aaf55de` |
| 3 | `sync-firestore.ts`（単体 7 件・エミュレーター 4 件のテスト）、`deploy.yml`、`ci.yml` | `fdcc999` ほか |
| 4 | 詳細ページのログイン・申込・キャンセル、一覧と詳細の残席表示、開発用の Auth エミュレーター | `cbd87b7` ほか |
| 5 | 管理ページと CSV、管理者判定のメール小文字化 | `9bdf4b5` |
| 6 | `notify.ts`（受付メール・リマインド・件数補正・削除、`--dry-run`）、`notify.yml`、キープアライブ | `2d636c7` ほか |

次は **ステップ 7（README・UPDATING.md・サンプル）**。各ステップは「計画を提示 → 確認 → 実装 → 動作確認 → コミット」で進める。

ワークフローは手元で動かせないため、YAML の構文までしか確認していない。初回の push で Deploy・CI・Notify が通るかを GitHub 上で確認すること。

### この仕様書から変えたこと・決めたこと
- Astro は **v7 系**（実装時 7.4.0）。Zod 4、Node 22.12 以上
- npm scripts は `cd app && astro …` の形。`astro dev --root app` だと Astro 7.4 の dev サーバーが相対 `--root` を二重に解決して全ページ 404 になるため
- TypeScript は **6 系**（`astro check` が 7 に未対応）
- 追加項目（`fields`）は **最大 20 件**。ルールでマップの値を繰り返し検証できず、書き下しているため（`schema.ts` の `MAX_FIELDS` と `firestore.rules` の `validAnswerValues` を合わせる）
- 回答は 1000 文字、名前は 100 文字まで（`MAX_ANSWER_LENGTH` / `MAX_NAME_LENGTH`）
- 一覧ページは、ビルド後に終了したイベントをブラウザ側の小さな script で「過去のイベント」に移す（サイトは push 時しか再生成されないため）
- テンプレートリポジトリは https://github.com/kwaka1208/event-post（フッターのリンク先、`app/src/consts.ts`）
- リポジトリ名・パッケージ名は `event-post`。エミュレーターのプロジェクト ID は `demo-event-post`。環境変数 `EVENTPOST_SITE_DIR` と定数 `EVENTPOST` は識別子なのでハイフンなしのまま
- `sync-firestore.ts --dry-run`（`npm run validate`）は Firestore に接続せず、検証と書き込む内容の表示だけを行う。deploy の検証ステップと CI で使う
- Actions の認証は `google-github-actions/auth` で `FIREBASE_SERVICE_ACCOUNT` から ADC を作り、firebase-tools と Admin SDK の両方がそれを使う
- 同期のテストは `tests/sync/` に置き、`npm run test:rules` で一緒に実行する（同じエミュレーターを使うため）
- 申込の `answers` では、**未入力の任意項目はキーごと省く**。`number` の項目は数値にする（`app/src/lib/answers.ts`）
- Firebase の Web 設定は `astro.config.ts` の `vite.define`（`__FIREBASE_CONFIG__`）でクライアントに埋め込む
- 開発サーバー（`import.meta.env.DEV`）では Auth・Firestore ともエミュレーターに接続し、プロジェクト ID は `demo-event-post`（`EMULATOR_PROJECT_ID`）。`sync-firestore.ts` も `FIRESTORE_EMULATOR_HOST` があればこの ID を使う
- 申込パネルの状態は 8 章の表のとおり。状態ごとの中身を `ApplyPanel.astro` の `<template>` に持ち、script で差し替える。キャンセル確認は `<dialog>` の `showModal()`（フォーカスの閉じ込めと Esc はブラウザ標準）
- ポップアップを自分で閉じた場合（`auth/popup-closed-by-user`）はエラーにせず元の表示に戻す
- 申込済みの表示では、開催当日の申込にはリマインドの一文を出さない（ステップ 6 の notify.ts と合わせる）
- ルールの管理者判定は `request.auth.token.email.lower()` で照合する（`config/admins` は小文字で同期しているため）
- 管理ページは、`config/admins` を読めるかどうかで管理者を判定する（読めなければ「権限がありません」）。申込一覧の読み取りが拒否された場合も同じ表示にする
- 管理ページに出すのは公開中（`published: true`）のイベントだけ。選択中のイベントは `?event=<id>` で持つ。左の申込数は `events` の `count`、右の数字は registrations の実数
- CSV の列は「お名前・メールアドレス・追加項目（fields 順）・申込日時・受付メール送信日時・リマインド送信日時」。日時は `2026/10/17 14:02`（JST）。先頭が `= + - @ タブ CR` の文字列には `'` を付ける（数値はそのまま）
- リマインドの時刻（開催前日の `reminder_hour` 時）と削除日（開催日の `retention_days` 日後の 0:00）は `time.ts` の `reminderAt()` / `retentionDate()`。notify.ts でも使う
- `BaseLayout` に `wide`（ヘッダーとフッターを 1280px 幅にする）を追加。ヘッダーは狭い画面で折り返す
- notify.ts は Firestore の `events` を順に見る。開始後は何も送らない（未送信の受付メールも送らず、記録もしない）。件数補正も開始前のイベントだけ
- メールを送らないのはアーカイブ済み（Markdown から消した）イベントだけ。`published: false` にしたイベントでも、既存の申込には送る
- 前日の `reminder_hour` 以降に申し込んだ人には、同じ回に受付メールとリマインドの 2 通が届く
- 削除はアーカイブ済みのイベントも対象。`count` は実績として残す
- 1 回の実行で 3 回続けて失敗したら送信をやめる（`MAX_CONSECUTIVE_FAILURES`）。失敗が 1 件でもあれば終了コード 1（ワークフローが失敗し、GitHub から通知が来る）
- ログに申込者の名前・メールアドレスを出さない（公開リポジトリでは Actions のログも公開）。uid と件数だけを出し、エラーメッセージ中のメールアドレスは伏せる。dry run の文面見本は名前を「（申込者名）」にする
- 差出人は `SMTP_USER` のアドレスで、表示名は `mail.from_name`（省略時はグループ名）。Reply-To は `group.contact_email`。ポート 465 は TLS、それ以外は STARTTLS
- メール中のイベント URL は `app/src/lib/site-url.ts`（`astro.config.ts` と共通。`custom_domain` か `PAGES_BASE_URL`）
- キープアライブは `notify.yml` の最後で `PUT .../actions/workflows/notify.yml/enable` を毎回呼ぶ。これで 60 日のカウントがリセットされるかは未確認。README には「無効化予告のメールが届いたら空コミットを push する」と書く

### 主なファイル
- `app/src/lib/schema.ts`：config.yml とイベントの zod スキーマ（scripts/ からも使う。Astro 固有の import をしない）
- `app/src/lib/config.ts`：`loadConfig()` / `siteDir()`（環境変数 `EVENTPOST_SITE_DIR`、既定は `cwd/site`）
- `app/src/lib/event.ts`：`eventTimes()`（startAt / endAt / deadlineAt）、`assertEventId()`
- `app/src/lib/time.ts`：JST の日時ユーティリティ
- `scripts/lib/load-site.ts`：`site/events/*.md` の読み込みと検証（`loadEvents()`、誤りは全件まとめて出す）
- `scripts/lib/sync.ts`：`toEventDoc()` / `normalizeAdmins()` / `syncFirestore()`
- `scripts/sync-firestore.ts`：同期の入口（`--dry-run` あり）
- `app/src/lib/firebase.ts`：ブラウザ側の Firebase 初期化（開発時はエミュレーター）
- `app/src/lib/seats.ts`：残席の状態と文言（残り 3 席以下で `few`）
- `app/src/lib/answers.ts`：申込フォームの検証と `answers` への変換
- `app/src/lib/apply.ts`：申込・キャンセルのトランザクション、拒否されたときの理由の推定。`db` を引数に取るので `tests/rules/apply.test.ts` からも使う
- `app/src/components/ApplyPanel.astro`：詳細ページの申込パネル
- `app/src/lib/admin.ts`：管理ページの読み取り（`canReadAdmin()` / `getEventCounts()` / `listRegistrations()`）
- `app/src/lib/csv.ts`：CSV の生成（BOM 付き UTF-8、エスケープ、CSV インジェクション対策）
- `app/src/pages/admin/index.astro`：管理ページ
- `app/src/lib/site-url.ts`：サイトの URL と base、イベントページの URL
- `scripts/lib/firestore.ts`：Admin SDK の接続（ADC、エミュレーター）
- `scripts/lib/mail.ts`：メールテンプレートの読み込みと差し込み
- `scripts/lib/notify.ts`：`runNotify()`（送信・記録・件数補正・削除。送信関数を引数に取る）
- `scripts/lib/smtp.ts`：nodemailer での送信
- `scripts/notify.ts`：notify の入口（`--dry-run` あり）

### コマンド
- `npm run dev` / `npm run build` / `npm run check` / `npm test`（単体テスト）
- `npm run validate`（config とイベントの検証のみ）/ `npm run sync`（Firestore に同期。認証情報が必要）
- `npm run notify -- --dry-run`（送る予定を表示。`PAGES_BASE_URL` が必要）/ `npm run notify`（送信。`SMTP_USER` / `SMTP_PASSWORD` も必要）
- `npm run test:rules`（ルールと同期のテスト）：Java が必要。手元では `export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH` してから実行する
- 画面の動作確認：`npm run emulators`（Auth と Firestore）→ 別の端末で `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run sync` → `npm run dev`
  - `npm run test:rules` はエミュレーターのデータを消すので、画面を確認するなら sync し直す
  - Auth エミュレーターのログインはポップアップの別ウィンドウになり、ブラウザ拡張から操作できない。開発サーバーのページのコンソールで、同じモジュールを import して偽の ID トークンでログインできる（ID トークンの JSON は `sub`・`email`・`email_verified`・`name`）
    ```js
    const { auth } = await import('/src/lib/firebase.ts');
    const A = await import('/node_modules/.vite/deps/firebase_auth.js?v=…'); // URL は performance.getEntriesByType('resource') で確認
    await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: 'u1', email: 'u1@example.com', email_verified: true, name: 'テスト' })));
    ```

### サービスアカウントのロール（ステップ 3 で調査）
firebase-tools 15.34 のソース（`lib/deploy/index.js`、`lib/deploy/firestore/prepare.js`）と公式ドキュメントから、次の 4 つで足りる見込み。**初回の実デプロイで確認し、README（ステップ 7）に書くこと。** 足りない場合は、権限エラーに出る permission 名から追加するロールを決める。

| ロール | 用途 |
|---|---|
| Firebase Rules Admin（`roles/firebaserules.admin`） | ルールのデプロイ |
| Cloud Datastore Index Admin（`roles/datastore.indexAdmin`） | インデックスのデプロイ（`datastore.indexes.*`、DB の存在確認） |
| Cloud Datastore User（`roles/datastore.user`） | `sync-firestore.ts` と `notify.ts` の読み書き |
| Service Usage Consumer（`roles/serviceusage.serviceUsageConsumer`） | firebase-tools が Firestore API の有効化を確認する（`serviceusage.services.get`） |

- 注意：Firestore のデータベースがまだないと、`firebase deploy` が `nam5`（米国）に作ってしまう。README で「先に Firestore を作成する（リージョンは asia-northeast1 など）」と案内すること

### 次のセッションの始め方
1. この仕様書の 2 章（決定事項）、8 章（画面）、15 章（このメモ）を読む。画面の見た目は Design キャンバス「イベント管理 画面デザイン」に合わせる
2. 手元の状態を確認する。どれも通る状態で引き継いでいる
   ```sh
   npm test               # 単体テスト（59 件）
   npm run validate       # config.yml とイベントの検証
   npm run check          # 型チェック
   export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH
   npm run test:rules     # ルール・同期・notify のテスト（62 件）
   ```
3. 次のステップの計画を提示して確認を取ってから実装する

未確認のまま残っていること：
- Deploy と CI のワークフローを GitHub 上で一度も動かしていない（push 後に確認）
- サービスアカウントのロール（上の表）は見込み。初回の実デプロイで確定させる
- 60 日問題の再有効化 API がカウントをリセットするか（9 章）。公式の情報では確かめられなかった
- 本物の Gmail での送信は未確認。手元の偽の SMTP サーバーで、送信・記録・宛先拒否・再試行・終了コードを確かめた
- `actions/configure-pages` に `pages: read` が要るか（`notify.yml` には付けた。`deploy.yml` の build ジョブは `contents: read` だけ）
- 本物の Google ログイン（承認済みドメイン、`signInWithPopup`）は未確認。エミュレーターでしか試していない
- ログイン失敗（`auth/popup-blocked`）の表示は、エミュレーターで再現できず画面では未確認

### ステップ 4：詳細ページのログイン・申込・キャンセル（完了）
エミュレーターと開発サーバーで、次を画面で確かめた：未ログイン → ログイン → 必須項目のエラー → 申込 → 再読み込み後も申込済み → キャンセル確認（Esc で閉じるとフォーカスが戻る）→ キャンセル → もう一度申し込む、申込中に満席、満席、受付終了、開催後、ログアウト、390px 幅で横にはみ出さないこと。

### ステップ 5：管理ページと CSV（完了）
エミュレーターと開発サーバーで、次を画面で確かめた：未ログイン → 一般ユーザーで「権限がありません」→ 大文字を含む管理者メールで管理画面、数字カード（申込数・受付メール・リマインド時刻）、申込者の表と送信状態、イベントの切り替え（URL も変わる）、CSV の中身（BOM・エスケープ・数式の無害化）、ログアウト、390px 幅で横にはみ出さず表だけが横スクロールすること。本物の Google ログインと、Excel で実際に開く確認はしていない。

当初のメモ：
- `app/src/pages/admin/index.astro` を新しく作る。`noindex` を付ける
- 管理者かどうかはルールに任せる。registrations の読み取りが `permission-denied` なら「権限がありません」と出す
- ルールの管理者判定はメールアドレスの完全一致。`config/admins` は小文字で同期しているので、トークンのメールに大文字が混ざると弾かれる。必要ならルール側で `request.auth.token.email.lower()` を使い、テストを足す
- 申込者の表の列は、そのイベントの `fields` から作る。Frontmatter は詳細ページと同じくビルド時に埋め込む
- CSV は BOM 付き UTF-8。値にカンマ・改行・ダブルクォートが入る場合のエスケープと、先頭が `=` `+` `-` `@` の値の扱い（CSV インジェクション対策）に注意する

### ステップ 6：`notify.ts` と `notify.yml`（完了）
エミュレーターのテスト 13 件（`tests/sync/notify.test.ts`）と、偽の SMTP サーバーでの手動確認（送信・ヘッダー・宛先拒否で終了コード 1・2 回目は未送信分だけ）を行った。

当初のメモ：
- 読み込みは `scripts/lib/load-site.ts`、Admin SDK の初期化は `scripts/sync-firestore.ts` と同じ形（ADC、`config.firebase.projectId`）。共通化するなら `scripts/lib/` に切り出す
- 送信済みの判定は `confirmationSentAt` / `remindedAt` だけで行う（13 章の将来の拡張のため）
- JST の「明日」「`reminder_hour` 以降」の判定は `app/src/lib/time.ts` に足し、単体テストを書く
- メールのテンプレートは `site/templates/*.md`。Frontmatter の読み込みは `parseFrontmatter()` を使い回せる
- `dry_run` のときは送信も書き込みもしない。最初は dry_run だけで作り、送信は後から足す
- `notify.yml` は deploy.yml と同じ認証（`google-github-actions/auth`）に加えて、`SMTP_USER` / `SMTP_PASSWORD` を渡す。`concurrency` を必ず付ける

### ステップ 7：README・UPDATING.md・サンプル
- 上の「サービスアカウントのロール」の表を README に移す（実デプロイで確かめた内容にする）
- 60 日問題：GitHub から「ワークフローが無効になります」というメールが届いたら、空コミット（`git commit --allow-empty`）を push するよう書く
- 動作確認の手順：Actions → Notify → Run workflow（dry_run にチェック）でログを見る
- 開発者向け：`npm run test:rules` には Java（21 以上）が要る
- Firestore のデータベースは先に日本のリージョンで作るよう案内する（作らずにデプロイすると `nam5` に作られる）
- UPDATING.md：`site/` 以外を差し替える手順。`package.json` の依存が変わったときは `npm install` し直すことも書く
- サンプルイベントは `site/events/` に 2 件ある（未来と過去）。内容を README の説明と合わせる
