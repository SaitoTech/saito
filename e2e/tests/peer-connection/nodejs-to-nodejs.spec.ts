import { test, expect } from "@playwright/test";
import { NodeSet, NodeSetConfig } from "../../src/node_set";
import { NodeConfig, NodeType, sleep } from "../../src/node";
import { TEST_KEY_PAIRS, BASE_PORT_NODEJS } from "../../src/fixtures";

/**
 * Two Node.js nodes where node2 is configured to peer with node1.
 * The test verifies that both nodes start up and that node2 appears
 * in node1's peer list within a reasonable timeout.
 */
test.describe("Node.js to Node.js — peer connection", () => {
  let nodeSet: NodeSet;

  test.beforeAll(async () => {
    test.setTimeout(180_000);

    const configSet = new NodeSetConfig();
    // Use a different base port range to avoid conflicting with the startup tests
    configSet.basePort = BASE_PORT_NODEJS + 100;
    configSet.parentDir = `nodejs-peer-${Date.now()}`;

    const node1 = new NodeConfig();
    node1.name = "node1";
    node1.nodeType = NodeType.NODEJS;
    node1.port = 1;
    node1.isGenesis = true;
    node1.privateKey = TEST_KEY_PAIRS[0].privateKey;
    node1.publicKey = TEST_KEY_PAIRS[0].publicKey;

    const node2 = new NodeConfig();
    node2.name = "node2";
    node2.nodeType = NodeType.NODEJS;
    node2.port = 2;
    node2.isGenesis = true;
    node2.privateKey = TEST_KEY_PAIRS[1].privateKey;
    node2.publicKey = TEST_KEY_PAIRS[1].publicKey;
    // node2 will connect to node1 on startup
    node2.peerLabels = ["node1"];

    configSet.nodeConfigs.push(node1, node2);
    configSet.issuance = [
      { key: TEST_KEY_PAIRS[0].publicKey, amount: BigInt(1_000_000_000) },
    ];

    nodeSet = new NodeSet(configSet);
    await nodeSet.bootstrap();
    // Start sequentially: node1 first so it is ready to accept node2's connection
    await nodeSet.startNodes();
  });

  test.afterAll(async () => {
    await nodeSet.stopNodes();
  });

  test("both nodes start successfully", async () => {
    const node1 = nodeSet.getNode("node1")!;
    const node2 = nodeSet.getNode("node2")!;
    expect(await node1.isRunning()).toBe(true);
    expect(await node2.isRunning()).toBe(true);
  });

  test("nodes connect as peers (node2 public key visible in node1 peers)", async () => {
    const node1 = nodeSet.getNode("node1")!;
    const node2 = nodeSet.getNode("node2")!;

    // Poll /stats/peers on node1 until node2's key appears (up to 60s).
    // With fresh (non-stale) processes the WebSocket handshake plus saito peer
    // registration can take 20-30 s on slower arm64 machines.
    const deadline = Date.now() + 60_000;
    let connected = false;
    while (Date.now() < deadline) {
      const peers = await node1.getPeers();
      if (peers.includes(node2.publicKey)) {
        connected = true;
        break;
      }
      await sleep(1000);
    }
    expect(connected, "node2 should appear in node1's peer list within 30s").toBe(true);
  });
});
