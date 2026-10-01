/**
 * 出力形式（HTML / Markdown / CSV）で共通の表示ロジック。
 * 項番・判定・手順の表記をここで決め、どの形式でも同じ表示にする。
 */
import { DEFAULT_LANG, getMessages, type Lang } from "../i18n/index.js";
import { RULES, type RuleId } from "../rules/catalog.js";
import type { SpecJson, TestCase, TestFile, Warning } from "../schema/types.js";

/** 判定：テストについた警告のうち最も重いもの */
export type Verdict = "error" | "warn" | "ok";

export function verdictOf(test: TestCase): Verdict {
  let v: Verdict = "ok";
  for (const w of test.warnings) {
    if (w.severity === "error") v = "error";
    else if (v === "ok") v = "warn";
  }
  return v;
}

/** 同じルールの警告は最初の1件だけにする（1つのテストで同じ指摘を何度も数えない） */
export function uniqueRules(warnings: readonly Warning[]): Warning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => {
    if (seen.has(w.rule)) return false;
    seen.add(w.rule);
    return true;
  });
}

/** 警告の表示名（ルールの label。未知のルールは ID のまま） */
export function ruleLabel(rule: string, lang: Lang = DEFAULT_LANG): string {
  return getMessages(lang).rules[rule as RuleId]?.label ?? rule;
}

export interface ReportCase {
  /** 項番。「ファイルの番号-ファイル内の番号」（どちらも 1 始まり） */
  no: string;
  file: TestFile;
  test: TestCase;
  verdict: Verdict;
}

/** ファイルごとに、項番と判定を付けたテストを返す（spec.files と同じ並び） */
export function reportCases(spec: SpecJson): ReportCase[][] {
  return spec.files.map((file, fi) =>
    file.tests.map((test, ti) => ({ no: `${fi + 1}-${ti + 1}`, file, test, verdict: verdictOf(test) })),
  );
}

export interface StepView {
  /** 入れ子の深さ（0 が最上位） */
  depth: number;
  /** 操作の表示名（「入力」「クリック」など）。操作として読めない手順には無い */
  verb?: string;
  /** 操作の元の名前（keyboard.press など） */
  verbTitle?: string;
  /** 固定時間の待機 */
  wait?: boolean;
  /** 操作の対象や値、または手順そのもの */
  body: string;
  /** body がコードか（等幅で表示する） */
  code: boolean;
}

/** spec.json の手順（先頭の空白 2 つで 1 段の入れ子）を、表示用に分解する */
export function describeStep(step: string, lang: Lang = DEFAULT_LANG): StepView {
  const t = getMessages(lang);
  const depth = (/^ */.exec(step)?.[0].length ?? 0) / 2;
  const body = step.trim();
  const mock = /^mock: (.*)$/.exec(body);
  if (mock) return { depth, verb: t.mock.label, verbTitle: t.mock.title, body: mock[1]!, code: true };
  const m = /^(?:(keyboard|mouse|touchscreen)\.)?([A-Za-z]+)(?: (.*))?$/.exec(body);
  const verb = m && Object.hasOwn(t.stepVerbs, m[2]!) ? t.stepVerbs[m[2]!] : undefined;
  if (m && verb) {
    const view: StepView = { depth, verb, verbTitle: (m[1] ? `${m[1]}.` : "") + m[2], body: m[3] ?? "", code: true };
    if (m[2] === "waitForTimeout") view.wait = true;
    return view;
  }
  // コードそのままの手順は等幅、test.step のタイトルなどの文章はそのまま
  return { depth, body, code: /[();={}]|=>/.test(body) };
}

export interface StepLinesOptions {
  /** 本文の書き方（Markdown のコード表記など。既定: plainStep） */
  format?: (view: StepView) => string;
  lang?: Lang;
}

/** 手順を、番号付きの行に並べる。番号は最上位の手順にだけ付け、入れ子は「└」で示す。 */
export function stepLines(steps: readonly string[], options: StepLinesOptions = {}): string[] {
  const { format = plainStep, lang } = options;
  let n = 0;
  return steps.map((step) => {
    const view = describeStep(step, lang);
    if (view.depth === 0) return `${++n}. ${format(view)}`;
    return `${"   ".repeat(view.depth - 1)}└ ${format(view)}`;
  });
}

export function plainStep(view: StepView): string {
  return [view.verb, view.body].filter(Boolean).join(" ");
}

/** 期待結果が無いときの表示（.todo は「未実装」、それ以外は「なし」） */
export function missingAssertionsLabel(test: TestCase, lang: Lang = DEFAULT_LANG): string {
  const { noAssertions } = getMessages(lang);
  return test.modifiers.includes("todo") ? noAssertions.todo : noAssertions.none;
}

/** 判定ごと・指摘の種類ごとの件数 */
export function tally(cases: readonly ReportCase[]): {
  counts: Record<Verdict, number>;
  byRule: Map<string, { n: number; verdict: Exclude<Verdict, "ok"> }>;
} {
  const counts: Record<Verdict, number> = { error: 0, warn: 0, ok: 0 };
  const byRule = new Map<string, { n: number; verdict: Exclude<Verdict, "ok"> }>();
  for (const c of cases) {
    counts[c.verdict]++;
    for (const w of uniqueRules(c.test.warnings)) {
      const r = byRule.get(w.rule) ?? { n: 0, verdict: "warn" };
      r.n++;
      if (w.severity === "error") r.verdict = "error";
      byRule.set(w.rule, r);
    }
  }
  return { counts, byRule };
}

/** 生成日時を「2026.09.30 22:42」の形にする（読めない値はそのまま） */
export function formatGeneratedAt(generatedAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(generatedAt);
  return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : generatedAt;
}

/** 判定ごとの指摘を、件数の多い順に並べる（要修正 → 要確認） */
export function rulesByVerdict(
  byRule: ReturnType<typeof tally>["byRule"],
): { verdict: Exclude<Verdict, "ok">; rule: string; n: number }[] {
  return (["error", "warn"] as const).flatMap((verdict) =>
    [...byRule]
      .filter(([, r]) => r.verdict === verdict)
      .sort((a, b) => b[1].n - a[1].n || ruleOrder(a[0]) - ruleOrder(b[0]))
      .map(([rule, r]) => ({ verdict, rule, n: r.n })),
  );
}

/** 件数が同じときは、ルールの一覧（catalog）の順に並べる。HTML のチップと同じ並び */
function ruleOrder(rule: string): number {
  const i = RULES.findIndex((r) => r.id === rule);
  return i < 0 ? RULES.length : i;
}
