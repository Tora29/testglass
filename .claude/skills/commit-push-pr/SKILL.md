---
name: commit-push-pr
description: 作業中の変更からブランチ作成・コミット・push・PR作成までを行い、ユーザーがマージして「完了」と伝えたら main に戻してローカルを片付ける。
disable-model-invocation: true
effort: low
---

# commit-push-pr

変更をコミットして PR を作成し、マージ後に後片付けをする。

ブランチ名・コミットメッセージ・PR のタイトルと本文・ラベルの書き方は `.claude/rules/git-workflow.md` に従う。このリポジトリのマージ済み PR は、ポートフォリオ（Tora29/my-portfolio）の Activity として公開されるため、タイトルと本文の最初の段落は閲覧者向けに書く。

## フェーズ1：PR を作成する

### 1. 現状確認

```bash
git status
git branch --show-current
git diff --stat
git diff
```

- 変更がなければ、その旨を伝えて終了する

### 1-2. gh のアカウント確認

`gh` の操作中アカウントが、リポジトリの所有者と一致しているか確認する。

```bash
gh api user --jq .login
gh repo view --json owner --jq .owner.login
```

- 一致しない場合は、以降の手順に進まず、`! gh auth switch --user <所有者>` の実行をユーザーに依頼する
- 切り替え後に再度確認してから進む

### 2. 公開してよい内容か確認

差分に次のものが含まれていないか確認し、含まれていればコミットせずユーザーに伝える。

- `.env`・npm のトークン・API キーなどの秘密情報
- 手元のパス（`/Users/…` など）、未公開の情報、ほかの人の個人情報（`git-workflow.md` の「公開してよい情報だけを書く」）
- `.gitignore` の対象（`dist/`・`demo/`・`testglass/` などの生成物）。強制追加しない

### 2-2. 動作確認

`verify-app` skill の手順でチェックを実行する。

- 1つでも失敗した場合は、コミットに進まず結果をユーザーに伝える
- 最後の変更の後に同じ会話の中で `verify-app` を実行し、すべて通っている場合は省略してよい
- `package.json` の `bin`・`files`・`exports` を変えたときは、`npm publish --dry-run` で警告が出ないことと、公開されるファイルの一覧も確かめる（`npm publish` が不正な項目を黙って消すことがあるため）

### 3. ブランチを決める

- **main にいる場合**：差分から type と内容を判断してブランチ名を決め、作成する（形式は `git-workflow.md`）

  ```bash
  git switch -c <type>/<短い説明>
  ```

- **作業ブランチにいる場合**：そのブランチを使う。ただし、そのブランチの PR がマージ済みなら、main に戻って新しいブランチを切る

差分に無関係な変更が混ざっている場合（例：機能追加と README の修正）は、PR を分けるかユーザーに確認する。`git-workflow.md` の type ごとに Activity に載るかが変わるため、type の違う変更は基本的に分ける。

### 4. コミット

```bash
git add <対象ファイル>
git commit -F - <<'EOF'
<type>(<scope>): <英語の件名>

<日本語の本文：何を・なぜ変えたか>

Co-Authored-By: …
EOF
```

- `git add -A` / `git add .` を使わず、対象ファイルを指定する
- 件名は英語の命令形、本文は日本語（箇条書きでよい）。scope は `git-workflow.md` の表から選ぶ

### 5. push

```bash
git push -u origin <branch-name>
```

### 6. PR 作成

```bash
gh pr create --base main --head <branch-name> --title "<title>" --body-file - <<'EOF'
<body>
EOF
```

- タイトル：`<type>(<scope>): <閲覧者が読んで分かる日本語>`（Activity の見出しになる）
- 本文：最初の段落に「何を変えて、使う人にとって何が良くなったか」を「〜した。」の形で 1〜2 文。見出しから始めない。実装の詳細は見出し以降に書く
  - `## 変更内容` のあとに `## 確認結果（verify-app）` を置き、verify-app の報告の表を載せる。その変更に固有の確認（`npm publish --dry-run` など）があれば表に行を足す
- ラベル：Activity に載せたくない feat / fix などには `activity:skip`、作品と異なる技術を示したい場合は `tech:<id>` を `--label` で付ける。付けるかどうか迷う場合はユーザーに確認する
  - style / test / build / ci / chore は自動で除外されるので、`activity:skip` は付けない
  - ラベルがリポジトリに無いと `gh pr create` が失敗する。無ければ作成してよいかユーザーに確認してから `gh label create` で作る

### 6-2. CI を待つ

```bash
gh pr checks <branch-name> --watch --interval 15
```

- main の ruleset で `Verify (Node 22)` と `Verify (Node 24)` が必須になっている。失敗したらログを確かめて直す
- PR を作った直後はチェックがまだ登録されておらず、`--watch` がすぐ終わることがある。その場合は少し待ってからやり直す

### 7. ユーザーに伝える

- PR の URL
- 動作確認の結果（verify-app の報告の表）と CI の結果
- Activity として公開される見出しと要約（タイトルの `: ` 以降と本文の最初の段落）。自動で除外される type ならその旨
- 「マージしたら『完了』と伝えてください」

マージはユーザーが行う。自分で `gh pr merge` を実行しない。

## フェーズ2：マージ後の後片付け（ユーザーが「完了」と伝えたとき）

### 1. マージを確認する

フェーズ1の「1-2. gh のアカウント確認」と同じ確認を先に行う。

```bash
gh pr view <branch-name> --json number,state,mergedAt,url
```

- `state` が `MERGED` でなければ、その旨を伝えて何もしない

### 2. main に戻して片付ける

```bash
git switch main
git pull --ff-only
git fetch --prune
git branch -D <branch-name>
```

- このリポジトリはマージコミットでマージしているが、squash マージされた場合は作業ブランチのコミットが main に含まれず `git branch -d` が失敗する。手順1でマージ済みを確認したうえで `-D` で削除する
- リモートの作業ブランチは、GitHub の「Automatically delete head branches」が有効なので自動で消える。残っている場合だけ `git push origin --delete <branch-name>` で消す

### 3. 結果を伝える

main が最新になったこと、削除したブランチ名を伝える。

## 注意

- main へ直接 push しない
- `--force` / `--no-verify` を使わない
- `gh` にログインしていない場合は、`! gh auth login` の実行をユーザーに依頼する
- `gh` の操作中アカウントを自分で切り替えない（切り替えはユーザーが行う）
- `npm publish` やリリースの作成はこの skill の対象外。頼まれても、取り消しにくい操作なのでユーザーに実行してもらう
