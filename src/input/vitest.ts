import type { InputAdapter } from "../adapters/types.js";
import { createJsAdapter, importsAny, JS_TEST_FILE } from "./js/adapter.js";
import { statementSteps } from "./js/steps.js";
import { looksLikePlaywright, PLAYWRIGHT_MODULES } from "./playwright.js";

export const VITEST_MODULES = ["vitest"] as const;

/** 他のランナー専用であることが import から明らかなもの（globals の判定から除外する） */
const OTHER_RUNNERS = [...PLAYWRIGHT_MODULES, "bun:test", "@jest/globals", "node:test", "mocha"];

/**
 * Vitest の入力アダプタ。
 * `vitest` を import しているファイルに加え、globals モードを想定して
 * 他のランナーを import していないテストファイルも対象にする。
 */
export const vitestAdapter: InputAdapter = createJsAdapter({
  name: "vitest",
  profile: {
    modules: VITEST_MODULES,
    testNames: ["it", "test"],
    suiteNames: ["describe", "suite"],
    suiteProperties: [],
    chainProperties: {
      skip: "skip",
      only: "only",
      todo: "todo",
      each: "each",
      for: "each",
      concurrent: null,
      sequential: null,
      shuffle: null,
      fails: null,
      skipIf: null,
      runIf: null,
    },
  },
  match(filePath, source) {
    if (!JS_TEST_FILE.test(filePath)) return false;
    if (importsAny(source, VITEST_MODULES)) return true;
    return !importsAny(source, OTHER_RUNNERS) && !looksLikePlaywright(source);
  },
  steps: ({ body }) => statementSteps(body),
});
