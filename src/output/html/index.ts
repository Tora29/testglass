import { readFileSync } from "node:fs";
import type { OutputAdapter } from "../../adapters/types.js";
import { DEFAULT_LANG, getMessages, type Lang } from "../../i18n/index.js";
import { RULES } from "../../rules/catalog.js";
import type { SpecJson } from "../../schema/types.js";
import { describeStep, reportCases } from "../report.js";

export interface HtmlOptions {
  /** ページのタイトル（既定: "テスト仕様書" / "Test specification"） */
  title?: string;
  /** 出力ファイル名（既定: "spec.html"） */
  fileName?: string;
  /** 表示の言語（既定: "ja"） */
  lang?: Lang;
}

const asset = (name: string): string => readFileSync(new URL(`./assets/${name}`, import.meta.url), "utf8");

/** CSS・JS・データをすべて埋め込んだ単一ファイルの HTML を出力する */
export const htmlAdapter: OutputAdapter<HtmlOptions> = {
  name: "html",
  render(spec: SpecJson, options: HtmlOptions = {}) {
    const lang = options.lang ?? DEFAULT_LANG;
    const t = getMessages(lang);
    const ui = t.html;
    const title = options.title ?? t.title;
    const cases = reportCases(spec).map((fileCases) =>
      fileCases.map((c) => ({
        no: c.no,
        verdict: c.verdict,
        steps: c.test.steps.map((step) => describeStep(step, lang)),
        // 警告の文言（test.warnings と同じ並び）
        messages: c.test.warnings.map(t.warning),
      })),
    );
    // 画面の文言はすべて埋め込みデータで渡す（client.js には文言を書かない）
    const payload = {
      spec,
      rules: RULES.map((r) => ({ id: r.id, ...t.rules[r.id] })),
      labels: {
        verdicts: t.verdicts,
        modifiers: t.modifiers,
        noAssertions: t.noAssertions,
        staticAnalysis: t.staticAnalysis,
        ui,
      },
      cases,
    };
    const content = `<!doctype html>
<html lang="${lang}">
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
    <nav class="judge" id="judge" aria-label="${escapeHtml(ui.filterByVerdict)}"></nav>
    <div class="tools">
      <input type="search" id="q" placeholder="${escapeHtml(ui.search)}" aria-label="${escapeHtml(ui.searchLabel)}">
      <button type="button" class="link" id="expand">${escapeHtml(ui.expandAll)}</button>
      <button type="button" class="link" id="collapse">${escapeHtml(ui.collapseAll)}</button>
      <button type="button" class="round" id="theme" aria-label="${escapeHtml(ui.switchTheme)}"></button>
    </div>
  </div>
</div>

<header class="head wrap">
  <h1>${escapeHtml(title)}</h1>
  <p class="lead" id="lead"></p>
  <nav class="judge fw" id="framework" aria-label="${escapeHtml(ui.filterByFramework)}" hidden></nav>
  <nav class="chips" id="rules" aria-label="${escapeHtml(ui.filterByRule)}"></nav>
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
