/**
 * E2E test: two browsers play a chess game end-to-end.
 *
 * Flow:
 *   1. Start a single Node.js server with arcade + chess modules.
 *   2. Browser A (Player 1) navigates to /arcade, creates a public Chess invite
 *      with "white" colour selected so Player 1 is always white.
 *   3. Browser B (Player 2) waits for the invite to appear in their sidebar
 *      (relayed by the server), then joins via the lounge overlay.
 *   4. Both browsers navigate to the chess game URL.
 *   5. Four moves are played: white e2-e4, black e7-e5, white d2-d4, black d7-d5.
 *   6. White resigns; both browsers see the "Game Over" status.
 *
 * Uses test.describe.serial so that:
 *  - beforeAll / afterAll run exactly once for the whole block.
 *  - A failure in an earlier step skips (not re-runs) later steps.
 */
import { test, expect, chromium, Browser, BrowserContext, Page } from "@playwright/test";
import path from "path";
import { NodeSet, NodeSetConfig, FIXTURES_DIR } from "../../src/node_set";
import { NodeConfig, NodeType, sleep } from "../../src/node";
import { TEST_KEY_PAIRS, BASE_PORT_NODEJS } from "../../src/fixtures";

// Use a port range well clear of the other tests (43000-43199)
const CHESS_BASE_PORT = BASE_PORT_NODEJS + 200;

// ── Shared state across the serial test steps ────────────────────────────────
let nodeSet: NodeSet;
let browserA: Browser;
let browserB: Browser;
let ctxA: BrowserContext;
let ctxB: BrowserContext;
/** Player 1 – creates the invite and plays as white */
let pageA: Page;
/** Player 2 – joins the invite and plays as black */
let pageB: Page;
let serverPort: number;
let gameId: string;

// ─────────────────────────────────────────────────────────────────────────────

