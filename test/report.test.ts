import { describe, expect, it } from "vitest";
import { buildSpec } from "../src/core/collect.js";
import { describeStep, reportCases, stepLines, uniqueRules, verdictOf } from "../src/output/report.js";
import type { TestCase, Warning } from "../src/schema/types.js";

const warning = (rule: string, severity: Warning["severity"]): Warning => ({ rule, severity, message: rule });
const withWarnings = (warnings: Warning[]) => ({ warnings }) as TestCase;

describe("verdictOf", () => {
  it("警告のうち最も重いもので判定する", () => {
    expect(verdictOf(withWarnings([]))).toBe("ok");
    expect(verdictOf(withWarnings([warning("a", "warn")]))).toBe("warn");
    expect(verdictOf(withWarnings([warning("a", "warn"), warning("b", "error")]))).toBe("error");
    expect(verdictOf(withWarnings([warning("b", "error"), warning("a", "warn")]))).toBe("error");
  });
});

describe("uniqueRules", () => {
  it("同じルールの警告は最初の 1 件だけ残す", () => {
    const ws = [warning("a", "warn"), warning("b", "error"), warning("a", "error")];
    expect(uniqueRules(ws)).toEqual([ws[0], ws[1]]);
  });
});

describe("reportCases", () => {
  it("項番は「ファイルの番号-ファイル内の番号」で、ファイルごとに 1 から数える", () => {
    const test = `import { it, expect } from "vitest";\nit("a", () => { expect(1).toBe(1); });\nit("b", () => { expect(1).toBe(1); });`;
    const { spec } = buildSpec([
      { path: "a.test.ts", source: test },
      { path: "b.test.ts", source: test },
    ]);
    expect(reportCases(spec).map((cs) => cs.map((c) => c.no))).toEqual([
      ["1-1", "1-2"],
      ["2-1", "2-2"],
    ]);
  });
});

describe("describeStep", () => {
  it("Playwright の操作を日本語の表示名と対象に分ける", () => {
    expect(describeStep("fill [メール] ← a@b.c")).toEqual({
      depth: 0,
      verb: "入力",
      verbTitle: "fill",
      body: "[メール] ← a@b.c",
      code: true,
    });
    expect(describeStep("keyboard.press Enter")).toMatchObject({ verb: "キー入力", verbTitle: "keyboard.press" });
    expect(describeStep("waitForTimeout 3000")).toMatchObject({ verb: "待機", wait: true });
  });

  it("モック・コード・文章を見分ける", () => {
    expect(describeStep("mock: vi.fn()")).toMatchObject({ verb: "モック", body: "vi.fn()", code: true });
    expect(describeStep("const x = await f()")).toEqual({ depth: 0, body: "const x = await f()", code: true });
    expect(describeStep("ログイン画面を開く")).toEqual({ depth: 0, body: "ログイン画面を開く", code: false });
  });

  it("先頭の空白 2 つを 1 段の入れ子として数える", () => {
    expect(describeStep("    送信する").depth).toBe(2);
  });
});

describe("stepLines", () => {
  it("最上位の手順にだけ番号を付け、入れ子は「└」で示す", () => {
    expect(stepLines(["開く", "  送信する", "    確認する", "閉じる"])).toEqual([
      "1. 開く",
      "└ 送信する",
      "   └ 確認する",
      "2. 閉じる",
    ]);
  });

  it("操作は表示名と対象をつなげて書く", () => {
    expect(stepLines(["click button[ログイン]"])).toEqual(["1. クリック button[ログイン]"]);
  });
});
