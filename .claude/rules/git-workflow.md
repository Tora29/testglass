# Git・Pull Request ルール

このリポジトリのマージ済み PR は、ポートフォリオ（[Tora29/my-portfolio](https://github.com/Tora29/my-portfolio)）の Activity として公開される。PR のタイトルと本文は、閲覧者（採用担当・エンジニア）が読む前提で書く。

- Activity に使われるのは PR のタイトルと本文の最初の段落。コミットメッセージは使われないが、PR から見られるので同じ前提で書く
- マージ後でも PR のタイトル・本文は直せる。main に入ったコミットは直さない（履歴を書き換えないため）

## ブランチ

- main へ直接コミットしない。作業はブランチを切って PR でマージする
- ブランチ名：`<type>/<短い説明>`（例：`feat/md-csv-output`、`docs/cli-options`）

## type と scope

Conventional Commits の type を使う。

| type | 用途 | Activity |
| --- | --- | --- |
| feat | 機能の追加・見た目の変更 | 載る |
| fix | 不具合の修正 | 載る |
| perf | 性能の改善 | 載る |
| refactor | 挙動を変えない改善 | 載る |
| docs | README などドキュメントの追加・修正 | 載る |
| style | 見た目に影響しないコード整形 | 載らない |
| test | テストの追加・修正 | 載らない |
| build / ci | ビルド設定・ワークフロー | 載らない |
| chore | 上記以外の雑務（依存関係の更新、`.claude/` の設定など） | 載らない |

scope は変更した場所にする。

| scope | 対象 |
| --- | --- |
| `html` | HTML レポート（`src/output/html/`） |
| `output` | 出力形式・出力アダプタ（`src/output/`） |
| `input` | テストの解析（`src/input/`・`src/core/`） |
| `rules` | 警告のルール（`src/rules/`） |
| `cli` | CLI（`src/cli/`） |
| `schema` | `spec.json` の形式（`src/schema/`） |
| `readme` | README |
| `repo` | リポジトリ全体の設定・ルール（`.claude/`・`.github/`・Biome など） |
| `deps` / `deps-dev` | 依存関係の更新（Dependabot が付ける。`chore(deps)`・`chore(deps-dev)`（devDependencies）・`ci(deps)`（GitHub Actions）） |

## コミットメッセージ

```text
<type>(<scope>): <英語の件名>

<日本語の本文：何を・なぜ変えたか>

Co-Authored-By: …
```

- 件名は英語で、命令形で簡潔に書く（例：`feat(output): Add Markdown and CSV output formats`）
- 本文は日本語で書く。箇条書きでよい

## Pull Request

### タイトル

コミットメッセージと同じ `<type>(<scope>): ` の形式にし、後ろを**閲覧者が読んで分かる日本語**で書く。この部分が Activity の見出しになる。

```text
○ feat(output): テスト仕様書を Markdown と CSV でも出力できるようにする
○ feat(html): レポートの文字を一回り大きくして読みやすくする
× feat(output): csv.ts と markdown.ts を追加           # 実装の言葉になっている
× 出力形式に Markdown と CSV を追加する               # type がない（Activity の種類が決まらない）
```

### 本文

最初の段落が Activity の要約になる（最初の見出しより前・200 字まで）。何を変えて、使う人にとって何が良くなったかを、「〜した。」の形で 1〜2 文で書く。

```markdown
テスト仕様書を、HTML に加えて Markdown と CSV でも出力できるようにした。Markdown は PR やドキュメントにそのまま貼れ、CSV は Excel で絞り込みや並べ替えができる。

## 変更内容

- …

## 確認結果（verify-app）

| 段階 | 結果 | 詳細 |
| --- | --- | --- |
| … | | |
```

- 本文を `## 概要` などの見出しから始めない（要約が取れず、タイトルが代わりに使われる）
- 最初の段落に、実装の詳細・作業メモ（「PR #3 のマージ後に追加した」など）・箇条書き・表を書かない。それらは見出しより後ろに書く
- 公開してよい情報だけを書く（手元のパス、未公開の情報、ほかの人の個人情報を書かない）

### ラベル

| ラベル | 意味 |
| --- | --- |
| `activity:skip` | Activity に載せない（type が feat / fix などでも除外する） |
| `tech:<id>` | Activity の技術を指定する（id は my-portfolio の `data/tech.yml`）。付けなければ作品の技術を引き継ぐ |

- style / test / build / ci / chore の PR は自動で除外されるため、`activity:skip` は不要
