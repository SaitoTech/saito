import { test } from "@playwright/test";
import { NodeSet, NodeSetConfig, TEST_KEY_PAIRS } from "../../src/node_set";
import { NodeConfig, NodeType } from "../../src/saito_node";

test.describe("nodes should sync correctly", () => {
  let nodeSetup: NodeSet;
  test.beforeAll(async () => {
    test.setTimeout(0); // Set timeout to 60 seconds

    const configSet = new NodeSetConfig();
    configSet.mainNodeIndex = 0;
    configSet.basePort = 42000;
    configSet.parentDir = "node-sync-test";
    configSet.genesisPeriod = BigInt(100);

    let config = new NodeConfig();
    config.name = "main";
    config.isGenesis = true;
    config.nodeType = NodeType.SLR;
    config.port = 1;
    config.privateKey = TEST_KEY_PAIRS[0]["private"];
    config.publicKey = TEST_KEY_PAIRS[0]["public"];
    configSet.nodeConfigs.push(config);

    configSet.issuance = [{ key: TEST_KEY_PAIRS[0]["public"], amount: BigInt(1000000000) }];

    config = new NodeConfig();
    config.name = "peer";
    config.isGenesis = true;
    config.nodeType = NodeType.SLR;
    config.port = 2;
    config.peerLabels = ["main"];
    config.privateKey = TEST_KEY_PAIRS[1]["private"];
    config.publicKey = TEST_KEY_PAIRS[1]["public"];
    configSet.nodeConfigs.push(config);

    nodeSetup = new NodeSet(configSet);
    console.log("bootstrapping the nodes");
    await nodeSetup.bootstrap();

    console.log("starting the nodes");
    await nodeSetup.startNodes();
    console.log("nodes started");
  });
  test.afterAll(async () => {
    console.log("stopping the nodes");
    await nodeSetup.stopNodes();
  });

  test("sync peer after loading", async ({ request }) => {
    console.log("running the test");

    const mainNode = nodeSetup.getNode("main");
    const peerNode = nodeSetup.getNode("peer");

    console.log("waiting for the nodes to sync");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log("done waiting");

    const balances = await mainNode?.getBalances();
    console.log("main balances : " + JSON.stringify(balances));

    const mainLatest = await mainNode?.getLatestBlock();
    const peerLatest = await peerNode?.getLatestBlock();

    if (mainLatest?.hash !== peerLatest?.hash) {
      console.log("mainLatest : " + mainLatest?.hash);
      console.log("peerLatest : " + peerLatest?.hash);
      console.log("latest blocks are not the same");
    }
  });
});
