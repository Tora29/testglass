// スキーマ
export * from "./schema/types.js";
export { specJsonSchema } from "./schema/json-schema.js";

// アダプタのインターフェースと組み込みアダプタ
export type { InputAdapter, OutputAdapter, OutputFile } from "./adapters/types.js";
export { vitestAdapter } from "./input/vitest.js";
export { playwrightAdapter } from "./input/playwright.js";
export { htmlAdapter, type HtmlOptions } from "./output/html/index.js";
export { builtinOutputAdapters } from "./output/index.js";

// JS/TS 系の入力アダプタを作るための部品
export { createJsAdapter, importsAny, JS_TEST_FILE, type JsAdapterDefinition } from "./input/js/adapter.js";
export type { JsProfile, DiscoveredTest } from "./input/js/discover.js";
export { statementSteps, playwrightStepTitles, playwrightActionSteps } from "./input/js/steps.js";

// コア
export {
  buildSpec,
  collect,
  builtinInputAdapters,
  DEFAULT_INCLUDE,
  DEFAULT_EXCLUDE,
  type BuildOptions,
  type BuildResult,
  type CollectOptions,
  type SourceInput,
} from "./core/collect.js";
export { defineConfig, loadConfig, type TestglassConfig } from "./core/config.js";
export { createTestCase } from "./core/test-case.js";
export { testId } from "./core/id.js";

// ルール
export { RULES, RULE_IDS, type RuleId, type RuleMeta } from "./rules/catalog.js";
export type { TestFacts, AssertionFact, AssertionKind, DynamicFact, CodeRef } from "./rules/facts.js";
export { evaluateTestRules } from "./rules/test-rules.js";
export { applyRulesConfig, validateRulesConfig, type RuleSetting, type RulesConfig } from "./rules/config.js";