// test.describe.serial guarantees:
//   • beforeAll / afterAll each run exactly once
//   • if any test fails, the rest are skipped rather than re-run
test.describe.serial("Chess game — two browser players", () => {
  test.beforeAll(async () => {
    // Give the whole suite (including node startup + full game) 10 minutes
    test.setTimeout(600_000);

    // ── Spin up the saito Node.js server ─────────────────────────────────────
    const configSet = new NodeSetConfig();
    configSet.basePort = CHESS_BASE_PORT;
    configSet.parentDir = `chess-browser-${Date.now()}`;
    configSet.modulesConfigFile = path.join(FIXTURES_DIR, "modules.config.chess.js");

    const nodeCfg = new NodeConfig();
    nodeCfg.name = "node1";
    nodeCfg.nodeType = NodeType.NODEJS;
    nodeCfg.port = 1;
    nodeCfg.isGenesis = true;
    nodeCfg.privateKey = TEST_KEY_PAIRS[0].privateKey;
    nodeCfg.publicKey = TEST_KEY_PAIRS[0].publicKey;
    configSet.nodeConfigs.push(nodeCfg);

    // Fund both test keys so either can pay tx fees if needed
    configSet.issuance = [
      { key: TEST_KEY_PAIRS[0].publicKey, amount: BigInt(1_000_000_000) },
      { key: TEST_KEY_PAIRS[1].publicKey, amount: BigInt(1_000_000_000) },
    ];

    nodeSet = new NodeSet(configSet);
    await nodeSet.bootstrap();
    await nodeSet.startNodes();

    serverPort = nodeSet.getNode("node1")!.port;
    const baseURL = `http://127.0.0.1:${serverPort}`;

    // ── Launch two independent browser instances ──────────────────────────────
    // --no-sandbox is required when running headless Chromium inside containers
    // or as root.  --disable-dev-shm-usage prevents crashes on /dev/shm limits.
    const launchOpts = {
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    };
    browserA = await chromium.launch(launchOpts);
    browserB = await chromium.launch(launchOpts);

    ctxA = await browserA.newContext({ baseURL });
    ctxB = await browserB.newContext({ baseURL });

    pageA = await ctxA.newPage();
    pageB = await ctxB.newPage();

    // Pipe browser console / errors into the test log for easier debugging
    for (const [label, page] of [["A", pageA], ["B", pageB]] as const) {
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          console.log(`[browser-${label} ERROR] ${msg.text()}`);
        }
      });
      page.on("pageerror", (err) => {
        console.log(`[browser-${label} EXCEPTION] ${err.message}`);
      });
    }
  });

  test.afterAll(async () => {
    await pageA?.close().catch(() => {});
    await pageB?.close().catch(() => {});
    await ctxA?.close().catch(() => {});
    await ctxB?.close().catch(() => {});
    await browserA?.close().catch(() => {});
    await browserB?.close().catch(() => {});
    await nodeSet?.stopNodes().catch(() => {});
  });

  // ── Test 1: arcade loads in both browsers ────────────────────────────────
  test("both browsers load /arcade", async () => {
    test.setTimeout(180_000);

    await Promise.all([pageA.goto("/arcade"), pageB.goto("/arcade")]);

    // Wait for network activity to settle before asserting DOM state
    await Promise.all([
      pageA.waitForLoadState("networkidle"),
      pageB.waitForLoadState("networkidle"),
    ]);

    // The Chess game tile (#Chess / [data-id="Chess"]) is rendered by
    // ArcadeMain once the saito.js bundle initialises the arcade module and
    // populates mod.mods with the chess game.  This is more reliable than
    // checking .arcade-teasers which is an empty 0×0 div until content is
    // injected, which can fail Playwright's visible check.
    await expect(pageA.locator('[data-id="Chess"]').first()).toBeVisible({ timeout: 120_000 });
    await expect(pageB.locator('[data-id="Chess"]').first()).toBeVisible({ timeout: 120_000 });
  });

  // ── Test 2: Player 1 creates a public Chess invite ───────────────────────
  test("player 1 creates a chess invite", async () => {
    test.setTimeout(120_000);

    // Click the Chess game tile
    await pageA.locator('[data-id="Chess"]').first().click();

    // Wait for the wizard overlay to be in DOM
    await pageA.waitForSelector(".arcade-wizard", { timeout: 15_000 });

    // Small pause to let the wizard's attachEvents() settle after DOM injection
    await sleep(800);

    // Set color and trigger the invite in one atomic evaluate() call.
    // Using page.evaluate / btn.click() avoids Playwright mouse events that
    // can bubble to the overlay's backdrop and inadvertently close the wizard.
    // getOptions() in wizard.js reads from both .arcade-wizard and
    // #advanced-options-overlay-container, so setting the hidden select is
    // picked up correctly.
    await pageA.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="player1"]');
      if (sel) sel.value = "white";
      const btn = document.querySelector<HTMLElement>('.game-invite-btn[data-type="open"]');
      if (!btn) throw new Error('game-invite-btn[data-type="open"] not found in DOM');
      btn.click();
    });

    // Wait for the invite card to appear in Player 1's sidebar
    const inviteCard = pageA.locator('[id^="saito-game-"]').first();
    await inviteCard.waitFor({ timeout: 30_000 });

    const rawId = await inviteCard.getAttribute("id");
    gameId = rawId!.replace("saito-game-", "");
    expect(gameId).toBeTruthy();
  });

  // ── Test 3: Player 2 sees and joins the invite ───────────────────────────
  test("player 2 joins the chess invite", async () => {
    test.setTimeout(120_000);

    // The node relays the invite tx to Player 2's arcade which renders the card
    const p2Invite = pageB.locator(`#saito-game-${gameId}`);
    await p2Invite.waitFor({ timeout: 60_000 });

    // Click the invite card to open the lounge overlay
    await p2Invite.click();
    await pageB.waitForSelector(".arcade-lounge", { timeout: 10_000 });

    // Click "join game" in the lounge
    const joinBtn = pageB.locator("#arcade-game-controls-join-game");
    await joinBtn.waitFor({ timeout: 10_000 });
    await joinBtn.click();
  });

  // ── Test 4: both players navigate to the chess board ────────────────────
  test("both players navigate to the chess board", async () => {
    test.setTimeout(120_000);

    const gameUrl = `/chess/#gid=${encodeURIComponent(gameId)}`;

    // Give the server a moment to process the join transaction
    await sleep(4_000);
    await Promise.all([pageA.goto(gameUrl), pageB.goto(gameUrl)]);

    // Wait for the chess board to be rendered on both pages
    await expect(pageA.locator("#board")).toBeVisible({ timeout: 90_000 });
    await expect(pageB.locator("#board")).toBeVisible({ timeout: 90_000 });
  });

  // ── Test 5: four moves are played ───────────────────────────────────────
  test("each player makes two moves", async () => {
    test.setTimeout(180_000);

    // Wait briefly for the board to finish initialising drag-and-drop
    await sleep(3_000);

    // Move 1 – White: e2 → e4
    await expectMove(pageA, "e2", "e4");
    await sleep(4_000); // let the relay deliver the move

    // Move 2 – Black: e7 → e5
    await expectMove(pageB, "e7", "e5");
    await sleep(4_000);

    // Move 3 – White: d2 → d4
    await expectMove(pageA, "d2", "d4");
    await sleep(4_000);

    // Move 4 – Black: d7 → d5
    await expectMove(pageB, "d7", "d5");
    await sleep(4_000);
  });

  // ── Test 6: white resigns and both browsers see "Game Over" ─────────────
  test("white player resigns and game ends for both", async () => {
    test.setTimeout(120_000);

    // A hidden stale alert container can remain in the DOM from earlier UI
    // interactions. sconfirm() bails out if #saito-alert already exists, so
    // remove it before triggering the resign flow.
    await pageA.evaluate(() => {
      document.getElementById("saito-alert")?.remove();
    });

    // Open the "Game" menu item in the top toolbar
    await pageA.locator("#game-game").click();

    // Wait for the "Resign" sub-menu entry and click it
    await pageA.waitForSelector("#game-resign", { timeout: 5_000 });
    await pageA.locator("#game-resign").click();

    // Handle the sconfirm() dialog — a custom in-page modal (#saito-alert)
    await pageA.waitForSelector("#alert-ok", { state: "visible", timeout: 10_000 });
    await pageA.locator("#alert-ok").click();

    // Both sides receive the relay-delivered gameover transaction and update
    // #status with "Game Over: …"
    await expect(pageA.locator("#status")).toContainText("Game Over", { timeout: 60_000 });
    await expect(pageB.locator("#status")).toContainText("Game Over", { timeout: 60_000 });
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Drags a chess piece from `from` square to `to` and accepts the confirm popup.
 * Asserts that the confirm dialog appeared (proving the move was legal and it
 * was that player's turn).
 */
async function expectMove(page: Page, from: string, to: string): Promise<void> {
  const ok = await tryMakeMove(page, from, to);
  expect(ok, `Expected move ${from}-${to} to succeed`).toBe(true);
}

/**
 * Simulates a drag from `from` to `to`.
 * Returns true if the move confirmation popup appeared and was accepted.
 */
async function tryMakeMove(page: Page, from: string, to: string): Promise<boolean> {
  const src = page.locator(`.square-${from}`);
  const tgt = page.locator(`.square-${to}`);

  const srcBox = await src.boundingBox();
  const tgtBox = await tgt.boundingBox();
  if (!srcBox || !tgtBox) return false;

  const cx = (b: { x: number; y: number; width: number; height: number }) =>
    b.x + b.width / 2;
  const cy = (b: { x: number; y: number; width: number; height: number }) =>
    b.y + b.height / 2;

  await page.mouse.move(cx(srcBox), cy(srcBox));
  await page.mouse.down();
  await page.mouse.move(cx(tgtBox), cy(tgtBox), { steps: 15 });
  await page.mouse.up();

  // If the move was accepted a confirmation popup appears with #confirm
  try {
    await page.waitForSelector("#confirm", { timeout: 4_000 });
    await page.locator("#confirm").click();
    return true;
  } catch {
    return false;
  }
}
