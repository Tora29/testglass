---
name: verify-app
description: testglass の変更が壊れていないかを確かめる。lint・format（Biome）、型チェック、テスト、ビルド、デモの生成を順に実行し、HTML レポートを変えたときはスクリーンショットで見た目とアクセシビリティも確認する。コードを変更したあと・コミットの前・「動作確認して」「検証して」と言われたときに使う。
---

# verify-app

testglass の変更を、次の順で確かめる。前の段階が失敗したら、直してからその段階をやり直す（先へ進まない）。

## 1. lint・format（Biome）

```sh
npm run lint
```

- 整形の差分だけなら `npm run format` で直し、もう一度 `npm run lint` を実行する
- lint の違反はコードを直す。ルールを外すのは、意図的な書き方であると説明できるときだけにする
  - 外すときは `biome.jsonc` の `overrides` にファイル単位で書き、理由をコメントに残す
  - 1 か所だけなら `// biome-ignore lint/<group>/<rule>: <理由>` を使う
- `src/output/html/assets/client.js` は HTML に埋め込むため ES5 で書く（`var` / `function` / 文字列連結。`?.`・アロー関数・template 文字列は使わない）。lint に言われても書き換えない
- `test/fixtures/` と `examples/en/`（その英語版）は「問題のあるテスト」の見本なので、lint・整形の対象外。直さない

## 2. 型チェック

```sh
npm run typecheck
```

## 3. テスト

```sh
npm test
```

- 失敗したら、失敗したテスト名と期待値・実際の値を報告する
- 期待値を書き換えて通すのは、仕様を変えたときだけにする（変えたことを報告に書く）

## 4. ビルドとデモの生成

```sh
npm run build && npm run demo
```

- `demo` は `test/fixtures` を解析して `demo/spec.json` と `demo/spec.html` を、`examples/en` を英語で `demo/en/spec.json` と `demo/en/spec.html` を作る
- 「警告: error N 件 / warn N 件」は fixtures の問題を検出した結果で、正常な出力。ただし件数が変更前と変わったなら、その理由を確かめる（ルールや解析の変更によるものか）。日本語と英語の件数は同じになる

1〜4 は `npm run verify` でまとめて実行できる。

## 5. 見た目の確認（`src/output/html/` を変えたときだけ）

```sh
.claude/skills/verify-app/screenshot.sh <スクラッチパッドのディレクトリ>
```

`dark.png` / `light.png` / `narrow.png`（幅 400px）ができるので、Read で開いて確かめる。

- 変更した部分が意図どおりに表示されているか
- ダーク・ライトの両方で文字が読めるか、狭い画面で横にはみ出していないか
- `.claude/rules/accessibility.md` を満たしているか（文字の大きさの下限、`--ink-4` を文字に使っていないか、選択中の状態が背景色だけになっていないか）

クリックなどの操作を確かめるときは、`demo/spec.html` をスクラッチパッドにコピーし、`</body>` の前に操作する `<script>` を入れて、`--dump-dom` で結果の DOM（`aria-pressed`・`hidden` など）を確かめる。

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --virtual-time-budget=2000 --dump-dom "file://<コピーした HTML>"
```

Chrome が無い環境では 5 を飛ばし、飛ばしたことを報告に書く。

## 報告

最後に、段階ごとの結果を次の表で報告する。

- 結果は ✅（通った）・❌（失敗した）・⏭️（飛ばした）のどれかにする
- 詳細には件数や確認した内容を短く書く。飛ばした段階には、その理由を書く
- 自動で直したもの（format など）と、手で直したものは分けて書く
- 表のあとに、失敗や件数の変化など、ユーザーが判断すべきことがあれば書く

```markdown
| 段階 | 結果 | 詳細 |
| --- | --- | --- |
| lint・format | ✅ | 37 ファイル。format で 2 ファイルを自動整形 |
| 型チェック | ✅ | |
| テスト | ✅ | 52 件 |
| ビルド・デモ | ✅ | error 4 / warn 23（変更前と同じ） |
| 見た目 | ✅ | ダーク・ライト・幅 400px を確認。絞り込みの操作も確認 |
| 手で直したもの | — | なし |
```
