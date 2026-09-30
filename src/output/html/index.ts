import { readFileSync } from "node:fs";
import type { OutputAdapter } from "../../adapters/types.js";
import { RULES } from "../../rules/catalog.js";
import type { SpecJson } from "../../schema/types.js";
import { describeStep, MODIFIER_LABELS, reportCases, VERDICT_LABELS } from "../report.js";

export interface HtmlOptions {
  /** ページのタイトル（既定: "テスト仕様書"） */
  title?: string;
  /** 出力ファイル名（既定: "spec.html"） */
  fileName?: string;
}

const asset = (name: string): string => readFileSync(new URL(`./assets/${name}`, import.meta.url), "utf8");

/** CSS・JS・データをすべて埋め込んだ単一ファイルの HTML を出力する */
export const htmlAdapter: OutputAdapter<HtmlOptions> = {
  name: "html",
  render(spec: SpecJson, options: HtmlOptions = {}) {
    const title = options.title ?? "テスト仕様書";
    const cases = reportCases(spec).map((fileCases) =>
      fileCases.map((c) => ({ no: c.no, verdict: c.verdict, steps: c.test.steps.map(describeStep) })),
    );
    const payload = { spec, rules: RULES, labels: { verdicts: VERDICT_LABELS, modifiers: MODIFIER_LABELS }, cases };
    const content = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="testglass">
<title>${escapeHtml(title)}</title>
<style>
${asset("styles.css")}
</style>
</head>
<body>
<div class="bar">
  <div class="bar-inner wrap">
    <nav class="judge" id="judge" aria-label="判定で絞り込む"></nav>
    <div class="tools">
      <input type="search" id="q" placeholder="検索" aria-label="検索（テスト名・手順・期待結果・ファイル名）">
      <button type="button" class="link" id="expand">すべて開く</button>
      <button type="button" class="link" id="collapse">閉じる</button>
      <button type="button" class="round" id="theme" aria-label="表示テーマを切り替える"></button>
    </div>
  </div>
</div>

<header class="head wrap">
  <h1>${escapeHtml(title)}</h1>
  <p class="lead" id="lead"></p>
  <nav class="judge fw" id="framework" aria-label="フレームワークで絞り込む" hidden></nav>
  <nav class="chips" id="rules" aria-label="指摘の種類で絞り込む"></nav>
</header>

<main class="wrap" id="results"></main>
<script type="application/json" id="testglass-data">${embedJson(payload)}</script>
<script>
${asset("client.js")}
</script>
</body>
</html>
`;
    return [{ path: options.fileName ?? "spec.html", content }];
  },
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * <script> に埋め込む JSON。"<" をエスケープして </script> や <!-- で閉じられないようにする。
 * （JSON の構文上 "<" は文字列の中にしか現れないため、\u003c に置き換えても値は変わらない）
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
