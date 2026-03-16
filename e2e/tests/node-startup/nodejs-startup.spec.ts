import { test, expect } from "@playwright/test";
import { NodeSet, NodeSetConfig } from "../../src/node_set";
import { NodeConfig, NodeType } from "../../src/node";
import { TEST_KEY_PAIRS, BASE_PORT_NODEJS } from "../../src/fixtures";

test.describe("Node.js node — single node startup", () => {
  let nodeSet: NodeSet;

  test.beforeAll(async () => {
    test.setTimeout(120_000);

    const configSet = new NodeSetConfig();
    configSet.basePort = BASE_PORT_NODEJS;
    configSet.parentDir = `nodejs-startup-${Date.now()}`;

    const cfg = new NodeConfig();
    cfg.name = "node1";
    cfg.nodeType = NodeType.NODEJS;
    cfg.port = 1; // actual port = BASE_PORT_NODEJS + 1
    cfg.isGenesis = true;
    cfg.privateKey = TEST_KEY_PAIRS[0].privateKey;
    cfg.publicKey = TEST_KEY_PAIRS[0].publicKey;
    configSet.nodeConfigs.push(cfg);

    nodeSet = new NodeSet(configSet);
    await nodeSet.bootstrap();
    await nodeSet.startNodes();
  });

  test.afterAll(async () => {
    await nodeSet.stopNodes();
  });

  test("node starts and reports healthy status", async () => {
    const node = nodeSet.getNode("node1")!;
    expect(await node.isRunning()).toBe(true);
    const status = await node.getStatus();
    expect(status).toBeTruthy();
  });

  test("test-api/status returns HTTP 200", async ({ request }) => {
    const node = nodeSet.getNode("node1")!;
    const response = await request.get(node.testApiUrl("status"));
    expect(response.status()).toBe(200);
  });
});
