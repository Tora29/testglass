import type { TestFacts } from "../rules/facts.js";
import { evaluateTestRules } from "../rules/test-rules.js";
import type { TestCase } from "../schema/types.js";
import { hash, testId } from "./id.js";

/**
 * 入力アダプタ向けのヘルパー：解析した事実から TestCase を作る。
 * ID の計算と、テスト単体に対する警告ルールの評価をここでまとめて行う。
 */
export function createTestCase(facts: TestFacts): TestCase {
  const test: TestCase = {
    id: testId(facts.path, facts.suites, facts.title),
    suites: facts.suites,
    title: facts.title,
    location: facts.location,
    modifiers: facts.modifiers,
    steps: facts.steps,
    assertions: facts.assertions.map(({ line, text }) => ({ line, text })),
    warnings: evaluateTestRules(facts),
    source: facts.source,
  };
  if (facts.normalizedBody !== undefined) test.fingerprint = hash(facts.normalizedBody);
  return test;
}
