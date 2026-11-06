# EventPost の本体を更新する

テンプレートから作ったリポジトリには、元のリポジトリ（[kwaka1208/event-post](https://github.com/kwaka1208/event-post)）の更新は自動では入りません。不具合の修正や新しい機能を取り込むには、次のどちらかの方法を使います。

- **自動で PR を作る（おすすめ）**：Actions の「Update EventPost」が、元のリポジトリの最新版を取り込む PR を作ります。中身を確かめてからマージします
- **手作業で置き換える**：git のコマンドで置き換えます。自動の方法が使えないときに使います

## 何が差し替わるか

| 差し替えない（グループのもの） | 差し替える（本体） |
|---|---|
| `site/`（設定・イベント・メール文面・画像）<br>`.eventpost-keep` と、そこに書いたパス<br>`.eventpost-version`（取り込んだ版の記録） | それ以外のすべて。元のリポジトリと同じ内容になり、元で消えたファイルは消えます |

- `site/` は変わりません。イベントや設定はそのまま残ります
- 本体のファイルを自分で書き換えていた場合、その変更は消えます。残したい変更は、更新の前に控えておいてください
- `site/` の外に、グループで足したファイルがある場合（例：独自ドメイン用の `CNAME`）は、リポジトリの一番上に `.eventpost-keep` を作り、残したいパスを 1 行に 1 つずつ書いてください。`#` から後ろはコメントです

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

1. PR の説明にある「何が変わったか」のリンクで、元のリポジトリの変更を確かめます。`site/config.yml` やイベントの書き方が変わっている場合は、自分の `site/` も直す必要があります
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
# 3. 変わったファイルを確かめる（site/ が含まれていないこと）
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
   - 「config.yml とイベントを検証」で失敗した場合は、`site/` の書き方が変わっています。ログに出ているファイル名と項目を見て直し、もう一度 push してください
2. サイトを開き、イベントのページと申込が動くことを確かめます。
3. **Actions** → **Notify** → **Run workflow** を dry_run のまま実行し、エラーが出ないことを確かめます。

手元で開発している場合は、`package.json` の依存が変わっていることがあるので、`npm install` をやり直してください。

## 元に戻したいとき

更新のコミットを取り消すコミットを作って push します。

```bash
git revert HEAD   # 直前のコミット（更新のコミット）を取り消す
git push
```

更新の後に別のコミットをしている場合は、`git log` で更新のコミットの ID を調べ、`git revert <ID>` としてください。自動の PR をマージした場合は、GitHub の PR の画面にある **Revert** ボタンでも取り消せます。
