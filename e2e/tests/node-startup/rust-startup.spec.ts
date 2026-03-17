import { test, expect } from "@playwright/test";
import fs from "fs";
import { NodeSet, NodeSetConfig } from "../../src/node_set";
import { NodeConfig, NodeType } from "../../src/node";
import { TEST_KEY_PAIRS, BASE_PORT_RUST } from "../../src/fixtures";
import { RUST_BINARY_PATH } from "../../src/rust_node";

const rustAvailable = fs.existsSync(RUST_BINARY_PATH);

test.describe("Rust node — single node startup", () => {
  let nodeSet: NodeSet;

  test.beforeAll(async () => {
    if (!rustAvailable) return; // skipped tests below won't reach this
    test.setTimeout(120_000);

    const configSet = new NodeSetConfig();
    configSet.basePort = BASE_PORT_RUST;
    configSet.parentDir = `rust-startup-${Date.now()}`;

    const cfg = new NodeConfig();
    cfg.name = "rust1";
    cfg.nodeType = NodeType.RUST;
    cfg.port = 1; // actual port = BASE_PORT_RUST + 1
    cfg.isGenesis = true;
    cfg.privateKey = TEST_KEY_PAIRS[0].privateKey;
    cfg.publicKey = TEST_KEY_PAIRS[0].publicKey;
    configSet.nodeConfigs.push(cfg);

    nodeSet = new NodeSet(configSet);
    await nodeSet.bootstrap();
    await nodeSet.startNodes();
  });

  test.afterAll(async () => {
    if (nodeSet) await nodeSet.stopNodes();
  });

  test("node starts and reports healthy status", async () => {
    test.skip(!rustAvailable, "Rust binary not built — skipping Rust tests");
    const node = nodeSet.getNode("rust1")!;
    expect(await node.isRunning()).toBe(true);
  });

  test("test-api/status returns HTTP 200", async ({ request }) => {
    test.skip(!rustAvailable, "Rust binary not built — skipping Rust tests");
    const node = nodeSet.getNode("rust1")!;
    const response = await request.get(node.testApiUrl("status"));
    expect(response.status()).toBe(200);
  });
});
