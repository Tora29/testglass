import type { Severity } from "../schema/types.js";

export interface RuleMeta {
  id: string;
  defaultSeverity: Severity;
}

/**
 * ルールの一覧。言語・フレームワークをまたいで共通の ID を使う。
 * 表示名や説明は言語ごとの辞書（src/i18n/）にある。この並びが HTML のチップや一覧の並びになる。
 */
export const RULES = [
  { id: "no-assertions", defaultSeverity: "error" },
  { id: "focused-test", defaultSeverity: "error" },
  { id: "skipped-test", defaultSeverity: "warn" },
  { id: "weak-assertions-only", defaultSeverity: "warn" },
  { id: "snapshot-only", defaultSeverity: "warn" },
  { id: "mock-calls-only", defaultSeverity: "warn" },
  { id: "conditional-assertion", defaultSeverity: "warn" },
  { id: "fixed-wait", defaultSeverity: "warn" },
  { id: "dynamic-test", defaultSeverity: "warn" },
  { id: "duplicate-title", defaultSeverity: "warn" },
  { id: "duplicate-body", defaultSeverity: "warn" },
] as const satisfies readonly RuleMeta[];

export type RuleId = (typeof RULES)[number]["id"];

export const RULE_IDS: readonly string[] = RULES.map((r) => r.id);

export function ruleMeta(id: RuleId): RuleMeta {
  return RULES.find((r) => r.id === id)!;
}
