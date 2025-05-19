import { type Page, type Locator } from "@playwright/test";
import SaitoNode, { NodeConfig } from "./saito_node";

export default class RustNode extends SaitoNode {
  protected onResetNode(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  onStartNode(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  onStopNode(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  onSetIssuance(issuance: string[]): Promise<void> {
    throw new Error("Method not implemented.");
  }

  constructor(config: NodeConfig) {
    super(config);
  }
}
