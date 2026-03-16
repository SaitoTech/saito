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
 */
import { test, expect, chromium, Browser, BrowserContext, Page } from "@playwright/test";
import path from "path";
import { NodeSet, NodeSetConfig, FIXTURES_DIR } from "../../src/node_set";
import { NodeConfig, NodeType, sleep } from "../../src/node";
import { TEST_KEY_PAIRS, BASE_PORT_NODEJS } from "../../src/fixtures";

// Use a port range well clear of the startup/peer tests (43000-43199)
const CHESS_BASE_PORT = BASE_PORT_NODEJS + 200;

// ── Shared state across sequential tests in this describe block ──────────────
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

test.describe("Chess game — two browser players", () => {
  test.beforeAll(async () => {
    test.setTimeout(480_000); // 8 minutes – includes node startup + full game

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
    // Separate processes → separate localStorage → different browser wallets
    browserA = await chromium.launch({ headless: true });
    browserB = await chromium.launch({ headless: true });

    ctxA = await browserA.newContext({ baseURL });
    ctxB = await browserB.newContext({ baseURL });

    pageA = await ctxA.newPage();
    pageB = await ctxB.newPage();
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
    await Promise.all([pageA.goto("/arcade"), pageB.goto("/arcade")]);

    await expect(pageA.locator(".arcade-teasers")).toBeVisible({ timeout: 60_000 });
    await expect(pageB.locator(".arcade-teasers")).toBeVisible({ timeout: 60_000 });
  });

  // ── Test 2: Player 1 creates a public Chess invite ───────────────────────
  test("player 1 creates a chess invite", async () => {
    // Click the Chess game tile
    await pageA.locator('[data-id="Chess"]').first().click();

    // Wait for the wizard overlay
    await pageA.waitForSelector(".arcade-wizard", { timeout: 15_000 });

    // Force-select "white" in the advanced-options form so Player 1 is always
    // white regardless of random assignment.  The wizard's getOptions() reads
    // ALL form inputs (including hidden advanced options), so we can set the
    // value without opening the advanced panel.
    await pageA.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="player1"]');
      if (sel) sel.value = "white";
    });

    // The "create public invite" button is inside a multi-select dropdown.
    // Click the outer toggle first to CSS-expose the inner buttons, then force-
    // click the target button (it may still be visually hidden by the toggle).
    const multiBtn = pageA.locator(".saito-multi-select_btn").first();
    if ((await multiBtn.count()) > 0) {
      await multiBtn.click();
    }
    await pageA.locator('.game-invite-btn[data-type="open"]').first().click({ force: true });

    // Wait for the invite card to appear in the sidebar
    const inviteCard = pageA.locator('[id^="saito-game-"]').first();
    await inviteCard.waitFor({ timeout: 30_000 });

    const rawId = await inviteCard.getAttribute("id");
    gameId = rawId!.replace("saito-game-", "");
    expect(gameId).toBeTruthy();
  });

  // ── Test 3: Player 2 sees and joins the invite ───────────────────────────
  test("player 2 joins the chess invite", async () => {
    // The node relays the invite tx to all connected clients; Player 2's arcade
    // receives it and renders the invite card in the sidebar.
    const p2Invite = pageB.locator(`#saito-game-${gameId}`);
    await p2Invite.waitFor({ timeout: 60_000 });

    // Click the invite card to open the lounge overlay
    await p2Invite.click();
    await pageB.waitForSelector(".arcade-lounge", { timeout: 10_000 });

    // Player 2 may be asked about an open invite of their own; dismiss if needed
    const joinBtn = pageB.locator("#arcade-game-controls-join-game");
    await joinBtn.waitFor({ timeout: 10_000 });
    await joinBtn.click();
  });

  // ── Test 4: both players navigate to the chess board ────────────────────
  test("both players navigate to the chess board", async () => {
    const gameUrl = `/chess/#gid=${encodeURIComponent(gameId)}`;

    // Give the server a moment to process the join transaction, then navigate
    await sleep(3_000);
    await Promise.all([pageA.goto(gameUrl), pageB.goto(gameUrl)]);

    // Wait for the chess board to be rendered on both pages
    await expect(pageA.locator("#board")).toBeVisible({ timeout: 60_000 });
    await expect(pageB.locator("#board")).toBeVisible({ timeout: 60_000 });
  });

  // ── Test 5: four moves are played ───────────────────────────────────────
  test("each player makes two moves", async () => {
    // Player 1 forced 'white', so pageA goes first (target = 1 = white).
    // Wait briefly for the board to finish initialising.
    await sleep(2_000);

    // Move 1 – White: e2 → e4
    await expectMove(pageA, "e2", "e4");
    await sleep(3_000); // let the relay deliver the move to pageB

    // Move 2 – Black: e7 → e5
    await expectMove(pageB, "e7", "e5");
    await sleep(3_000);

    // Move 3 – White: d2 → d4
    await expectMove(pageA, "d2", "d4");
    await sleep(3_000);

    // Move 4 – Black: d7 → d5
    await expectMove(pageB, "d7", "d5");
    await sleep(3_000);
  });

  // ── Test 6: white resigns and both browsers see "Game Over" ─────────────
  test("white player resigns and game ends for both", async () => {
    // ── White (pageA) triggers the resign flow ────────────────────────────
    // Open the "Game" menu item in the top toolbar
    await pageA.locator("#game-game").click();

    // Wait for the "Resign" sub-menu entry and click it
    await pageA.waitForSelector("#game-resign", { timeout: 5_000 });
    await pageA.locator("#game-resign").click();

    // Handle the sconfirm() dialog: a custom in-page modal (not a native dialog)
    await pageA.waitForSelector("#saito-alert", { timeout: 10_000 });
    await pageA.locator("#alert-ok").click();

    // ── Verify game-over on both browsers ────────────────────────────────
    // The resign tx propagates via relay; the winner (black) sends a gameover tx
    // which both sides receive, causing gameOverUserInterface() to update #status.
    await expect(pageA.locator("#status")).toContainText("Game Over", { timeout: 30_000 });
    await expect(pageB.locator("#status")).toContainText("Game Over", { timeout: 30_000 });
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Drags a chess piece from `from` square to `to` square and confirms the move
 * via the in-game confirm popup (#confirm button).
 * Asserts that the confirm dialog actually appeared (i.e. the move was legal
 * and it was the player's turn).
 */
async function expectMove(page: Page, from: string, to: string): Promise<void> {
  const succeeded = await tryMakeMove(page, from, to);
  expect(
    succeeded,
    `Expected move ${from}-${to} to succeed (confirm dialog should have appeared)`
  ).toBe(true);
}

/**
 * Simulates dragging a chess piece from `from` to `to`.
 * Returns true if the move confirmation popup appeared and was accepted,
 * false if the move was rejected (not the player's turn or illegal move).
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

  // Simulate a drag: mousedown on the piece, move to the target square, mouseup
  await page.mouse.move(cx(srcBox), cy(srcBox));
  await page.mouse.down();
  await page.mouse.move(cx(tgtBox), cy(tgtBox), { steps: 15 });
  await page.mouse.up();

  // If the move was accepted, a confirmation popup appears with #confirm
  try {
    await page.waitForSelector("#confirm", { timeout: 3_000 });
    await page.locator("#confirm").click();
    return true;
  } catch {
    // No popup → move was rejected (wrong turn or illegal)
    return false;
  }
}
