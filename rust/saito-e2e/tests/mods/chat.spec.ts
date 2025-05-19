import { expect, test } from "@playwright/test";

test.skip("chat loading in arcade", async ({ page }) => {
  await page.goto("/arcade");

  await expect(page).toHaveTitle("Saito Arcade");

  await page.waitForTimeout(1000);

  let chatManager = await page.locator(".chat-manager-list> .saito-user").click();

  let chatInput = await page.$(".chat-footer > .saito-input > #text-input");

  expect(chatInput).toBeTruthy();

  let testText = "E2E Test";

  await chatInput.fill(testText);
  await chatInput.press("Enter");

  let chatMsg = await page.$(".chat-body > .saito-user:last-child > .saito-userline");
  expect(chatMsg).toBeTruthy();

  let newContext = await page.context().browser().newContext();
  let newPage = await newContext.newPage();

  await newPage.goto("/arcade");

  await newPage.waitForTimeout(1000);

  chatMsg = await page.$(".chat-body > .saito-user:last-child > .saito-userline");
  expect(chatMsg).toBeTruthy();
  let text = await chatMsg.innerText();
  console.log(text, testText);
  expect(text.trim()).toEqual(testText.trim());

  // await newContext.browser().close();
});
