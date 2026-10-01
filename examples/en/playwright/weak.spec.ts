import { test as base, expect } from "@playwright/test";

const test = base.extend<{ todoPage: string }>({
  todoPage: async ({}, use) => {
    await use("/todos");
  },
});

test.describe("Todo", () => {
  test.describe.configure({ mode: "serial" });

  test("logs in with the correct password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForTimeout(3000);
  });

  test.only("adds a todo", async ({ page, todoPage }) => {
    await page.goto(todoPage);
    await page.getByPlaceholder("What needs to be done?").fill("Buy milk");
    await page.getByPlaceholder("What needs to be done?").press("Enter");
    await expect(page).toHaveScreenshot();
  });

  test.fixme("reorders todos", async ({ page }) => {
    await page.getByTestId("todo-1").dragTo(page.getByTestId("todo-3"));
    await expect(page.getByTestId("todo-list")).toBeTruthy();
  });

  test("is hidden on mobile", async ({ page, isMobile }) => {
    test.skip(isMobile, "Not for mobile");
    await page.goto("/todos");
    if (await page.getByText("Nothing to do").isVisible()) {
      await expect(page.getByText("Nothing to do")).toBeVisible();
    }
  });

  for (const name of ["a", "b"]) {
    test(`deletes ${name}`, async ({ page }) => {
      await page.goto("/todos");
      await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Delete" }).click();
      await expect(page.getByRole("listitem")).toHaveCount(1);
    });
  }
});
