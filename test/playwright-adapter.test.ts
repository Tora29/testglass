import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playwrightAdapter } from "../src/input/playwright.js";

const parseFixture = (name: string) => {
  const path = `test/fixtures/playwright/${name}`;
  return playwrightAdapter.parse(path, readFileSync(path, "utf8"));
};

describe("playwrightAdapter.match", () => {
  it("@playwright/test を import したファイルを対象にする", () => {
    expect(playwrightAdapter.match("e2e/a.spec.ts", `import { test } from "@playwright/test";`)).toBe(true);
  });
  it("自作 fixtures 経由でも、本体が page などを受け取っていれば対象にする", () => {
    const src = `import { test } from "./fixtures";\ntest("x", async ({ page }) => {});`;
    expect(playwrightAdapter.match("e2e/a.spec.ts", src)).toBe(true);
  });
  it("Vitest のファイルは対象にしない", () => {
    expect(playwrightAdapter.match("a.spec.ts", `import { test } from "vitest";`)).toBe(false);
    expect(playwrightAdapter.match("a.spec.ts", `test("x", () => {})`)).toBe(false);
  });
});

describe("playwrightAdapter.parse（良いテスト）", () => {
  const file = parseFixture("login.spec.ts");

  it("test.describe の階層を取り出し、フックはテストとして扱わない", () => {
    expect(file.framework).toBe("playwright");
    expect(file.tests.map((t) => [t.suites, t.title])).toEqual([
      [["ログイン"], "正しいパスワードで成功する"],
      [["ログイン"], "パスワードが違うとエラーを表示する"],
      [["ログイン", "API"], "トークンを発行する"],
    ]);
  });

  it("test.step があればタイトルを手順にし、入れ子は字下げで表す", () => {
    expect(file.tests[0]!.steps).toEqual(["ログイン画面を開く", "認証情報を入力", "  送信する"]);
  });

  it("test.step が無ければ操作呼び出しを要約する", () => {
    expect(file.tests[1]!.steps).toEqual([
      "fill [メール] ← a@b.c",
      "fill [パスワード] ← wrong",
      "click button[ログイン]",
      "keyboard.press Escape",
      "hover .toast >> nth(0)",
    ]);
  });

  it("操作が無ければ（API テストなど）文を1行ずつ要約する", () => {
    expect(file.tests[2]!.steps).toEqual([
      'const res = await request.post("/api/token", { data: { user: "a" } })',
      "const body = await res.json()",
    ]);
  });

  it("test.step の中のアサーションも取り出す", () => {
    expect(file.tests[0]!.assertions.map((a) => a.text)).toEqual([
      'expect(page).toHaveURL("/home")',
      'expect(page.getByRole("heading", { name: "ようこそ" })).toBeVisible()',
    ]);
  });
});

describe("playwrightAdapter.parse（警告が出るべきテスト）", () => {
  const file = parseFixture("weak.spec.ts");
  const byTitle = (title: string) => {
    const found = file.tests.find((t) => t.title === title);
    if (!found) throw new Error(`not found: ${title}`);
    return found;
  };

  it("base.extend() で作ったテスト関数も検出し、実行時の test.skip(cond) は宣言とみなさない", () => {
    expect(file.tests.map((t) => t.title)).toEqual([
      "正しいパスワードでログインに成功する",
      "Todo を追加できる",
      "Todo を並び替えられる",
      "モバイルでは表示しない",
      "${name} を削除できる",
    ]);
  });

  it("test.only / test.fixme を modifier にする（fixme は skip）", () => {
    expect(byTitle("Todo を追加できる").modifiers).toEqual(["only"]);
    expect(byTitle("Todo を並び替えられる").modifiers).toEqual(["skip"]);
    expect(byTitle("モバイルでは表示しない").modifiers).toEqual([]);
  });

  it("固定時間の待ちや dragTo も手順に含める", () => {
    expect(byTitle("正しいパスワードでログインに成功する").steps).toEqual([
      "goto /login",
      "fill [パスワード] ← wrong",
      "click button[ログイン]",
      "waitForTimeout 3000",
    ]);
    expect(byTitle("Todo を並び替えられる").steps).toEqual(["dragTo testid[todo-1] → testid[todo-3]"]);
  });

  it("変数を渡した操作は式のまま、filter は短く要約する", () => {
    expect(byTitle("Todo を追加できる").steps).toEqual([
      "goto todoPage",
      "fill placeholder[やること] ← 牛乳を買う",
      "press placeholder[やること] ← Enter",
    ]);
    expect(byTitle("${name} を削除できる").steps).toEqual([
      "goto /todos",
      "click listitem >> filter({ hasText: name }) >> button[削除]",
    ]);
  });
});
