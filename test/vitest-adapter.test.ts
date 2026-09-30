import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vitestAdapter } from "../src/input/vitest.js";

const parseFixture = (name: string) => {
  const path = `test/fixtures/vitest/${name}`;
  return vitestAdapter.parse(path, readFileSync(path, "utf8"));
};

describe("vitestAdapter.match", () => {
  it("vitest を import したテストファイルを対象にする", () => {
    expect(vitestAdapter.match("a.test.ts", `import { it } from "vitest";`)).toBe(true);
  });
  it("globals モード（import なし）のテストファイルも対象にする", () => {
    expect(vitestAdapter.match("a.spec.js", `it("x", () => {})`)).toBe(true);
  });
  it("Playwright のテストは対象にしない", () => {
    expect(vitestAdapter.match("a.spec.ts", `import { test } from "@playwright/test";`)).toBe(false);
    expect(vitestAdapter.match("a.spec.ts", `test("x", async ({ page }) => {})`)).toBe(false);
  });
  it("テストファイル以外は対象にしない", () => {
    expect(vitestAdapter.match("src/a.ts", `import { it } from "vitest";`)).toBe(false);
  });
});

describe("vitestAdapter.parse（良いテスト）", () => {
  const file = parseFixture("cart.test.ts");

  it("describe の階層・テスト名・位置を取り出す", () => {
    expect(file.framework).toBe("vitest");
    expect(file.tests.map((t) => [t.suites, t.title, t.location])).toEqual([
      [["Cart", "add"], "商品を追加すると合計金額が増える", { line: 15, column: 5 }],
      [["Cart", "add"], "数量0を指定するとエラーになる", { line: 22, column: 5 }],
      [["Cart", "checkout"], "注文APIに明細を送り、注文番号を返す", { line: 28, column: 5 }],
    ]);
  });

  it("手順は expect 以外の文を1行ずつ要約し、モック設定は mock: と表す", () => {
    expect(file.tests[0]!.steps).toEqual(['cart.add({ id: "a", price: 100 }, 2)']);
    expect(file.tests[1]!.steps).toEqual([]);
    expect(file.tests[2]!.steps).toEqual([
      "mock: api.createOrder",
      'cart.add({ id: "a", price: 100 }, 1)',
      "const result = await cart.checkout()",
    ]);
  });

  it("アサーションを行番号つきで取り出す", () => {
    expect(file.tests[0]!.assertions).toEqual([
      { line: 18, text: "expect(cart.total).toBe(200)" },
      { line: 19, text: "expect(cart.items).toHaveLength(1)" },
    ]);
    expect(file.tests[1]!.assertions).toEqual([
      { line: 23, text: 'expect(() => cart.add({ id: "a", price: 100 }, 0)).toThrow("quantity must be positive")' },
    ]);
  });

  it("テストのソースを字下げを戻して保持する", () => {
    expect(file.tests[1]!.source).toBe(
      [
        'it("数量0を指定するとエラーになる", () => {',
        '  expect(() => cart.add({ id: "a", price: 100 }, 0)).toThrow("quantity must be positive");',
        "})",
      ].join("\n"),
    );
  });

  it("ID はパス・階層・テスト名から決まり、fingerprint は本体から決まる", () => {
    const again = parseFixture("cart.test.ts");
    expect(again.tests.map((t) => t.id)).toEqual(file.tests.map((t) => t.id));
    expect(new Set(file.tests.map((t) => t.id)).size).toBe(3);
    expect(file.tests.every((t) => /^[0-9a-f]{16}$/.test(t.fingerprint ?? ""))).toBe(true);
  });
});

describe("vitestAdapter.parse（警告が出るべきテスト）", () => {
  const file = parseFixture("weak.test.ts");
  const byTitle = (title: string) => {
    const found = file.tests.find((t) => t.title === title);
    if (!found) throw new Error(`not found: ${title}`);
    return found;
  };

  it("modifier を取り出し、describe.skip は配下のテストに引き継ぐ", () => {
    expect(byTitle("日付をパースできる").modifiers).toEqual(["only"]);
    expect(byTitle("タイムゾーンを考慮する").modifiers).toEqual(["skip"]);
    expect(byTitle("うるう年を扱う").modifiers).toEqual(["todo"]);
    expect(byTitle("formatPrice(%i) は %s").modifiers).toEqual(["each"]);
    expect(byTitle("古いフォーマットを受け付ける")).toMatchObject({ suites: ["legacy"], modifiers: ["skip"] });
  });

  it("ループで生成されるテストはテンプレートのままタイトルにする", () => {
    expect(byTitle("${n}桁をフォーマットする").modifiers).toEqual([]);
  });

  it("本体の無い todo は手順もアサーションも空", () => {
    expect(byTitle("うるう年を扱う")).toMatchObject({ steps: [], assertions: [] });
    expect(byTitle("うるう年を扱う").fingerprint).toBeUndefined();
  });

  it("try / catch などのブロックは本体を省略して要約する", () => {
    expect(byTitle("エラー時はメッセージを返す").steps).toEqual(["try { … } catch { … }"]);
  });

  it("spyOn はモック設定として要約する", () => {
    expect(byTitle("通知を送る").steps).toEqual(["mock: console.log", 'notify("hello")']);
  });

  it("コメントの有無は fingerprint に影響しない", () => {
    const same = file.tests.filter((t) => t.title.includes("1,000"));
    expect(same).toHaveLength(3);
    expect(new Set(same.map((t) => t.fingerprint)).size).toBe(1);
  });
});

describe("vitestAdapter.parse（条件つき宣言）", () => {
  it("it.skipIf(cond)(…) / it.runIf(cond)(…) をテストとして検出し、modifier はつけない", () => {
    const src = [
      'import { it, expect } from "vitest";',
      'it.skipIf(process.env.CI)("CI 以外で動く", () => { expect(1).toBe(1); });',
      'it.runIf(isMac)("Mac だけで動く", () => { expect(1).toBe(1); });',
      'it.concurrent.skip.each([1])("並列 %i", (n) => { expect(n).toBe(1); });',
    ].join("\n");
    const file = vitestAdapter.parse("a.test.ts", src);
    expect(file.tests.map((t) => [t.title, t.modifiers])).toEqual([
      ["CI 以外で動く", []],
      ["Mac だけで動く", []],
      ["並列 %i", ["skip", "each"]],
    ]);
  });
});
