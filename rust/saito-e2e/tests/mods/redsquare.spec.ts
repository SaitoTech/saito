import { test } from '@playwright/test';
import Redsquare from "../../src/mods/redsquare/redsquare_page";

test.skip("Should load redsquare", async ({ page }) => {
    let redsquare = new Redsquare(page);
    await redsquare.goto();
});

test.skip("Should create new tweets", async ({ page }) => {
    let redsquare = new Redsquare(page);
    await redsquare.goto();
    await redsquare.createNewTweet();
});
