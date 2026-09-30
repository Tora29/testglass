# testglass

テストコードを**静的解析**して、人間がレビューするための「テスト仕様書」（単一ファイルの HTML）を生成します。

AI にテストを書かせると、量が多く、実装まで全部は読み切れません。testglass は、せめてテストだけは人間がしっかりレビューできるように、次の観点を1画面にまとめます。

- **テスト名**（何を確かめると主張しているか）
- **手順**（実際に何をしているか）
- **期待結果**（何を検証しているか）
- **警告**（アサーションが無い、`.only` が残っている、モックの呼び出ししか見ていない、など）

「テスト名と中身が一致しているか」を、ソースを開かずに確かめられることが目的です。

```
テスト名                              手順                          期待結果              警告
正しいパスワードでログインに成功する  1. goto /login                アサーションなし      ● アサーションなし
                                      2. fill [パスワード] ← wrong                        ● 固定時間の待ち
                                      3. click button[ログイン]
                                      4. waitForTimeout 3000
```

> テストは実行しません。`it.each` のように実行時に展開されるテストは、「動的生成」の警告を出すだけです。

## 使い方

Node.js 20 以上（Bun でも動きます）。

```sh
npm i -D testglass

# テストを読んで spec.json を書き、HTML を生成する（既定の出力先は testglass/）
npx testglass

# 段階ごとに実行する
npx testglass collect --out testglass/spec.json      # ① 読む → ② JSON に保存（毎回上書き）
npx testglass render testglass/spec.json --format html  # ③ JSON から HTML を生成
```

生成された `testglass/spec.html` をブラウザで開きます。CSS・JS・データをすべて埋め込んだ単一ファイルなので、そのまま共有したり CI の成果物にしたりできます。

### オプション

| オプション | 説明 |
|---|---|
| `--root <dir>` | 解析するルート（既定: カレントディレクトリ）。`spec.json` のパスはここからの相対になる |
| `--out <file>` | `spec.json` の出力先（既定: `testglass/spec.json`） |
| `--format <names>` | 出力形式。カンマ区切り（既定: `html`） |
| `--out-dir <dir>` | 成果物の出力先（既定: `spec.json` と同じディレクトリ） |
| `--config <file>` | 設定ファイル（既定: ルートの `testglass.config.{mjs,js,json}`） |
| `--fail-on <level>` | `error` / `warn` の警告が1件でもあれば終了コード 1 を返す（CI 用） |

`npx testglass schema` で、`spec.json` の JSON Schema を出力します（パッケージの `testglass/schema.json` にも同じものが入っています）。

### HTML の構成

テスト仕様書の罫線の表を、細く薄い線と落ち着いた配色で出力します。強弱は文字の濃さで付け、色は判定（要修正・要確認）と選択中の状態にだけ使います。

- **上部の固定バー**：判定（すべて／要修正／要確認／問題なし）の切り替えと件数、検索、フレームワーク、表示テーマ
- **見出し**：作成日時・件数と、指摘の種類ごとのチップ。チップをクリックすると、その指摘があるテストに絞り込む
- **本文**：ファイルごとに「項番／テスト名／手順／期待結果／判定」の表を並べる。describe は表の中の区切り行になる（狭い画面では1件ずつ縦に並べる）
  - 判定は、テストについた警告のうち最も重いもので決まる（`error` → 要修正、`warn` → 要確認、警告なし → 問題なし）
  - Playwright の操作は「入力」「クリック」などの日本語で表示する（`spec.json` の中身はコード寄りの表記のまま）
- **行を開いた詳細**：指摘ごとに内容・理由・対処と該当行へのリンク、その下にソース（検証している行と指摘のある行に色がつく）
- ライト／ダーク（既定は OS の設定に従う）。印刷時は固定バーを隠す。`spec.html#t-<テストID>` で特定のテストを開いた状態で表示できる

## 対応フレームワーク

| 入力アダプタ | 対象ファイル |
|---|---|
| `vitest` | `*.test.*` / `*.spec.*` のうち、`vitest` を import しているもの。import していなくても（globals モード）、他のランナーの import が無ければ対象にする |
| `playwright` | `@playwright/test` を import しているもの。自作 fixtures 経由（`import { test } from "./fixtures"`）でも、本体が `({ page })` などを受け取っていれば対象にする |

自動判定が外れる場合は、設定の `frameworks` でパスを指定します。

