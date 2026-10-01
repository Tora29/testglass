import type { Warning, WarningDetail } from "../schema/types.js";
import { type RuleId, ruleMeta } from "./catalog.js";
import type { TestFacts } from "./facts.js";

/** 警告の文言は持たない（出力のときに messages.ts で組み立てる） */
interface Finding {
  line?: number;
  detail?: WarningDetail;
}

type TestRule = (facts: TestFacts) => Finding[];

/** テスト単体で判定できるルール。ファイルをまたぐルールは spec-rules.ts にある。 */
export const TEST_RULES: Partial<Record<RuleId, TestRule>> = {
  "no-assertions": (f) => (f.bodyResolved && f.assertions.length === 0 && !f.modifiers.includes("todo") ? [{}] : []),

  "focused-test": (f) => (f.modifiers.includes("only") ? [{ line: f.location.line }] : []),

  "skipped-test": (f) => {
    if (f.modifiers.includes("todo")) return [{ line: f.location.line, detail: { reason: "todo" } }];
    if (f.modifiers.includes("skip")) return [{ line: f.location.line, detail: { reason: "skip" } }];
    return [];
  },

  "weak-assertions-only": (f) =>
    f.assertions.length > 0 && f.assertions.every((a) => a.kind === "truthiness") ? [{}] : [],

  "snapshot-only": (f) => (f.assertions.length > 0 && f.assertions.every((a) => a.kind === "snapshot") ? [{}] : []),

  "mock-calls-only": (f) =>
    f.assertions.some((a) => a.kind === "mock-call") &&
    f.assertions.every((a) => a.kind === "mock-call" || a.kind === "truthiness")
      ? [{}]
      : [],

  "conditional-assertion": (f) => f.assertions.filter((a) => a.conditional).map((a) => ({ line: a.line })),

  "fixed-wait": (f) => f.fixedWaits.map((w) => ({ line: w.line, detail: { code: w.text } })),

  "dynamic-test": (f) => {
    const reasons = new Set(f.dynamic.map((d) => d.reason));
    // ループ・テーブル駆動なら、タイトルが式なのは当然なので重ねて出さない
    if (reasons.has("each") || reasons.has("loop")) reasons.delete("title");
    return f.dynamic
      .filter((d) => reasons.delete(d.reason))
      .map((d) => ({ line: d.line, detail: { reason: d.reason } }));
  },
};

export function evaluateTestRules(facts: TestFacts): Warning[] {
  const warnings: Warning[] = [];
  for (const [id, rule] of Object.entries(TEST_RULES) as [RuleId, TestRule][]) {
    const { defaultSeverity } = ruleMeta(id);
    for (const finding of rule(facts)) {
      warnings.push({ rule: id, severity: defaultSeverity, ...finding });
    }
  }
  return warnings;
}
