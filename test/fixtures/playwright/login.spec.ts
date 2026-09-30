import { expect, test } from "@playwright/test";

test.describe("ログイン", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("正しいパスワードで成功する", async ({ page }) => {
    await test.step("ログイン画面を開く", async () => {
      await page.goto("/login");
    });
    await test.step("認証情報を入力", async () => {
      await page.getByLabel("メール").fill("a@b.c");
      await page.getByLabel("パスワード").fill("correct-horse");
      await test.step("送信する", async () => {
        await page.getByRole("button", { name: "ログイン" }).click();
      });
    });

    await expect(page).toHaveURL("/home");
    await expect(page.getByRole("heading", { name: "ようこそ" })).toBeVisible();
  });

  test("パスワードが違うとエラーを表示する", async ({ page }) => {
    const submit = page.getByRole("button", { name: "ログイン" });
    await page.getByLabel("メール").fill("a@b.c");
    await page.getByLabel("パスワード").fill("wrong");
    await submit.click();
    await page.keyboard.press("Escape");
    await page.locator(".toast").nth(0).hover();

    await expect(page.getByRole("alert")).toHaveText("メールまたはパスワードが違います");
    await expect(page).toHaveURL("/login");
  });

  test.describe("API", () => {
    test("トークンを発行する", async ({ request }) => {
      const res = await request.post("/api/token", { data: { user: "a" } });
      const body = await res.json();
      expect(res.status()).toBe(200);
      expect(body.token).toMatch(/^ey/);
    });
  });
});
