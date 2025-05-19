const { exec, spawn } = require("child_process");
import fs from "fs";
import path from "path";

export enum NodeType {
  RUST = "rust",
  SLR = "slr",
}

export class NodeConfig {
  peers: { host: string; port: number }[] = [];
  peerLabels: string[] = [];
  port: number = 0;
  dir: string = "";
  name: string = "";
  nodeType: NodeType = NodeType.SLR;
  isGenesis: boolean = false;
  originalCodeLocation: string = "";
  host: string = "localhost";
  privateKey: string = "";
  publicKey: string = "";
}
export default abstract class SaitoNode {
  private _dataDir: string = "./data";
  private _nodeDir: string = ".";
  private _config: NodeConfig;
  private _timestamp: number = 0;
  private _log_file:string = "";
  private _logStream: fs.WriteStream;

  constructor(config: NodeConfig) {
    this._config = config;
    this._nodeDir = config.dir;
    this._timestamp = Date.now();
    this._log_file = this._dataDir + "/" + this._config.name + "_" + this._timestamp + ".log";

    console.log("using log file : " + this._log_file);
    // Ensure the data directory exists
    if (!fs.existsSync(this._dataDir)) {
      fs.mkdirSync(this._dataDir, { recursive: true });
    }

    // Open the log file for writing
    const logFilePath = path.resolve(this._log_file);
    this._logStream = fs.createWriteStream(logFilePath, { flags: "a" });

    // Write a log entry indicating the start of logging
    this._logStream.write(`Log started for node: ${this._config.name} at ${new Date().toISOString()}\n`);
  }

  public writeLog(message: string) {
    // Write the message to the log file
    this._logStream.write(`${new Date().toISOString()} - ${message}\n`);
  }
  public closeLog() {
    // Close the log stream when done
    this._logStream.end();
  }
  public writeError(message: string) {
    // Write the error message to the log file
    this._logStream.write(`${new Date().toISOString()} - ERROR: ${message}\n`);
  }
  public writeInfo(message: string) {
    // Write the info message to the log file
    this._logStream.write(`${new Date().toISOString()} - INFO: ${message}\n`);
  }
  public writeWarning(message: string) {
    // Write the warning message to the log file
    this._logStream.write(`${new Date().toISOString()} - WARNING: ${message}\n`);
  }
  public writeDebug(message: string) {
    // Write the debug message to the log file
    this._logStream.write(`${new Date().toISOString()} - DEBUG: ${message}\n`);
  }

  public set dataDir(dir: string) {
    this._dataDir = dir;
  }

  public get dataDir(): string {
    return this._dataDir;
  }

  public set nodeDir(dir: string) {
    this._nodeDir = dir;
  }

  public get nodeDir(): string {
    return this._nodeDir;
  }
  public get name(): string {
    return this._config.name;
  }

  async startNode() {
    console.log(`starting the node : ${this.name}...`);

    await this.onStartNode();

    for (let i = 0; i < 30; i++) {
      const running = await this.isRunning();
      if (running) {
        console.log(`node started : ${this.name}`);
        break;
      } else {
        console.log("waiting for node : " + this.name + " to start");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  protected abstract onStartNode(): Promise<void>;

  async stopNode() {
    console.log(`stopping the node : ${this.name}...`);
    return this.onStopNode();
  }

  protected abstract onStopNode(): Promise<void>;

  async cleanDataFolder() {
    throw new Error("NotImplemented");
  }

  async setIssuance(issuance: string[]) {
    return this.onSetIssuance(issuance);
  }

  protected abstract onSetIssuance(issuance: string[]): Promise<void>;

  async resetNode() {
    console.log(`resetting the node : ${this.name}`);
    return this.onResetNode();
  }

  protected abstract onResetNode(): Promise<void>;

  async isRunning(): Promise<boolean> {
    try {
      await this.fetchValueFromNode("status");
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  }

  public async getLatestBlock(): Promise<{
    hash: string;
    id: number;
    previous_block_hash: string;
  }> {
    const result = await this.fetchValueFromNode("block/latest");
    return result as { hash: string; id: number; previous_block_hash: string };
  }
  public async getPeers(): Promise<{ peers: string[] }> {
    return (await this.fetchValueFromNode("peers/all")) as { peers: string[] };
  }
  public async transferFunds(amount: bigint, to: string) {
    return await this.fetchValueFromNode(`transfer/${to}/${amount}`);
  }
  public async getBalances():Promise<unknown> {
    return await this.fetchValueFromNode("balances");
  }
  public async sendMessage() {}

  public async fetchValueFromNode(path: string): Promise<unknown> {
    const url = this.getUrl(path);
    // console.log("url : " + url);
    return fetch(url).then((res) => res.json());
  }
  public getUrl(path: string): string {
    return `http://${this._config.host}:${this._config.port}/test-api/${path}`;
  }
  public static async runCommand(command: string, cwd: string) {
      return new Promise<void>((resolve, reject) => {
          console.log("running command: " + command + " inside: " + cwd);
          
          // Split the command into the main command and its arguments
          const parts = command.split(' ');
          const cmd = parts[0];
          const args = parts.slice(1);
          
          const childProcess = spawn(cmd, args, {
              cwd: cwd,
              shell: true, // Use shell to support piping, redirection, etc.
          });
  
          childProcess.stdout.on('data', (data) => {
              process.stdout.write(`${data}`);
          });
  
          childProcess.stderr.on('data', (data) => {
              process.stderr.write(`${data}`);
          });
  
          childProcess.on('close', (code) => {
              if (code === 0) {
                  console.log("finished running command: " + command);
                  resolve();
              } else {
                  console.error(`Command failed with exit code ${code}`);
                  reject(new Error(`Command failed with exit code ${code}`));
              }
          });
  
          childProcess.on('error', (error) => {
              console.error(`Failed to start command: ${error.message}`);
              reject(error);
          });
      });
  }

}

// API requirements.
// to support E2E testing, a running node need to be able to (only enabled from an environment variable):
// - provide the status of the node
// - provide the latest block hash
// - provide the list of peers
// - provide the latest block picture
// - TODO realize this list
// if any of these endpoints are open we should be able to say the node has started
