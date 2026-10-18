# EventPost の本体を更新する

テンプレートから作ったリポジトリには、元のリポジトリ（[kwaka1208/event-post](https://github.com/kwaka1208/event-post)）の更新は自動では入りません。不具合の修正や新しい機能を取り込みたいときは、この手順で本体を差し替えてください。

## 何が差し替わるか

| 差し替える（本体） | 差し替えない（グループのもの） |
|---|---|
| `app/` `scripts/` `firebase/` `tests/` `.github/` `docs/`<br>`package.json` `package-lock.json` `vitest.config.ts` `vitest.rules.config.ts`<br>`.gitignore` `README.md` `UPDATING.md` | `site/`（設定・イベント・メール文面・画像） |

- `site/` は変わりません。イベントや設定はそのまま残ります
- 本体のファイルを自分で書き換えていた場合、その変更は消えます。残したい変更は、更新の前に控えておいてください
- テンプレートから作ったリポジトリは、元のリポジトリと git の履歴がつながっていません。`git merge` や GitHub の「Sync fork」は使えないので、下の手順で本体を丸ごと置き換えます

## 更新の前に

元のリポジトリの[コミット履歴](https://github.com/kwaka1208/event-post/commits/main)を見て、何が変わったかを確かめてください。`site/config.yml` やイベントの書き方が変わっている場合は、更新した後に自分の `site/` も合わせて直す必要があります。

## 手順

コマンドを実行する場所は、次のどちらかです。

- **手元のパソコン**：git が使えて、リポジトリを clone してある場合
- **GitHub Codespaces**：手元に git がない場合。リポジトリのページで **Code** → **Codespaces** → **Create codespace on main** を押すと、ブラウザの中に端末が開きます（個人アカウントには毎月の無料枠があります）

開いた端末で、次のコマンドを順に実行します。コマンドは bash で動かす前提です（Codespaces の端末は bash です）。macOS のターミナルは標準が zsh なので、先に `bash` と入力してから実行してください。

```bash
# 1. 元のリポジトリを upstream という名前で登録する（初回だけ）
git remote add upstream https://github.com/kwaka1208/event-post.git

# 2. 元のリポジトリの最新版を取ってくる
git fetch upstream

# 3. 本体を消してから、最新版で置き換える（元で消えたファイルも消すため、先に消す）
CORE="app scripts firebase tests .github docs package.json package-lock.json vitest.config.ts vitest.rules.config.ts .gitignore README.md UPDATING.md"
git rm -r -q --ignore-unmatch $CORE
git checkout upstream/main -- $CORE

# 4. 変わったファイルを確かめる（site/ が含まれていないこと）
git status

# 5. コミットして push する
git commit -m "Update EventPost"
git push
```

> [!NOTE]
> 手順 3 の `git checkout` で `pathspec ... did not match` と出た場合は、元のリポジトリでそのファイルがなくなっています。元のリポジトリにある最新の UPDATING.md で、`CORE` の中身を確かめてください。

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
git revert HEAD   # 直前のコミット（Update EventPost）を取り消す
git push
```

更新の後に別のコミットをしている場合は、`git log` で「Update EventPost」のコミットの ID を調べ、`git revert <ID>` としてください。
