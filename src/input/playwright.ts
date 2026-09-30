import type { InputAdapter } from "../adapters/types.js";
import { createJsAdapter, importsAny, JS_TEST_FILE } from "./js/adapter.js";
import { playwrightActionSteps, playwrightStepTitles, statementSteps } from "./js/steps.js";

export const PLAYWRIGHT_MODULES = [
  "@playwright/test",
  "playwright/test",
  "@playwright/experimental-ct-react",
  "@playwright/experimental-ct-vue",
  "@playwright/experimental-ct-svelte",
] as const;

const PW_FIXTURE_PARAM = /\(\s*\{[^}]*\b(page|context|browser|browserName|request)\b[^}]*\}\s*(?:,[^)]*)?\)\s*=>/;

/**
 * Playwright のテストらしいか。自作 fixtures（`import { test } from './fixtures'`）経由でも
 * 判定できるよう、本体が `({ page })` などの fixture を受け取っているかも見る。
 */
export function looksLikePlaywright(source: string): boolean {
  return importsAny(source, PLAYWRIGHT_MODULES) || PW_FIXTURE_PARAM.test(source);
}

/**
 * Playwright Test の入力アダプタ。
 * 手順は test.step のタイトル → 操作呼び出しの要約 → 文の1行化 の順に採用する。
 */
export const playwrightAdapter: InputAdapter = createJsAdapter({
  name: "playwright",
  profile: {
    modules: PLAYWRIGHT_MODULES,
    testNames: ["test"],
    suiteNames: [],
    suiteProperties: ["describe"],
    chainProperties: {
      skip: "skip",
      fixme: "skip",
      only: "only",
      serial: null,
      parallel: null,
      fail: null,
      slow: null,
    },
  },
  match(filePath, source) {
    return JS_TEST_FILE.test(filePath) && !importsAny(source, ["vitest"]) && looksLikePlaywright(source);
  },
  steps({ body, testName }) {
    const titles = playwrightStepTitles(body, testName);
    if (titles.length > 0) return titles;
    const actions = playwrightActionSteps(body);
    if (actions.length > 0) return actions;
    return statementSteps(body);
  },
});
