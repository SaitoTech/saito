import fs from "fs";
import path from "path";
import { ChildProcess } from "child_process";

export enum NodeType {
  NODEJS = "nodejs",
  RUST = "rust",
}

export class NodeConfig {
  name: string = "";
  host: string = "127.0.0.1";
  port: number = 0;
  dir: string = "";
  nodeType: NodeType = NodeType.NODEJS;
  peers: { host: string; port: number }[] = [];
  /** Peer names to be resolved into peer configs by NodeSetConfig */
  peerLabels: string[] = [];
  privateKey: string = "";
  publicKey: string = "";
  isGenesis: boolean = false;
}

export default abstract class SaitoNode {
  protected _config: NodeConfig;
  private _logStream: fs.WriteStream;
  private _logFile: string;

  constructor(config: NodeConfig) {
    this._config = config;

    const logDir = path.resolve("./logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this._logFile = path.join(logDir, `${config.name}_${Date.now()}.log`);
    this._logStream = fs.createWriteStream(this._logFile, { flags: "a" });
    this._logStream.write(
      `Log started for node: ${config.name} at ${new Date().toISOString()}\n`
    );
  }

  get name(): string {
    return this._config.name;
  }
  get host(): string {
    return this._config.host;
  }
  get port(): number {
    return this._config.port;
  }
  get nodeDir(): string {
    return this._config.dir;
  }
  get publicKey(): string {
    return this._config.publicKey;
  }

  writeLog(line: string) {
    this._logStream.write(`${new Date().toISOString()} ${line}\n`);
  }
  closeLog() {
    this._logStream.end();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async startNode(): Promise<void> {
    console.log(`[${this.name}] starting...`);
    await this.onStartNode();
    for (let i = 0; i < 60; i++) {
      if (await this.isRunning()) {
        console.log(`[${this.name}] started (attempt ${i + 1})`);
        return;
      }
      await sleep(1000);
    }
    throw new Error(`[${this.name}] failed to start within 60 seconds`);
  }

  async stopNode(): Promise<void> {
    console.log(`[${this.name}] stopping...`);
    await this.onStopNode();
    this.closeLog();
  }

  protected abstract onStartNode(): Promise<void>;
  protected abstract onStopNode(): Promise<void>;

  // ── Health / API ───────────────────────────────────────────────────────────

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(this.testApiUrl("status"), 2000);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<unknown> {
    return this.fetchTestApi("status");
  }

  async getLatestBlock(): Promise<{
    hash: string;
    id: number;
    previous_block_hash: string;
  } | null> {
    try {
      return (await this.fetchTestApi("block/latest")) as {
        hash: string;
        id: number;
        previous_block_hash: string;
      };
    } catch {
      return null;
    }
  }

  /**
   * Returns connected peer public keys.
   * Node.js nodes expose /stats/peers; Rust nodes expose /test-api/peers/all.
   * Both are normalised here to a string[].
   */
  async getPeers(): Promise<string[]> {
    try {
      const url = `http://${this.host}:${this.port}/stats/peers`;
      const res = await fetchWithTimeout(url, 3000);
      if (!res.ok) return [];
      const data = (await res.json()) as unknown;
      // The Node.js /stats/peers returns an object with peer entries
      if (data && typeof data === "object") {
        return Object.keys(data as Record<string, unknown>);
      }
      return [];
    } catch {
      return [];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  testApiUrl(endpoint: string): string {
    return `http://${this.host}:${this.port}/test-api/${endpoint}`;
  }

  async fetchTestApi(endpoint: string): Promise<unknown> {
    const res = await fetchWithTimeout(this.testApiUrl(endpoint), 3000);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${this.testApiUrl(endpoint)}`);
    }
    return res.json();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
