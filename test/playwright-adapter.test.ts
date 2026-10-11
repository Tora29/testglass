import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importsAny } from "../src/input/js/adapter.js";
import { looksLikePlaywright, PLAYWRIGHT_MODULES, playwrightAdapter } from "../src/input/playwright.js";
import { vitestAdapter } from "../src/input/vitest.js";

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

describe("looksLikePlaywright", () => {
  /** 以前の判定（線形時間の実装に置き換えた。同じものに一致するかを突き合わせる） */
  const LEGACY_FIXTURE_PARAM = /\(\s*\{[^}]*\b(page|context|browser|browserName|request)\b[^}]*\}\s*(?:,[^)]*)?\)\s*=>/;
  const LEGACY_IMPORT = (m: string) =>
    new RegExp(
      `(?:from\\s*|import\\s*\\(?\\s*|require\\s*\\(\\s*)["']${m.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}["']`,
    );

  it.each([
    ["async ({ page }) =>", true],
    ["({page},testInfo)=>", true],
    ["( {\n  context,\n  request: r\n}\n) \n=>", true],
    ["({ a: { page } }) =>", false],
    ["({ browserName }) =>", true],
    ["({ pages }) =>", false],
    ["({ _page }) =>", false],
    ["({ page }) => {} // ではなく ({ page })", true],
    ["({ page })", false],
    ["({ page }: Fixtures) =>", false],
    ["function ({ page }) {}", false],
    ["({ page }, x", false],
  ])("%j → %s", (src, expected) => {
    expect(looksLikePlaywright(src)).toBe(expected);
    expect(LEGACY_FIXTURE_PARAM.test(src)).toBe(expected);
  });

  it("以前の正規表現と同じ判定になる（`({ page }, x) =>` を崩した入力で突き合わせる）", () => {
    const pieces = ["(", ")", "{", "}", ",", " ", "\n", "\u00a0", "=>", "=", ">", ":", "page", "browserName"];
    pieces.push("browser", "pages", "x", "_", "request", "é");
    const template = ["(", " ", "{", " ", "page", ",", " ", "x", " ", "}", " ", ",", " ", "x", ")", " ", "=>"];
    let seed = 1;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const piece = () => pieces[rand(pieces.length)]!;
    let matched = 0;
    for (let k = 0; k < 20000; k++) {
      // 字句を、ときどき落とす・別の字句に替える・後ろに字句を足す
      const tokens: string[] = Array.from({ length: rand(2) * rand(6) }, piece);
      for (const token of template) {
        const r = rand(10);
        if (r === 1) tokens.push(piece());
        else if (r === 2) tokens.push(token, piece());
        else if (r !== 0) tokens.push(token);
      }
      const src = tokens.join("");
      const expected = LEGACY_FIXTURE_PARAM.test(src);
      if (expected) matched++;
      expect(looksLikePlaywright(src), JSON.stringify(src)).toBe(expected);
    }
    // 一致する入力・しない入力の両方を十分に試している
    expect(matched).toBeGreaterThan(1000);
    expect(matched).toBeLessThan(19000);
  });

  it("import の判定は以前の正規表現と同じになる", () => {
    for (const src of [
      'import { test } from "@playwright/test"',
      "import{test}from'@playwright/test'",
      'await import ( "@playwright/test")',
      'await import("@playwright/test")',
      'import "@playwright/test"',
      'require ( "@playwright/test" )',
      'require("@playwright/test")',
      'require "@playwright/test"',
      'import ((("@playwright/test")',
      'from"playwright/test"',
    ]) {
      const legacy = PLAYWRIGHT_MODULES.some((m) => LEGACY_IMPORT(m).test(src));
      expect(importsAny(src, PLAYWRIGHT_MODULES), src).toBe(legacy);
    }
  });

  // 以前の正規表現では、"({page ".repeat(2000)（14KB）で約7秒、import の後の 50KB の空白で約1秒かかっていた
  it.each([
    ["`}` の無い ({page の繰り返し", "({page ".repeat(7200)],
    ["`)` の無い ({page}, の繰り返し", "({page},".repeat(6300)],
    ["`=>` の無い ({page}) の繰り返し", `${"({page},".repeat(3000)})${" ".repeat(26000)}`],
    ["( の後の長い空白", `(${" ".repeat(50000)}`],
    ["import の後の長い空白", `import${" ".repeat(50000)}`],
  ])("細工した約 50KB の入力でもすぐに終わる（%s）", (_, src) => {
    expect(src.length).toBeGreaterThanOrEqual(50000);
    const start = performance.now();
    looksLikePlaywright(src);
    playwrightAdapter.match("a.spec.ts", src);
    vitestAdapter.match("a.test.ts", src);
    expect(performance.now() - start).toBeLessThan(200);
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