### 手順（steps）の抽出方法

手順は、LLM を使わずに構文木からルールで組み立てます。同じコードからは常に同じ結果が出ます。

**Playwright** は次の順で、最初に見つかったものを使います。

1. `test.step('…')` のタイトル（入れ子は字下げ）
2. 操作の呼び出し（`goto` / `click` / `fill` / `press` / `check` / `selectOption` / `hover` / `dragTo` / `waitForTimeout` など）

   | コード | 手順 |
   |---|---|
   | `page.goto('/login')` | `goto /login` |
   | `page.getByLabel('メール').fill('a@b.c')` | `fill [メール] ← a@b.c` |
   | `page.getByRole('button', { name: 'ログイン' }).click()` | `click button[ログイン]` |
   | `page.getByText('保存').click()` | `click text[保存]` |
   | `page.locator('.row').nth(2).click()` | `click .row >> nth(2)` |
   | `page.keyboard.press('Enter')` | `keyboard.press Enter` |

3. 上のどちらも無ければ（API テストなど）、Vitest と同じ「文の1行化」

**Vitest** は、テスト本体の直下にある文のうち、アサーション以外を上から順に1行ずつ要約します。

- 改行と余分な空白を詰め、80 文字を超える部分は `…` で省略する
- `if` / `for` / `try` などは `if (cond) { … }` のように本体を省略する
- モックの設定（`vi.fn` / `vi.spyOn` / `vi.mocked(x).mockResolvedValue(…)` など）は `mock: api.get` のように対象だけを示す
- コメントは手順にしません。AI が書いた「それらしいコメント」をそのまま信じないためです。コメントは、行を展開したときのソースで確認できます
- ヘルパー関数の中までは追いません（`login(page)` はそのまま1行で出ます）

## 警告ルール

| ルール | 既定 | 内容 |
|---|---|---|
| `no-assertions` | error | アサーション（expect など）が1件もない（`.todo` は除く） |
| `focused-test` | error | `.only` が残っている |
| `skipped-test` | warn | `.skip` / `.fixme` / `.todo` が残っている（`describe.skip` の配下も含む） |
| `weak-assertions-only` | warn | `toBeTruthy` / `toBeFalsy` / `toBeDefined` / `not.toBeNull` など、真偽・存在の確認だけで検証している |
| `snapshot-only` | warn | スナップショット（`toMatchSnapshot` / `toHaveScreenshot` など）の比較だけで検証している |
| `mock-calls-only` | warn | `toHaveBeenCalledWith` などモックの呼び出し検証だけで、結果（戻り値や状態）を見ていない |
| `conditional-assertion` | warn | `if` / 三項演算子 / `&&` / `switch` / `catch` の中にアサーションがあり、実行されない場合がある |
| `fixed-wait` | warn | `waitForTimeout(…)` / `sleep(1000)` / `new Promise(r => setTimeout(r, …))` などの固定時間の待ち |
| `dynamic-test` | warn | `it.each` / `test.for`、ループの中での宣言、式で組み立てたテスト名、本体に関数参照を渡しているもの。静的解析では展開しない |
| `duplicate-title` | warn | 同じ describe の中に同名のテストがある |
| `duplicate-body` | warn | 本体（コメント・空白を除く）が同一のテストがある（ファイルをまたいで判定） |

## 設定

ルートに `testglass.config.json`（または `.mjs` / `.js`）を置きます。

```json
{
  "include": ["src/**/*.test.ts", "e2e/**/*.spec.ts"],
  "exclude": ["**/node_modules/**"],
  "frameworks": { "playwright": ["e2e/**"] },
  "rules": {
    "snapshot-only": "off",
    "fixed-wait": "error"
  },
  "out": "docs/testglass/spec.json",
  "format": ["html"],
  "outputOptions": { "html": { "title": "決済サービスのテスト仕様書" } }
}
```

| キー | 説明 |
|---|---|
| `include` / `exclude` | 解析対象の glob（既定: `**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`。`node_modules` / `dist` / `build` / `coverage` は除外） |
| `frameworks` | アダプタ名 → そのアダプタで必ず解析するファイルの glob（自動判定より優先） |
| `rules` | ルールID → `"off"` / `"warn"` / `"error"`。未知の ID はエラーになる |
| `out` / `outDir` | `spec.json` と成果物の出力先（ルートからの相対） |
| `format` | 出力形式 |
| `outputOptions` | 出力アダプタごとのオプション（HTML は `title` と `fileName`） |
| `inputAdapters` / `outputAdapters` | 独自のアダプタ（JS の設定ファイルでのみ指定できる） |

