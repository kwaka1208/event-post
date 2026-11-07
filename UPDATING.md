# EventPost の本体を更新する

テンプレートから作ったリポジトリには、元のリポジトリ（[kwaka1208/event-post](https://github.com/kwaka1208/event-post)）の更新は自動では入りません。不具合の修正や新しい機能を取り込むには、次のどちらかの方法を使います。

- **自動で PR を作る（おすすめ）**：Actions の「Update EventPost」が、元のリポジトリの最新版を取り込む PR を作ります。中身を確かめてからマージします
- **手作業で置き換える**：git のコマンドで置き換えます。自動の方法が使えないときに使います

## 何が差し替わるか

| 差し替えない（グループのもの） | 差し替える（本体） |
|---|---|
| `.eventpost-keep` と、そこに書いたパス<br>`.eventpost-version`（取り込んだ版の記録）<br>`site/`（旧版の設定。新版では使いません） | それ以外のすべて。元のリポジトリと同じ内容になり、元で消えたファイルは消えます |

- グループの設定（Firebase の値、返信先など）は、リポジトリの Variables と Secrets にあるので、更新しても変わりません。グループやイベントのデータは Firestore にあります
- `site/` は、旧版から移ったリポジトリで設定を控えておけるように残します。新版では使わないので、移ったあとは消してかまいません（[旧版（v1）から移る](#旧版v1から移る)）
- 本体のファイルを自分で書き換えていた場合、その変更は消えます。残したい変更は、更新の前に控えておいてください
- グループで足したファイルがある場合（例：独自ドメイン用の `CNAME`）は、リポジトリの一番上に `.eventpost-keep` を作り、残したいパスを 1 行に 1 つずつ書いてください。`#` から後ろはコメントです

  ```
  # グループで足したファイル
  CNAME
  extra/
  ```

- テンプレートから作ったリポジトリは、元のリポジトリと git の履歴がつながっていません。`git merge` や GitHub の「Sync fork」は使えないので、本体を丸ごと置き換えます

## 自動で PR を作る

Actions の「Update EventPost」（`.github/workflows/update.yml`）が、毎週月曜の朝と、手動で実行したときに、元のリポジトリの最新版と比べます。違いがあれば、ブランチ `eventpost-update` に置き換えたコミットを作り、PR を開きます。PR がすでにあれば、最新版で上書きします。元のリポジトリと同じ内容なら、何もしません。

### 準備（最初の 1 回だけ）

#### 1. ワークフローがあるか確かめる

リポジトリに `.github/workflows/update.yml` があるか確かめます。2026 年 11 月より前にテンプレートから作ったリポジトリにはないので、次のどちらかで入れてください。

- 下の「手作業で置き換える」で、1 回だけ本体を更新する（ワークフローも入ります）
- GitHub の画面で **Add file** → **Create new file** を選び、名前に `.github/workflows/update.yml` と入力して、元のリポジトリの [update.yml](https://github.com/kwaka1208/event-post/blob/main/.github/workflows/update.yml) の中身を貼り付けてコミットする

#### 2. トークンを作る

Actions に最初から用意されているトークンでは、`.github/workflows/` の変更を push できません。また、作った PR で CI が動きません。そのため、このリポジトリだけを操作できるトークンを作ります。

1. GitHub の右上のアイコン → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token** を選びます。
2. 次のように設定して、**Generate token** を押します。
   - **Token name**：例「EventPost の更新（リポジトリ名）」
   - **Expiration**：有効期限。期限が切れたら作り直します（下の「トークンの期限が切れたとき」）
   - **Resource owner**：リポジトリの持ち主（個人または組織）
   - **Repository access**：**Only select repositories** で、このリポジトリだけを選ぶ
   - **Permissions** → **Repository permissions**：**Contents**、**Pull requests**、**Workflows** の 3 つを **Read and write** にする
3. 表示されたトークン（`github_pat_` で始まる文字列）をコピーします。この画面を閉じると二度と表示されません。

> [!NOTE]
> 組織のリポジトリで、トークンの作成や利用が制限されている場合は、組織の管理者に許可してもらってください。

#### 3. トークンを Secret に登録する

リポジトリの **Settings** → **Secrets and variables** → **Actions** → **New repository secret** で、名前を `EVENTPOST_UPDATE_TOKEN`、値をコピーしたトークンにして登録します。

#### 4. 試しに動かす

**Actions** → **Update EventPost** → **Run workflow** を押します。元のリポジトリと違いがあれば、PR が開きます。

### 更新が届いたら

1. PR の説明にある「何が変わったか」のリンクで、元のリポジトリの変更を確かめます。旧版（v1）から新版へ切り替わる PR の場合は、マージする前に [旧版（v1）から移る](#旧版v1から移る) の準備をしてください
2. PR の CI が成功していることを確かめます
3. PR をマージします
4. 下の「更新した後に」の確認をします

ブランチやタグを指定して取り込みたいときは、**Run workflow** の「取り込む元のリポジトリのブランチまたはタグ」に入力します。

### トークンの期限が切れたとき

「Update EventPost」が権限のエラーで失敗するようになります。手順 2 でトークンを作り直し、手順 3 の Secret を新しい値で更新してください（Secret の画面で `EVENTPOST_UPDATE_TOKEN` の鉛筆のアイコンを押します）。

## 手作業で置き換える

コマンドを実行する場所は、次のどちらかです。

- **手元のパソコン**：git が使えて、リポジトリを clone してある場合
- **GitHub Codespaces**：手元に git がない場合。リポジトリのページで **Code** → **Codespaces** → **Create codespace on main** を押すと、ブラウザの中に端末が開きます（個人アカウントには毎月の無料枠があります）

開いた端末で、次のコマンドを順に実行します。コマンドは bash で動かす前提です（Codespaces の端末は bash です）。macOS のターミナルは標準が zsh なので、先に `bash` と入力してから実行してください。

```bash
# 1. 元のリポジトリの最新版を取ってくる
git fetch https://github.com/kwaka1208/event-post.git main
```

```bash
# 2. 本体を消してから、最新版で置き換える（元で消えたファイルも消すため、先に消す）
#    .eventpost-keep を作っている場合は、そこに書いたパスも :(top,exclude)パス の形で足す
KEEP=(":(top,exclude)site" ":(top,exclude).eventpost-keep" ":(top,exclude).eventpost-version")
git rm -r -q --ignore-unmatch -- . "${KEEP[@]}"
git checkout FETCH_HEAD -- . "${KEEP[@]}"
echo "kwaka1208/event-post@$(git rev-parse FETCH_HEAD)" > .eventpost-version
git add .eventpost-version
```

```bash
# 3. 変わったファイルを確かめる（残したいファイルが消えていないこと）
git status
```

```bash
# 4. コミットして push する
git commit -m "Update EventPost"
git push
```

> [!NOTE]
> Codespaces から push したときに、`.github/workflows/` の変更が権限の不足で拒否されることがあります。その場合は、手元のパソコンの git で同じ手順を行ってください。

Codespaces を使い終わったら、リポジトリのページの **Code** → **Codespaces** から削除しておくと、無料枠を使い切らずに済みます。

## 更新した後に

1. **Actions** タブで、Deploy が成功することを確かめます。
   - 「セットアップが終わっていないため、デプロイしませんでした」と出たときは、ログに出ている Secret か Variable を登録してから、Deploy を実行し直してください
2. サイトを開き、ログインしてイベントの一覧が出ることを確かめます。
3. **Actions** → **Notify** → **Run workflow** を dry_run のまま実行し、エラーが出ないことを確かめます。

手元で開発している場合は、`package.json` の依存が変わっていることがあるので、`npm install` をやり直してください。

## 旧版（v1）から移る

2026 年 11 月より前にテンプレートから作ったリポジトリは、旧版（Astro で作った公開サイト。タグ `v1`）です。新版では、しくみが次のように変わります。

| | 旧版（v1） | 新版 |
|---|---|---|
| 見られる人 | 誰でも（申込にはログインが必要） | トップページのほかは、承認されたメンバーだけ |
| イベントの作り方 | `site/events/` に Markdown を書いて push | 管理者が画面から作る |
| 管理者 | `site/config.yml` の `admins` | グループを作った特権管理者が、画面で承認する |
| 設定 | `site/config.yml` | リポジトリの Variables と Secrets |
| 申込フォームの追加項目 | あり（`fields`） | なし |
| 申込データ | 開催から一定日数で自動削除 | 自動では削除しない（マイページで過去の参加を見せるため） |

旧版のデータ（イベントと申込、管理者の一覧）は新版では使えないので、移るときに消します。**旧版の申込の記録も消えます。**残したい場合は、移る前に旧版の管理ページから CSV をダウンロードしておいてください。これから開催するイベントがない時期に移るのがおすすめです。

### 1. 移る前に

新版への切り替えを含む更新の PR（または手作業の更新）をマージする前に、次を済ませます。

1. `site/config.yml` の `firebase` にある 4 つの値を、リポジトリの **Settings** → **Secrets and variables** → **Actions** → **Variables** に登録します。

   | `site/config.yml` | Variable の名前 |
   |---|---|
   | `firebase.apiKey` | `FIREBASE_API_KEY` |
   | `firebase.authDomain` | `FIREBASE_AUTH_DOMAIN` |
   | `firebase.projectId` | `FIREBASE_PROJECT_ID` |
   | `firebase.appId` | `FIREBASE_APP_ID` |

2. 必要なら、次の Variables も登録します（[README の「設定（Variables）」](README.md#設定variables)）。
   - `REPLY_TO`：旧版では `group.contact_email` が返信先でした。同じにするなら、そのアドレスを登録します
   - `REMINDER_HOUR`：旧版の `mail.reminder_hour` を 18 以外にしていたら、その値を登録します
   - `SMTP_HOST` / `SMTP_PORT`：旧版の `mail.smtp_host` / `mail.smtp_port` を変えていたら、その値を登録します
3. Secrets（`FIREBASE_SERVICE_ACCOUNT`、`SMTP_USER`、`SMTP_PASSWORD`）とサービスアカウントのロールは、旧版と同じものをそのまま使います。

### 2. 切り替える

1. 更新の PR をマージします。Deploy が新しいルールを Firestore に反映し、新版の画面を公開します。この時点で、旧版のサイトは見られなくなります。
2. **Actions** → **Clean up old data** → **Run workflow** を、**dry_run** にチェックが入ったまま実行します。ログに、消す予定の旧版のイベントと申込の件数が出ます。
3. 件数を確かめたら、**dry_run** のチェックを外して、もう一度実行します。旧版のイベントと申込、管理者の一覧が消えます。新版のデータには触りません。

### 3. 新版を始める

1. サイトを開き、**グループを作成** から、特権管理者になる人の Google アカウントでグループを作ります（[README のセットアップの手順 9](README.md#9-グループを作る)）。
2. ほかの管理者やメンバーには、サイトから参加を申し込んでもらい、承認します。旧版の `admins` は引き継がれません。
3. これから開催するイベントがあれば、**イベント管理** から作り直し、メンバーに申し込み直してもらいます。
4. `site/` は新版では使わないので、消してかまいません（GitHub の画面で `site/` の中のファイルを消してコミットします）。

### 旧版に留まりたいとき

新版に移らない場合は、更新の PR をマージせずに閉じ、**Actions** → **Update EventPost** → **Disable workflow** で、更新の取り込みを止めてください。旧版の最後の状態は、元のリポジトリのタグ `v1` にあります。

## 元に戻したいとき

更新のコミットを取り消すコミットを作って push します。

```bash
git revert HEAD   # 直前のコミット（更新のコミット）を取り消す
git push
```

更新の後に別のコミットをしている場合は、`git log` で更新のコミットの ID を調べ、`git revert <ID>` としてください。自動の PR をマージした場合は、GitHub の PR の画面にある **Revert** ボタンでも取り消せます。
