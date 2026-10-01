import { testId } from "../core/id.js";
import type { SpecJson, TestCase, TestFile } from "../schema/types.js";
import { ruleMeta } from "./catalog.js";

/**
 * ファイル・テストをまたいで判定するルール（入力アダプタに依存しない）。
 * 同名テストの ID の衝突もここで解消する。
 */
export function applySpecRules(spec: SpecJson): void {
  for (const file of spec.files) checkDuplicateTitles(file);
  checkDuplicateBodies(spec);
}

function checkDuplicateTitles(file: TestFile): void {
  const groups = new Map<string, TestCase[]>();
  for (const test of file.tests) {
    const key = JSON.stringify([...test.suites, test.title]);
    groups.set(key, [...(groups.get(key) ?? []), test]);
  }
  const { defaultSeverity } = ruleMeta("duplicate-title");
  for (const tests of groups.values()) {
    if (tests.length < 2) continue;
    const lines = tests.map((t) => t.location.line);
    tests.forEach((test, i) => {
      // 2件目以降は出現順の番号を足して ID の衝突を避ける
      if (i > 0) test.id = testId(file.path, test.suites, `${test.title}\u0000#${i + 1}`);
      test.warnings.push({
        rule: "duplicate-title",
        severity: defaultSeverity,
        line: test.location.line,
        detail: { lines },
      });
    });
  }
}

function checkDuplicateBodies(spec: SpecJson): void {
  const groups = new Map<string, { file: TestFile; test: TestCase }[]>();
  for (const file of spec.files) {
    for (const test of file.tests) {
      // 空の本体どうしの一致は no-assertions で十分なので除く
      if (!test.fingerprint || test.assertions.length === 0) continue;
      groups.set(test.fingerprint, [...(groups.get(test.fingerprint) ?? []), { file, test }]);
    }
  }
  const { defaultSeverity } = ruleMeta("duplicate-body");
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    for (const { test } of entries) {
      const others = entries
        .filter((e) => e.test !== test)
        .map((e) => ({ path: e.file.path, title: e.test.title, line: e.test.location.line }));
      test.warnings.push({
        rule: "duplicate-body",
        severity: defaultSeverity,
        line: test.location.line,
        detail: { tests: others },
      });
    }
  }
}