## 中間 JSON（spec.json）

処理は「① テストを読む → ② 中間 JSON に保存 → ③ JSON から成果物を生成」の3段構成です。`spec.json` は毎回その時点の断面で**上書き**し、履歴は持ちません。差分が必要なら、2つの `spec.json` を比べます。

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-29T10:00:00+09:00",
  "files": [
    {
      "path": "tests/e2e/login.spec.ts",
      "framework": "playwright",
      "tests": [
        {
          "id": "ef8980122ef91742",
          "suites": ["ログイン"],
          "title": "正しいパスワードで成功する",
          "location": { "line": 12, "column": 3 },
          "modifiers": [],
          "steps": ["ログイン画面を開く", "認証情報を入力"],
          "assertions": [{ "line": 20, "text": "expect(page).toHaveURL('/home')" }],
          "warnings": [],
          "source": "test('正しいパスワードで成功する', async ({ page }) => { … })",
          "fingerprint": "5d0c5e1f2a9b7c30"
        }
      ]
    }
  ]
}
```

| フィールド | 説明 |
|---|---|
| `files[].path` | ルートからの相対パス（`/` 区切り）。`files` はパスの昇順 |
| `files[].framework` | 解析した入力アダプタの名前 |
| `tests[].id` | 「ファイルパス＋describe 階層＋テスト名」のハッシュ。テスト名が変われば別のテストになる。同名のテストが複数あるときは、2件目以降に出現順の番号を加えて計算する |
| `tests[].suites` | 外側から順の describe のタイトル |
| `tests[].location` | テスト宣言の位置（行・列とも1始まり） |
| `tests[].modifiers` | `"skip"` / `"only"` / `"todo"` / `"each"`。外側の describe から引き継いだものも含む。Playwright の `fixme` は `"skip"` |
| `tests[].steps` | 手順（上記のルールで要約したもの）。`test.step` の入れ子は先頭の空白2つ分ずつ字下げする |
| `tests[].assertions` | アサーションの行と式（空白は詰める）。`test.step` やコールバックの中にあるものも含む |
| `tests[].warnings` | `{ rule, severity, message, line? }`。`line` は警告の根拠になった行 |
| `tests[].source` | テスト宣言全体のソース（字下げは戻してある） |
| `tests[].fingerprint` | 本体をコメント・空白を除いて正規化したハッシュ（任意）。重複検出に使う。2断面の比較で「名前だけ変わったテスト」を追跡するのにも使える |

型定義は `import type { SpecJson } from "testglass"`、JSON Schema は `testglass/schema.json` から使えます。

## アダプタの追加

入力も出力もアダプタ方式です。フレームワークや出力形式は、アダプタを1つ足すだけで増やせます。

```ts
export interface InputAdapter {
  name: string;                                      // "vitest" | "playwright" | ...
  match(filePath: string, source: string): boolean;  // 対象ファイルか判定
  parse(filePath: string, source: string): TestFile; // 共通形式に変換
}

export interface OutputAdapter<Options = unknown> {
  name: string;                                      // "html" | "markdown" | ...
  render(spec: SpecJson, options?: Options): { path: string; content: string }[];
}
```

`match` がパスに加えてソースも受け取るのは、Vitest と Playwright がどちらも `*.spec.ts` を使い、import 元を見ないと区別できないためです。

### 出力アダプタの例（Markdown）

```js
// testglass.config.mjs
import { defineConfig } from "testglass";

const markdown = {
  name: "markdown",
  render(spec) {
    const lines = ["# テスト仕様書", ""];
    for (const file of spec.files) {
      lines.push(`## ${file.path}`, "", "| テスト | 手順 | 期待結果 | 警告 |", "|---|---|---|---|");
      for (const t of file.tests) {
        const cell = (xs) => xs.join("<br>").replaceAll("|", "\\|");
        lines.push(
          `| ${[...t.suites, t.title].join(" › ")} | ${cell(t.steps)} | ${cell(t.assertions.map((a) => a.text))} | ${cell(t.warnings.map((w) => w.rule))} |`,
        );
      }
      lines.push("");
    }
    return [{ path: "spec.md", content: lines.join("\n") }];
  },
};

