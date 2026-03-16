import { spawn, ChildProcess, execSync } from "child_process";
import path from "path";
import SaitoNode, { NodeConfig } from "./node";

export const NODE_SRC_DIR = path.resolve(__dirname, "../../node");

export default class NodeJsNode extends SaitoNode {
  private _proc: ChildProcess | null = null;

  constructor(config: NodeConfig) {
    super(config);
  }

  protected async onStartNode(): Promise<void> {
    // Kill any stale process already bound to this port so our process can bind.
    try {
      execSync(`fuser -k ${this._config.port}/tcp 2>/dev/null`, { stdio: "ignore" });
      // Give the OS a moment to release the port
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    } catch {
      // fuser not available or port not in use — safe to continue
    }

    const startScript = path.join(NODE_SRC_DIR, "scripts/start.ts");
    const tsconfig = path.join(NODE_SRC_DIR, "config/build/tsconfig.json");
    const instanceConfigDir = path.join(this.nodeDir, "config");
    const instanceDataDir = path.join(this.nodeDir, "data");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SAITO_CONFIG_DIR: instanceConfigDir,
      SAITO_DATA_DIR: instanceDataDir,
      SAITO_TEST_MODE: "1",
      NODE_OPTIONS: "--max-old-space-size=2048",
    };

    this._proc = spawn(
      "npx",
      ["ts-node", "-T", "--files", "--project", tsconfig, startScript],
      {
        cwd: NODE_SRC_DIR,
        env,
        detached: false,
      }
    );

    this._proc.stdout?.on("data", (d: Buffer) => this.writeLog(`[stdout] ${d.toString().trim()}`));
    this._proc.stderr?.on("data", (d: Buffer) => this.writeLog(`[stderr] ${d.toString().trim()}`));
    this._proc.on("close", (code) => {
      this.writeLog(`process exited with code ${code}`);
    });
  }

  protected async onStopNode(): Promise<void> {
    if (this._proc && this._proc.exitCode === null) {
      // Set up a promise that resolves when the process actually exits
      const exitPromise = new Promise<void>((resolve) => {
        this._proc!.once("exit", () => resolve());
      });
      this._proc.kill("SIGTERM");
      // Wait up to 5 s for graceful shutdown, then force-kill
      await Promise.race([
        exitPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
      if (this._proc.exitCode === null) {
        this._proc.kill("SIGKILL");
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      }
    }
    this._proc = null;
  }
}
