import { expect, test } from "@playwright/test";

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("succeeds with the correct password", async ({ page }) => {
    await test.step("Open the login page", async () => {
      await page.goto("/login");
    });
    await test.step("Enter the credentials", async () => {
      await page.getByLabel("Email").fill("a@b.c");
      await page.getByLabel("Password").fill("correct-horse");
      await test.step("Submit", async () => {
        await page.getByRole("button", { name: "Log in" }).click();
      });
    });

    await expect(page).toHaveURL("/home");
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  });

  test("shows an error for a wrong password", async ({ page }) => {
    const submit = page.getByRole("button", { name: "Log in" });
    await page.getByLabel("Email").fill("a@b.c");
    await page.getByLabel("Password").fill("wrong");
    await submit.click();
    await page.keyboard.press("Escape");
    await page.locator(".toast").nth(0).hover();

    await expect(page.getByRole("alert")).toHaveText("Incorrect email or password");
    await expect(page).toHaveURL("/login");
  });

  test.describe("API", () => {
    test("issues a token", async ({ request }) => {
      const res = await request.post("/api/token", { data: { user: "a" } });
      const body = await res.json();
      expect(res.status()).toBe(200);
      expect(body.token).toMatch(/^ey/);
    });
  });
});
