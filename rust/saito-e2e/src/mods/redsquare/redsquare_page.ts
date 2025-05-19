import { type Page, type Locator, expect } from "@playwright/test";
import ModulePage from "../module_page";

export default class RedsquarePage extends ModulePage {
  constructor(page: Page) {
    super(page, "/redsquare");
  }

  async createNewTweet() {
    const selectors = {
      newTweetButton: "#new-tweet",
      tweetTextArea: "#post-tweet-textarea",
      postTweetButton: "#post-tweet-button",
      tweetTextElement: ".tweet-text",
    };
    await this.page.locator(selectors.newTweetButton).click();
    await this.page.locator(selectors.tweetTextArea).waitFor();

    const tweetText = "Hello, this is a test tweet!";
    await this.page.locator(selectors.tweetTextArea).fill(tweetText);

    await this.page.locator(selectors.postTweetButton).click();

    await this.page.locator(`${selectors.tweetTextElement}`, { hasText: tweetText }).waitFor();

    await expect(this.page.locator(`${selectors.tweetTextElement}`)).toBeVisible();
  }
}
