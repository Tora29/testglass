import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { type SpecJson, specJsonSchema } from "../src/index.js";
import { findSpecIssue } from "../src/schema/validate.js";

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

describe("findSpecIssue（render で読む spec.json の検証）", () => {
  const valid = (): SpecJson => ({
    schemaVersion: 1,
    generatedAt: "2026-09-29T10:00:00+09:00",
    files: [
      {
        path: "a.spec.ts",
        framework: "playwright",
        tests: [
          {
            id: "x",
            suites: ["s"],
            title: "t",
            location: { line: 1, column: 1 },
            modifiers: ["skip", "each"],
            steps: ["goto /"],
            assertions: [{ line: 2, text: "expect(a).toBe(1)" }],
            warnings: [
              { rule: "fixed-wait", severity: "warn", line: 3, detail: { code: "waitForTimeout(1)" } },
              {
                rule: "duplicate-body",
                severity: "error",
                detail: { reason: "r", lines: [1, 2], tests: [{ path: "b", title: "u", line: 4 }] },
              },
            ],
            source: "test()",
            fingerprint: "f",
          },
        ],
      },
    ],
  });

  it("正しい spec.json と、testglass が出力した spec.json を受け入れる", () => {
    expect(findSpecIssue(valid())).toBeUndefined();
    expect(findSpecIssue({ schemaVersion: 1, generatedAt: "", files: [] })).toBeUndefined();
  });

  it("オブジェクトでないものは受け入れない", () => {
    for (const value of [null, [], "spec", 1]) {
      expect(findSpecIssue(value)).toEqual({ kind: "type", pointer: "", expected: "object" });
      expect(validate(value)).toBe(false);
    }
  });

  /** valid() の一部を書き換えたもの。ajv と同じく受け入れない */
  // biome-ignore lint/suspicious/noExplicitAny: 型に合わない値を入れるために書き換える
  type Loose = any;
  const broken: [string, (s: Loose) => void, unknown][] = [
    ["files が無い", (s) => delete s.files, { kind: "required", pointer: "", property: "files" }],
    ["未知の項目", (s) => (s.extra = 1), { kind: "additional", pointer: "", property: "extra" }],
    [
      "__proto__ という項目",
      (s) => Object.defineProperty(s.files[0], "__proto__", { value: {}, enumerable: true }),
      undefined,
    ],
    [
      "framework が文字列でない",
      (s) => (s.files[0].framework = { toString: 1 }),
      { kind: "type", pointer: "/files/0/framework", expected: "string" },
    ],
    [
      "title が数値",
      (s) => (s.files[0].tests[0].title = 1),
      { kind: "type", pointer: "/files/0/tests/0/title", expected: "string" },
    ],
    [
      "未知の修飾子",
      (s) => s.files[0].tests[0].modifiers.push("<b>"),
      { kind: "enum", pointer: "/files/0/tests/0/modifiers/2", allowed: ["skip", "only", "todo", "each"] },
    ],
    [
      "修飾子の重複",
      (s) => s.files[0].tests[0].modifiers.push("skip"),
      { kind: "unique", pointer: "/files/0/tests/0/modifiers" },
    ],
    [
      "行が 0",
      (s) => (s.files[0].tests[0].location.line = 0),
      { kind: "minimum", pointer: "/files/0/tests/0/location/line", minimum: 1 },
    ],
    ["行が小数", (s) => (s.files[0].tests[0].assertions[0].line = 1.5), undefined],
    ["重大度が未知", (s) => (s.files[0].tests[0].warnings[0].severity = "info"), undefined],
    ["detail の未知の項目", (s) => (s.files[0].tests[0].warnings[1].detail.x = 1), undefined],
    ["TestRef の line が文字列", (s) => (s.files[0].tests[0].warnings[1].detail.tests[0].line = "4"), undefined],
    ["steps の要素が null", (s) => (s.files[0].tests[0].steps[0] = null), undefined],
    ["tests が null", (s) => (s.files[0].tests = null), undefined],
    ["schemaVersion が文字列", (s) => (s.schemaVersion = "1"), undefined],
  ];

  it.each(broken)("%s は受け入れない（ajv と同じ判定）", (_, mutate, expected) => {
    const spec = valid();
    mutate(spec);
    const issue = findSpecIssue(spec);
    expect(issue).toBeDefined();
    if (expected) expect(issue).toEqual(expected);
    expect(validate(spec)).toBe(false);
  });
});
