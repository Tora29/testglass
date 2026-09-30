import type { Warning } from "../schema/types.js";
import { type RuleId, ruleMeta } from "./catalog.js";
import type { DynamicFact, TestFacts } from "./facts.js";

interface Finding {
  message: string;
  line?: number;
}

type TestRule = (facts: TestFacts) => Finding[];

const DYNAMIC_MESSAGES: Record<DynamicFact["reason"], string> = {
  each: "it.each / test.for によるテーブル駆動。各行のデータは展開していない",
  loop: "ループの中で宣言されている。件数とテスト名は実行時に決まる",
  title: "テスト名が式で組み立てられている。実際の名前は実行時に決まる",
  body: "本体に関数参照が渡されており、内容を解析できない",
};

/** テスト単体で判定できるルール。ファイルをまたぐルールは spec-rules.ts にある。 */
export const TEST_RULES: Partial<Record<RuleId, TestRule>> = {
  "no-assertions": (f) =>
    f.bodyResolved && f.assertions.length === 0 && !f.modifiers.includes("todo")
      ? [{ message: "expect などによる結果の確認が1件もない" }]
      : [],

  "focused-test": (f) =>
    f.modifiers.includes("only")
      ? [{ message: ".only が残っている。同じファイルの他のテストが実行されない", line: f.location.line }]
      : [],

  "skipped-test": (f) => {
    if (f.modifiers.includes("todo")) return [{ message: ".todo のまま未実装", line: f.location.line }];
    if (f.modifiers.includes("skip"))
      return [{ message: ".skip / .fixme でスキップされている", line: f.location.line }];
    return [];
  },

  "weak-assertions-only": (f) =>
    f.assertions.length > 0 && f.assertions.every((a) => a.kind === "truthiness")
      ? [{ message: "toBeTruthy / toBeDefined などで真偽・存在を確認しているだけで、値を検証していない" }]
      : [],

  "snapshot-only": (f) =>
    f.assertions.length > 0 && f.assertions.every((a) => a.kind === "snapshot")
      ? [{ message: "スナップショットの比較のみで検証している" }]
      : [],

  "mock-calls-only": (f) =>
    f.assertions.some((a) => a.kind === "mock-call") &&
    f.assertions.every((a) => a.kind === "mock-call" || a.kind === "truthiness")
      ? [{ message: "モックの呼び出しのみを検証し、結果（戻り値や状態）を確認していない" }]
      : [],

  "conditional-assertion": (f) =>
    f.assertions
      .filter((a) => a.conditional)
      .map((a) => ({ message: "条件分岐の中に expect があり、実行されない場合がある", line: a.line })),

  "fixed-wait": (f) =>
    f.fixedWaits.map((w) => ({
      message: `固定時間の待機がある: ${w.text}`,
      line: w.line,
    })),

  "dynamic-test": (f) => {
    const reasons = new Set(f.dynamic.map((d) => d.reason));
    // ループ・テーブル駆動なら、タイトルが式なのは当然なので重ねて出さない
    if (reasons.has("each") || reasons.has("loop")) reasons.delete("title");
    return f.dynamic
      .filter((d) => reasons.delete(d.reason))
      .map((d) => ({ message: DYNAMIC_MESSAGES[d.reason], line: d.line }));
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
