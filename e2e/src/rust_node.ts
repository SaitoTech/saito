import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import SaitoNode, { NodeConfig } from "./node";

export const RUST_BINARY_PATH = path.resolve(
  __dirname,
  "../../rust/target/release/saito-rust"
);

export default class RustNode extends SaitoNode {
  private _proc: ChildProcess | null = null;

  constructor(config: NodeConfig) {
    super(config);
  }

  protected async onStartNode(): Promise<void> {
    if (!fs.existsSync(RUST_BINARY_PATH)) {
      throw new Error(
        `Rust binary not found at ${RUST_BINARY_PATH}. Run: cargo build --release -p saito-rust`
      );
    }

    this._proc = spawn(RUST_BINARY_PATH, ["--config", "config/config.json"], {
      cwd: this.nodeDir,
      detached: false,
      env: {
        ...process.env,
        SAITO_TEST_MODE: "1",
      },
    });

    this._proc.stdout?.on("data", (d: Buffer) => this.writeLog(`[stdout] ${d.toString().trim()}`));
    this._proc.stderr?.on("data", (d: Buffer) => this.writeLog(`[stderr] ${d.toString().trim()}`));
    this._proc.on("close", (code) => {
      this.writeLog(`process exited with code ${code}`);
    });
  }

  protected async onStopNode(): Promise<void> {
    if (this._proc && !this._proc.killed) {
      this._proc.kill("SIGTERM");
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      if (!this._proc.killed) {
        this._proc.kill("SIGKILL");
      }
    }
    this._proc = null;
  }

  /**
   * Rust nodes expose a test-only peers endpoint when SAITO_TEST_MODE is set.
   */
  async getPeers(): Promise<string[]> {
    try {
      const data = (await this.fetchTestApi("peers")) as { peers?: string[] };
      return data?.peers ?? [];
    } catch {
      return [];
    }
  }
}
