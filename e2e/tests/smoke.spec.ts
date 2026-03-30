import { expect, test } from "@playwright/test";

test("node app serves the website landing page", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  const body = page.locator("body");

  expect(response).not.toBeNull();
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle("Saito");
  await expect(body).toContainText("Social");
  await expect(body).toContainText("Red Square");
  await expect(body).toContainText("Peer to Peer social");
});