export default defineConfig({ format: ["html", "markdown"], outputAdapters: [markdown] });
```

### 入力アダプタの作り方

入力アダプタは `TestFile` を返せば何を使って解析してもかまいません。ただし、警告ルールを自分で実装する必要はありません。テストごとに解析した「事実」（`TestFacts`）を `createTestCase()` に渡すと、ID の計算と警告ルールの評価をまとめて行います。ルールは AST ではなくこの事実を見て判定するので、言語が違っても同じルールがそのまま働きます。

```ts
import { createTestCase, type InputAdapter } from "testglass";

export const myAdapter: InputAdapter = {
  name: "pytest",
  match: (path) => /(^|\/)test_.*\.py$/.test(path),
  parse(path, source) {
    const tests = parsePython(source).map((t) =>   // parsePython は tree-sitter などで自作する
      createTestCase({
        path,
        suites: t.classNames,
        title: t.name,
        location: { line: t.line, column: t.column },
        modifiers: t.skipped ? ["skip"] : [],
        steps: t.statements,
        source: t.source,
        assertions: t.asserts.map((a) => ({
          line: a.line,
          text: a.text,
          kind: "value",                // "value" | "truthiness" | "snapshot" | "mock-call" | "helper"
          conditional: a.insideIf,
        })),
        fixedWaits: t.sleeps,           // time.sleep(1) など
        dynamic: t.parametrized ? [{ reason: "each", line: t.line }] : [],
        bodyResolved: true,
        normalizedBody: t.normalizedBody, // コメント・空白を除いた本体（重複検出用）
      }),
    );
    return { path, framework: "pytest", tests };
  },
};
```

JS/TS 系のランナー（jest、bun test など）なら、組み込みの解析器を `createJsAdapter()` で再利用できます。違いは、import 元のモジュール名と、宣言に使う名前・modifier の対応だけです。

```ts
import { createJsAdapter, importsAny, JS_TEST_FILE, statementSteps } from "testglass";

export const bunAdapter = createJsAdapter({
  name: "bun",
  profile: {
    modules: ["bun:test"],
    testNames: ["it", "test"],
    suiteNames: ["describe"],
    suiteProperties: [],
    chainProperties: { skip: "skip", only: "only", todo: "todo", each: "each", if: null, skipIf: null },
  },
  match: (path, source) => JS_TEST_FILE.test(path) && importsAny(source, ["bun:test"]),
  steps: ({ body }) => statementSteps(body),
});
```

作ったアダプタは、設定ファイルの `inputAdapters` / `outputAdapters` に登録します。登録したアダプタは組み込みのものより先に判定されます。

## プログラムから使う

```ts
import { collect, htmlAdapter } from "testglass";

const { spec, unmatched } = await collect({ root: process.cwd(), rules: { "fixed-wait": "error" } });
const [html] = htmlAdapter.render(spec, { title: "テスト仕様書" });
```

ファイルシステムを使わずに解析したい場合は、`buildSpec([{ path, source }], options)` を使います。

## 設計メモ

- JS/TS の解析には TypeScript Compiler API（`typescript@6`）を使っています。TypeScript 7（ネイティブ版）の JS API はまだ `unstable` なので、安定するまでは 6 系に固定します。利用するプロジェクト側の TypeScript のバージョンには影響しません。
- Java や Python などに広げるときは、tree-sitter で言語ごとの解析ルールを持つ入力アダプタを作る想定です（[neotest](https://github.com/nvim-neotest/neotest) と同じ方式）。
- 将来の拡張（GitHub の該当行へのリンク、2断面の差分表示、レビューのチェック状態）は、アダプタと別ファイルで追加します。レビューのチェック状態は `spec.json` の上書きで消えないよう、テスト ID で紐づけた別ファイルに保存します。

## 開発

```sh
npm install
npm test          # Vitest（開発には Node 22.12 以上が必要。ライブラリ自体は Node 20 で動く）
npm run typecheck
npm run build
npm run demo      # test/fixtures から demo/spec.json と demo/spec.html を生成
```

`test/fixtures/` には「良いテスト」と「警告が出るべきテスト」のサンプルがあり、`test/rules.test.ts` で各テストに出るべき警告を表にして検証しています。

## ライセンス

MIT
