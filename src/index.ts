// スキーマ

// アダプタのインターフェースと組み込みアダプタ
export type { InputAdapter, OutputAdapter, OutputFile } from "./adapters/types.js";
// コア
export {
  type BuildOptions,
  type BuildResult,
  buildSpec,
  builtinInputAdapters,
  type CollectOptions,
  collect,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  type SourceInput,
} from "./core/collect.js";
export { defineConfig, loadConfig, type TestglassConfig } from "./core/config.js";
export { type ErrorDetail, errorMessage, TestglassError } from "./core/errors.js";
export { testId } from "./core/id.js";
export { createTestCase } from "./core/test-case.js";
// 表示の言語
export {
  DEFAULT_LANG,
  getMessages,
  isLang,
  LANGS,
  type Lang,
  type Messages,
  type RuleText,
} from "./i18n/index.js";
// JS/TS 系の入力アダプタを作るための部品
export { createJsAdapter, importsAny, JS_TEST_FILE, type JsAdapterDefinition } from "./input/js/adapter.js";
export type { DiscoveredTest, JsProfile } from "./input/js/discover.js";
export { playwrightActionSteps, playwrightStepTitles, statementSteps } from "./input/js/steps.js";
export { playwrightAdapter } from "./input/playwright.js";
export { vitestAdapter } from "./input/vitest.js";
export { type CsvOptions, csvAdapter } from "./output/csv.js";
export { type HtmlOptions, htmlAdapter } from "./output/html/index.js";
export { builtinOutputAdapters } from "./output/index.js";
export { type MarkdownOptions, markdownAdapter } from "./output/markdown.js";
// 出力アダプタを作るための部品（項番・判定・手順の表記を HTML と揃える）
export {
  describeStep,
  type ReportCase,
  reportCases,
  ruleLabel,
  type StepLinesOptions,
  type StepView,
  stepLines,
  uniqueRules,
  type Verdict,
  verdictOf,
} from "./output/report.js";
// ルール
export { RULE_IDS, RULES, type RuleId, type RuleMeta } from "./rules/catalog.js";
export { applyRulesConfig, type RuleSetting, type RulesConfig, validateRulesConfig } from "./rules/config.js";
export type { AssertionFact, AssertionKind, CodeRef, DynamicFact, TestFacts } from "./rules/facts.js";
export { warningMessage } from "./rules/messages.js";
export { evaluateTestRules } from "./rules/test-rules.js";
export { specJsonSchema } from "./schema/json-schema.js";
export * from "./schema/types.js";
