import type { OutputAdapter } from "../adapters/types.js";
import { DEFAULT_LANG, getMessages, type Lang, type Messages } from "../i18n/index.js";
import type { SpecJson } from "../schema/types.js";
import {
  formatGeneratedAt,
  missingAssertionsLabel,
  type ReportCase,
  reportCases,
  ruleLabel,
  rulesByVerdict,
  type StepView,
  stepLines,
  tally,
  uniqueRules,
} from "./report.js";

export interface MarkdownOptions {
  /** 見出しのタイトル（既定: "テスト仕様書" / "Test specification"） */
  title?: string;
  /** 出力ファイル名（既定: "spec.md"） */
  fileName?: string;
  /** 表示の言語（既定: "ja"） */
  lang?: Lang;
}

/** HTML と同じ「項番／テスト名／手順／期待結果／判定」の表を、ファイルごとに並べた Markdown を出力する */
export const markdownAdapter: OutputAdapter<MarkdownOptions> = {
  name: "md",
  render(spec: SpecJson, options: MarkdownOptions = {}) {
    const lang = options.lang ?? DEFAULT_LANG;
    const t = getMessages(lang);
    const verdicts = t.verdicts;
    const title = options.title ?? t.title;
    const cases = reportCases(spec);
    const all = cases.flat();
    const { counts, byRule } = tally(all);
    const lines: string[] = [];

    lines.push(`# ${text(title)}`, "");
    lines.push(
      [formatGeneratedAt(spec.generatedAt), `${spec.files.length} files`, `${all.length} tests`, t.staticAnalysis].join(
        " · ",
      ),
      "",
    );
    lines.push(`${verdicts.error} ${counts.error} · ${verdicts.warn} ${counts.warn} · ${verdicts.ok} ${counts.ok}`, "");

    const rules = rulesByVerdict(byRule);
    if (rules.length) {
      lines.push(`## ${t.markdown.issues}`, "", row(t.markdown.issuesHeader), "| --- | --- | ---: |");
      for (const r of rules) lines.push(row([verdicts[r.verdict], text(ruleLabel(r.rule, lang)), String(r.n)]));
      lines.push("");
    }

    spec.files.forEach((file, fi) => {
      const fileCases = cases[fi] ?? [];
      const meta = [file.framework, `${fileCases.length} tests`];
      const nErr = fileCases.filter((c) => c.verdict === "error").length;
      const nWarn = fileCases.filter((c) => c.verdict === "warn").length;
      if (nErr) meta.push(`${verdicts.error} ${nErr}`);
      if (nWarn) meta.push(`${verdicts.warn} ${nWarn}`);
      lines.push(`## ${code(file.path)}`, "", meta.join(" · "), "");
      if (!fileCases.length) {
        lines.push(t.markdown.noTests, "");
        return;
      }
      // describe が変わるところで見出しを立て、表を分ける（HTML の区切り行にあたる）
      groupBySuites(fileCases).forEach((group, gi) => {
        if (group.suites.length) lines.push(`### ${group.suites.map(text).join(" / ")}`, "");
        else if (gi > 0) lines.push(`### ${t.markdown.outsideDescribe}`, "");
        lines.push(row(t.markdown.caseHeader), "| --- | --- | --- | --- | --- |");
        for (const c of group.cases) lines.push(caseRow(c, t, lang));
        lines.push("");
      });
    });

    return [{ path: options.fileName ?? "spec.md", content: lines.join("\n") }];
  },
};

function caseRow(c: ReportCase, messages: Messages, lang: Lang): string {
  const t = c.test;
  const mods = t.modifiers.map((m) => messages.markdown.modifier(messages.modifiers[m]?.label ?? m)).join("");
  const titleCell = [mods, text(t.title)].filter(Boolean).join(" ");
  const steps = t.steps.length ? stepLines(t.steps, { format: mdStep, lang }).join("<br>") : "—";
  const asserts = t.assertions.length
    ? t.assertions.map((a) => code(a.text)).join("<br>")
    : missingAssertionsLabel(t, lang);
  const judge = [
    messages.verdicts[c.verdict],
    ...uniqueRules(t.warnings).map((w) => text(ruleLabel(w.rule, lang))),
  ].join("<br>");
  return row([c.no, titleCell, steps, asserts, judge]);
}

function mdStep(view: StepView): string {
  const body = view.body ? (view.code ? code(view.body) : text(view.body)) : "";
  return [view.verb, body].filter(Boolean).join(" ");
}

function groupBySuites(cases: readonly ReportCase[]): { suites: string[]; cases: ReportCase[] }[] {
  const groups: { suites: string[]; cases: ReportCase[] }[] = [];
  let prevKey: string | undefined;
  for (const c of cases) {
    const key = JSON.stringify(c.test.suites);
    if (key !== prevKey) groups.push({ suites: c.test.suites, cases: [] });
    prevKey = key;
    groups.at(-1)?.cases.push(c);
  }
  return groups;
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/** 本文として書く文字列。Markdown の記号・HTML・数式（$）として解釈されないようにする */
function text(s: string): string {
  return oneLine(s)
    .replace(/[\\`*_[\]#|$~]/g, "\\$&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** コードとして書く文字列。中のバッククォートより長い区切りで囲み、表の区切り（|）はエスケープする */
function code(s: string): string {
  const body = oneLine(s).replace(/\|/g, "\\|");
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = body.startsWith("`") || body.endsWith("`") ? " " : "";
  return `${fence}${pad}${body}${pad}${fence}`;
}

/** 表のセルは 1 行にしか書けないので、改行を空白にする */
function oneLine(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, " ");
}
