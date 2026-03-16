import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import SaitoNode, { NodeConfig, NodeType } from "./node";
import NodeJsNode, { NODE_SRC_DIR } from "./nodejs_node";
import RustNode, { RUST_BINARY_PATH } from "./rust_node";

export const TEST_DIR = path.resolve(__dirname, "../temp_test_directory");
export const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

// ── NodeSetConfig ───────────────────────────────────────────────────────────

export class NodeSetConfig {
  nodeConfigs: NodeConfig[] = [];
  /** Index of the genesis node in nodeConfigs */
  mainNodeIndex: number = 0;
  issuance: { key: string; amount: bigint }[] = [];
  genesisPeriod: bigint = BigInt(100);
  /** Subdirectory under TEST_DIR for this test run */
  parentDir: string = "";
  /**
   * `port` values in nodeConfigs are offsets; the actual port is basePort + offset.
   * Keep offsets < 100; keep basePort > 10000 to avoid privilege issues.
   */
  basePort: number = 43000;
  /**
   * Path to a custom modules.config.js fixture. Applied to all Node.js nodes in the set
   * unless overridden per-node via NodeConfig.modulesConfigFile.
   */
  modulesConfigFile: string = "";

  /** Resolve peerLabels into concrete peer addresses. Call before bootstrapping. */
  generateNodeConfigs(): void {
    for (const config of this.nodeConfigs) {
      config.peers = config.peerLabels
        .map((label) => this.nodeConfigs.find((n) => n.name === label))
        .filter((n): n is NodeConfig => n !== undefined)
        .map((n) => ({ host: n.host, port: this.basePort + n.port }));
    }
  }
}

// ── NodeSet ─────────────────────────────────────────────────────────────────

export class NodeSet {
  nodes: SaitoNode[] = [];
  config: NodeSetConfig;

  constructor(config: NodeSetConfig) {
    this.config = config;
  }

  async bootstrap(): Promise<void> {
    if (!this.config.parentDir) {
      throw new Error("NodeSetConfig.parentDir must be set");
    }
    this.config.generateNodeConfigs();

    for (const cfg of this.config.nodeConfigs) {
      const instanceDir = path.join(TEST_DIR, this.config.parentDir, cfg.name);
      const actualPort = this.config.basePort + cfg.port;
      const resolvedCfg: NodeConfig = {
        ...cfg,
        dir: instanceDir,
        port: actualPort,
        // Inherit set-level modules config if the individual node doesn't specify one
        modulesConfigFile: cfg.modulesConfigFile || this.config.modulesConfigFile || "",
      };

      const node = await Bootstrapper.bootstrap(resolvedCfg);

      if (cfg.isGenesis && this.config.issuance.length > 0) {
        writeIssuance(instanceDir, this.config.issuance);
      }

      this.nodes.push(node);
    }
  }

  async startNodes(): Promise<void> {
    // Start sequentially so that genesis/seed nodes are ready before peers connect
    for (const node of this.nodes) {
      await node.startNode();
    }
  }

  async stopNodes(): Promise<void> {
    await Promise.all(this.nodes.map((n) => n.stopNode()));
  }

  getNode(name: string): SaitoNode | undefined {
    return this.nodes.find((n) => n.name === name);
  }
}

// ── Bootstrapper factory ────────────────────────────────────────────────────

export class Bootstrapper {
  static async bootstrap(config: NodeConfig): Promise<SaitoNode> {
    fs.mkdirSync(config.dir, { recursive: true });

    if (config.nodeType === NodeType.NODEJS) {
      return new NodeJsBootstrapper().bootstrap(config);
    } else if (config.nodeType === NodeType.RUST) {
      return new RustBootstrapper().bootstrap(config);
    }
    throw new Error(`Unknown NodeType: ${config.nodeType}`);
  }
}

// ── NodeJs Bootstrapper ─────────────────────────────────────────────────────

