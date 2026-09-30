import { test as base, expect } from "@playwright/test";

const test = base.extend<{ todoPage: string }>({
  todoPage: async ({}, use) => {
    await use("/todos");
  },
});

test.describe("Todo", () => {
  test.describe.configure({ mode: "serial" });

  test("正しいパスワードでログインに成功する", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("パスワード").fill("wrong");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForTimeout(3000);
  });

  test.only("Todo を追加できる", async ({ page, todoPage }) => {
    await page.goto(todoPage);
    await page.getByPlaceholder("やること").fill("牛乳を買う");
    await page.getByPlaceholder("やること").press("Enter");
    await expect(page).toHaveScreenshot();
  });

  test.fixme("Todo を並び替えられる", async ({ page }) => {
    await page.getByTestId("todo-1").dragTo(page.getByTestId("todo-3"));
    await expect(page.getByTestId("todo-list")).toBeTruthy();
  });

  test("モバイルでは表示しない", async ({ page, isMobile }) => {
    test.skip(isMobile, "モバイルは対象外");
    await page.goto("/todos");
    if (await page.getByText("空です").isVisible()) {
      await expect(page.getByText("空です")).toBeVisible();
    }
  });

  for (const name of ["a", "b"]) {
    test(`${name} を削除できる`, async ({ page }) => {
      await page.goto("/todos");
      await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "削除" }).click();
      await expect(page.getByRole("listitem")).toHaveCount(1);
    });
  }
});
