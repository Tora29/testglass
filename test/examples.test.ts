import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSpec } from "../src/core/collect.js";
import { markdownAdapter } from "../src/output/markdown.js";
import type { SpecJson } from "../src/schema/types.js";

/**
 * examples/en は、英語のデモ用に test/fixtures を英語に訳したもの。
 * テスト名や画面の文字だけを訳し、コードの形と行は変えないので、解析結果（警告・手順の数など）は同じになる。
 */
const FILES = ["vitest/cart.test.ts", "vitest/weak.test.ts", "playwright/login.spec.ts", "playwright/weak.spec.ts"];
const now = new Date("2026-09-29T01:00:00Z");
const load = (dir: string) =>
  buildSpec(
    FILES.map((path) => ({ path, source: readFileSync(`${dir}/${path}`, "utf8") })),
    { now },
  ).spec;

/** 言語に依存しない解析結果（テスト名・手順の文字・警告の詳細を除く） */
function shape(spec: SpecJson) {
  return spec.files.map((f) => ({
    path: f.path,
    framework: f.framework,
    tests: f.tests.map((t) => ({
      suites: t.suites.length,
      location: t.location,
      modifiers: t.modifiers,
      steps: t.steps.length,
      assertions: t.assertions.map((a) => a.line),
      warnings: t.warnings.map(({ rule, severity, line }) => ({ rule, severity, line })),
      fingerprint: Boolean(t.fingerprint),
    })),
  }));
}

describe("英語のデモ（examples/en）", () => {
  const ja = load("test/fixtures");
  const en = load("examples/en");

  it("test/fixtures と同じ解析結果（警告のルール・重大度・行、手順と期待結果の数）になる", () => {
    expect(shape(en)).toEqual(shape(ja));
  });

  it("英語で出力すると、テストの中身も含めて日本語が残らない", () => {
    const md = markdownAdapter.render(en, { lang: "en" })[0]!.content;
    expect(md).not.toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });
});
