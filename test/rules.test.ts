import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSpec } from "../src/core/collect.js";
import { validateRulesConfig } from "../src/rules/config.js";
import type { SpecJson } from "../src/schema/types.js";

const FIXTURES = ["vitest/cart.test.ts", "vitest/weak.test.ts", "playwright/login.spec.ts", "playwright/weak.spec.ts"];
const inputs = FIXTURES.map((path) => ({ path, source: readFileSync(`test/fixtures/${path}`, "utf8") }));

/** "path > テスト名" → 警告ルールID（ソート済み、重複除去） */
function warningTable(spec: SpecJson): Record<string, string[]> {
  const table: Record<string, string[]> = {};
  for (const file of spec.files) {
    for (const test of file.tests) {
      const key = `${file.path} > ${test.title}#${test.location.line}`;
      table[key] = [...new Set(test.warnings.map((w) => w.rule))].sort();
    }
  }
  return table;
}

describe("警告ルール", () => {
  const { spec, unmatched } = buildSpec(inputs);

  it("fixtures のすべてのファイルが、想定したアダプタで解析される", () => {
    expect(unmatched).toEqual([]);
    expect(spec.files.map((f) => [f.path, f.framework])).toEqual([
      ["playwright/login.spec.ts", "playwright"],
      ["playwright/weak.spec.ts", "playwright"],
      ["vitest/cart.test.ts", "vitest"],
      ["vitest/weak.test.ts", "vitest"],
    ]);
  });

  it("良いテストには警告が出ず、警告が出るべきテストには想定どおりの警告が出る", () => {
    expect(warningTable(spec)).toEqual({
      "playwright/login.spec.ts > 正しいパスワードで成功する#8": [],
      "playwright/login.spec.ts > パスワードが違うとエラーを表示する#24": [],
      "playwright/login.spec.ts > トークンを発行する#37": [],
      "playwright/weak.spec.ts > 正しいパスワードでログインに成功する#12": ["fixed-wait", "no-assertions"],
      "playwright/weak.spec.ts > Todo を追加できる#19": ["focused-test", "snapshot-only"],
      "playwright/weak.spec.ts > Todo を並び替えられる#26": ["skipped-test", "weak-assertions-only"],
      "playwright/weak.spec.ts > モバイルでは表示しない#31": ["conditional-assertion"],
      "playwright/weak.spec.ts > ${name} を削除できる#40": ["dynamic-test"],
      "vitest/cart.test.ts > 商品を追加すると合計金額が増える#15": [],
      "vitest/cart.test.ts > 数量0を指定するとエラーになる#22": [],
      "vitest/cart.test.ts > 注文APIに明細を送り、注文番号を返す#28": [],
      "vitest/weak.test.ts > 価格を3桁区切りでフォーマットする#5": ["no-assertions"],
      "vitest/weak.test.ts > 日付をパースできる#9": ["focused-test", "weak-assertions-only"],
      "vitest/weak.test.ts > タイムゾーンを考慮する#15": ["skipped-test"],
      "vitest/weak.test.ts > うるう年を扱う#19": ["skipped-test"],
      "vitest/weak.test.ts > 通知を送る#21": ["mock-calls-only"],
      "vitest/weak.test.ts > フォーマット結果が変わらない#28": ["snapshot-only"],
      "vitest/weak.test.ts > エラー時はメッセージを返す#32": ["conditional-assertion"],
      "vitest/weak.test.ts > 送信後に完了する#40": ["fixed-wait", "mock-calls-only"],
      "vitest/weak.test.ts > formatPrice(%i) は %s#46": ["dynamic-test"],
      "vitest/weak.test.ts > ${n}桁をフォーマットする#54": ["dynamic-test"],
      "vitest/weak.test.ts > 1000は1,000になる#59": ["duplicate-body", "duplicate-title"],
      "vitest/weak.test.ts > 1000は1,000になる#63": ["duplicate-body", "duplicate-title"],
      "vitest/weak.test.ts > 千円は1,000と表示される#67": ["duplicate-body"],
      "vitest/weak.test.ts > 古いフォーマットを受け付ける#74": ["skipped-test", "weak-assertions-only"],
    });
  });

  it("警告には根拠の行番号がつく", () => {
    const weak = spec.files.find((f) => f.path === "vitest/weak.test.ts")!;
    const catchTest = weak.tests.find((t) => t.title === "エラー時はメッセージを返す")!;
    expect(catchTest.warnings).toEqual([
      {
        rule: "conditional-assertion",
        severity: "warn",
        message: "条件分岐の中に expect があり、実行されない場合がある",
        line: 36,
      },
    ]);
    const waitTest = weak.tests.find((t) => t.title === "送信後に完了する")!;
    expect(waitTest.warnings.find((w) => w.rule === "fixed-wait")).toMatchObject({ line: 42 });
  });

  it("同名のテストは ID が衝突しないよう、2件目以降の ID を変える", () => {
    const ids = spec.files.flatMap((f) => f.tests.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("本体が同一のテストの警告に、相手のテスト名と位置を示す", () => {
    const weak = spec.files.find((f) => f.path === "vitest/weak.test.ts")!;
    const w = weak.tests.find((t) => t.title === "千円は1,000と表示される")!.warnings[0]!;
    expect(w.message).toBe(
      "本体が同一のテストがある: 「1000は1,000になる」(vitest/weak.test.ts:59)、「1000は1,000になる」(vitest/weak.test.ts:63)",
    );
  });
});

describe("ルールの設定", () => {
  it("off で無効化し、warn / error で重大度を変える", () => {
    const { spec } = buildSpec(inputs, { rules: { "no-assertions": "off", "fixed-wait": "error" } });
    const warnings = spec.files.flatMap((f) => f.tests.flatMap((t) => t.warnings));
    expect(warnings.some((w) => w.rule === "no-assertions")).toBe(false);
    expect(warnings.filter((w) => w.rule === "fixed-wait").map((w) => w.severity)).toEqual(["error", "error"]);
  });

  it("未知のルールIDや不正な値はエラーにする", () => {
    expect(() => validateRulesConfig({ "no-such-rule": "off" })).toThrow('未知のルールです: "no-such-rule"');
    expect(() => validateRulesConfig({ "fixed-wait": "warning" })).toThrow('"off" / "warn" / "error"');
    expect(validateRulesConfig({ "fixed-wait": "off" })).toEqual({ "fixed-wait": "off" });
  });
});
