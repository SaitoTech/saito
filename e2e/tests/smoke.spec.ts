import { expect, test } from "@playwright/test";

test("playwright smoke test", async ({ page }) => {
  await page.setContent(`
    <html>
      <head>
        <title>Saito E2E Smoke Test</title>
      </head>
      <body>
        <main>
          <h1>Playwright setup works</h1>
          <p data-testid="status">ok</p>
        </main>
      </body>
    </html>
  `);

  await expect(page).toHaveTitle("Saito E2E Smoke Test");
  await expect(page.getByRole("heading", { name: "Playwright setup works" })).toBeVisible();
  await expect(page.getByTestId("status")).toHaveText("ok");
});