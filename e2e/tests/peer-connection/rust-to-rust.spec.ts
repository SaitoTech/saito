import { test, expect } from "@playwright/test";
import fs from "fs";
import { NodeSet, NodeSetConfig } from "../../src/node_set";
import { NodeConfig, NodeType, sleep } from "../../src/node";
import { TEST_KEY_PAIRS, BASE_PORT_RUST } from "../../src/fixtures";
import { RUST_BINARY_PATH } from "../../src/rust_node";

const rustAvailable = fs.existsSync(RUST_BINARY_PATH);

/**
 * Two Rust nodes where node2 is configured to peer with node1.
 * All tests skip automatically when the Rust binary has not been built.
 */
test.describe("Rust to Rust — peer connection", () => {
  let nodeSet: NodeSet;

  test.beforeAll(async () => {
    if (!rustAvailable) return;
    test.setTimeout(180_000);

    const configSet = new NodeSetConfig();
    configSet.basePort = BASE_PORT_RUST + 100;
    configSet.parentDir = `rust-peer-${Date.now()}`;

    const node1 = new NodeConfig();
    node1.name = "rust1";
    node1.nodeType = NodeType.RUST;
    node1.port = 1;
    node1.isGenesis = true;
    node1.privateKey = TEST_KEY_PAIRS[0].privateKey;
    node1.publicKey = TEST_KEY_PAIRS[0].publicKey;

    const node2 = new NodeConfig();
    node2.name = "rust2";
    node2.nodeType = NodeType.RUST;
    node2.port = 2;
    node2.isGenesis = true;
    node2.privateKey = TEST_KEY_PAIRS[1].privateKey;
    node2.publicKey = TEST_KEY_PAIRS[1].publicKey;
    node2.peerLabels = ["rust1"];

    configSet.nodeConfigs.push(node1, node2);

    nodeSet = new NodeSet(configSet);
    await nodeSet.bootstrap();
    await nodeSet.startNodes();
  });

  test.afterAll(async () => {
    if (nodeSet) await nodeSet.stopNodes();
  });

  test("both Rust nodes start successfully", async () => {
    test.skip(!rustAvailable, "Rust binary not built — skipping Rust tests");
    const node1 = nodeSet.getNode("rust1")!;
    const node2 = nodeSet.getNode("rust2")!;
    expect(await node1.isRunning()).toBe(true);
    expect(await node2.isRunning()).toBe(true);
  });

  test("Rust nodes connect as peers", async () => {
    test.skip(!rustAvailable, "Rust binary not built — skipping Rust tests");
    const node1 = nodeSet.getNode("rust1")!;
    const node2 = nodeSet.getNode("rust2")!;

    const deadline = Date.now() + 30_000;
    let connected = false;
    while (Date.now() < deadline) {
      const peers = await node1.getPeers();
      if (peers.length > 0) {
        connected = true;
        break;
      }
      await sleep(1000);
    }
    expect(connected, "rust2 should connect to rust1 within 30s").toBe(true);
  });
});
