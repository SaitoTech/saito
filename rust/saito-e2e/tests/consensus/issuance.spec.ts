import { test } from "@playwright/test";
import SlrNode from "../../src/slr.node";
import { execSync } from "child_process";
import SaitoNode, { NodeConfig, NodeType } from "../../src/saito_node";
import { NodeSet, NodeSetConfig, TEST_KEY_PAIRS } from "../../src/node_set";

let fs = require("fs");
let process = require("process");
let { exec } = require("child_process");

test("issuance file generation @consensus", async ({ page, browserName }, testInfo) => {
  // if (browserName !== "chromium") {
  //   testInfo.skip();
  //   return;
  // }
  testInfo.setTimeout(0);
  // let dir = "./temp";
  // if (fs.existsSync(dir)) {
  //   fs.rmSync(dir, { recursive: true, force: true });
  // }
  // if (!fs.existsSync(dir)) {
  //   fs.mkdirSync(dir);
  // }

  const configSet = new NodeSetConfig();
  configSet.mainNodeIndex = 0;
  configSet.basePort = 42000;
  configSet.parentDir = "issuance_test";
  configSet.genesisPeriod = BigInt(100);
  configSet.nodeConfigs = [];

  const config = new NodeConfig();
  config.name = "main";
  config.nodeType = NodeType.SLR;
  config.isGenesis = true;  
  config.port = 1;
  config.privateKey = TEST_KEY_PAIRS[0]["private"];
  config.publicKey = TEST_KEY_PAIRS[0]["public"];
  configSet.nodeConfigs.push(config);

  configSet.issuance = [
    { key: TEST_KEY_PAIRS[0]["public"], amount: BigInt(1000000000) },
    { key: TEST_KEY_PAIRS[1]["public"], amount: BigInt(2000000000) },
    { key: TEST_KEY_PAIRS[2]["public"], amount: BigInt(3000000000) },
  ];

  const nodeSetup = new NodeSet(configSet);

  await nodeSetup.bootstrap();
  await nodeSetup.startNodes();

  
  // generate some blocks

  const mainNode = nodeSetup.getNode("main");

  await SaitoNode.runCommand("npm run generate-issuance", mainNode!.nodeDir);


  // check the entries in the generated issuance file
  const issuanceFile = mainNode!.nodeDir + "/data/issuance.file";
  const issuanceData = JSON.parse(fs.readFileSync(issuanceFile, "utf8"));

  console.log("issuanceData : " + JSON.stringify(issuanceData));

  await nodeSetup.stopNodes();

});
