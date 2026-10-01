import { TestglassError } from "../core/errors.js";
import type { Severity, SpecJson } from "../schema/types.js";
import { RULE_IDS } from "./catalog.js";

export type RuleSetting = Severity | "off";
export type RulesConfig = Record<string, RuleSetting>;

/** 設定の妥当性を確かめる（未知のルールIDや値はエラー） */
export function validateRulesConfig(rules: unknown): RulesConfig {
  if (rules === undefined) return {};
  if (typeof rules !== "object" || rules === null || Array.isArray(rules)) {
    throw new TestglassError({ code: "rules-not-object" });
  }
  for (const [id, value] of Object.entries(rules)) {
    if (!RULE_IDS.includes(id)) {
      throw new TestglassError({ code: "unknown-rule", rule: id, rules: RULE_IDS });
    }
    if (!["off", "warn", "error"].includes(value as string)) {
      throw new TestglassError({ code: "invalid-rule-value", rule: id, value });
    }
  }
  return rules as RulesConfig;
}

/** 設定に従って警告を無効化したり、重大度を変えたりする */
export function applyRulesConfig(spec: SpecJson, rules: RulesConfig): void {
  for (const file of spec.files) {
    for (const test of file.tests) {
      test.warnings = test.warnings.flatMap((w) => {
        const setting = rules[w.rule];
        if (setting === "off") return [];
        return [setting ? { ...w, severity: setting } : w];
      });
    }
  }
}
