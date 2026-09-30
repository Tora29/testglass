import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { specJsonSchema, type SpecJson } from "../src/index.js";

const validate = new Ajv2020({ strict: true, validateFormats: false }).compile(specJsonSchema);

describe("specJsonSchema", () => {
  it("合意済みのサンプルを受理する", () => {
    const sample: SpecJson = {
      schemaVersion: 1,
      generatedAt: "2026-09-29T10:00:00+09:00",
      files: [
        {
          path: "tests/e2e/login.spec.ts",
          framework: "playwright",
          tests: [
            {
              id: "b3f1",
              suites: ["ログイン"],
              title: "正しいパスワードで成功する",
              location: { line: 12, column: 3 },
              modifiers: [],
              steps: ["ログイン画面を開く", "認証情報を入力"],
              assertions: [{ line: 20, text: "expect(page).toHaveURL('/home')" }],
              warnings: [],
              source: "test('正しいパスワードで…', async ({ page }) => { … })",
            },
          ],
        },
      ],
    };
    expect(validate(sample), JSON.stringify(validate.errors)).toBe(true);
  });

  it("未知の modifier を拒否する", () => {
    const bad = {
      schemaVersion: 1,
      generatedAt: "2026-09-29T10:00:00+09:00",
      files: [
        {
          path: "a.test.ts",
          framework: "vitest",
          tests: [
            {
              id: "x",
              suites: [],
              title: "t",
              location: { line: 1, column: 1 },
              modifiers: ["fixme"],
              steps: [],
              assertions: [],
              warnings: [],
              source: "",
            },
          ],
        },
      ],
    };
    expect(validate(bad)).toBe(false);
    expect(validate.errors?.[0]?.instancePath).toBe("/files/0/tests/0/modifiers/0");
  });
});