class NodeJsBootstrapper {
  async bootstrap(config: NodeConfig): Promise<SaitoNode> {
    const { dir, host, port, privateKey, publicKey, peers } = config;

    // Directory structure
    const configDir = path.join(dir, "config");
    const dataDir = path.join(dir, "data");
    const blocksDir = path.join(dataDir, "blocks");
    const issuanceDir = path.join(dataDir, "issuance");
    for (const d of [configDir, blocksDir, issuanceDir]) {
      fs.mkdirSync(d, { recursive: true });
    }

    // Write options file from template
    const templatePath = path.join(FIXTURES_DIR, "options.template.json");
    const template = fs.readFileSync(templatePath, "utf-8");
    const peersJson = peers.map((p) =>
      JSON.stringify({ host: p.host, port: p.port, protocol: "http", synctype: "full" })
    ).join(",\n    ");
    const options = template
      .replace(/\{\{PORT\}\}/g, String(port))
      .replace(/\{\{HOST\}\}/g, host)
      .replace(/\{\{PRIVATE_KEY\}\}/g, privateKey)
      .replace(/\{\{PUBLIC_KEY\}\}/g, publicKey)
      .replace(/\{\{PEERS\}\}/g, `[${peersJson ? "\n    " + peersJson + "\n  " : ""}]`);
    fs.writeFileSync(path.join(configDir, "options"), options, "utf-8");

    // Copy modules config fixture (custom if specified, otherwise minimal default)
    const modsSource = config.modulesConfigFile
      ? config.modulesConfigFile
      : path.join(FIXTURES_DIR, "modules.config.min.js");
    fs.copyFileSync(modsSource, path.join(configDir, "modules.config.js"));

    // Symlink node_modules from the source tree to avoid reinstalling
    const nmLink = path.join(dir, "node_modules");
    if (!fs.existsSync(nmLink)) {
      fs.symlinkSync(path.join(NODE_SRC_DIR, "node_modules"), nmLink, "dir");
    }

    return new NodeJsNode(config);
  }
}

// ── Rust Bootstrapper ────────────────────────────────────────────────────────

class RustBootstrapper {
  async bootstrap(config: NodeConfig): Promise<SaitoNode> {
    const { dir, host, port, privateKey, peers } = config;

    const configDir = path.join(dir, "config");
    const dataDir = path.join(dir, "data");
    const logsDir = path.join(dir, "logs");
    for (const d of [configDir, path.join(dataDir, "blocks"), logsDir]) {
      fs.mkdirSync(d, { recursive: true });
    }

    // Write config.json from template
    const templatePath = path.join(FIXTURES_DIR, "rust-config.template.json");
    const template = fs.readFileSync(templatePath, "utf-8");
    const peersJson = peers.map((p) =>
      JSON.stringify({ host: p.host, port: p.port, protocol: "http", synctype: "full" })
    ).join(",\n    ");
    const cfg = template
      .replace(/\{\{PORT\}\}/g, String(port))
      .replace(/\{\{HOST\}\}/g, host)
      .replace(/\{\{PRIVATE_KEY\}\}/g, privateKey)
      .replace(/\{\{PEERS\}\}/g, `[${peersJson ? "\n    " + peersJson + "\n  " : ""}]`);
    fs.writeFileSync(path.join(configDir, "config.json"), cfg, "utf-8");

    return new RustNode(config);
  }
}

// ── Issuance helper ──────────────────────────────────────────────────────────

function writeIssuance(
  nodeDir: string,
  issuance: { key: string; amount: bigint }[]
): void {
  const issuanceDir = path.join(nodeDir, "data", "issuance");
  fs.mkdirSync(issuanceDir, { recursive: true });
  const content = issuance.map((e) => `${e.key}\t${e.amount}\tNormal`).join("\n") + "\n";
  fs.writeFileSync(path.join(issuanceDir, "issuance"), content, "utf-8");
}
