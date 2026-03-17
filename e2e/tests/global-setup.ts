import fs from "fs";
import path from "path";
import { RUST_BINARY_PATH } from "../src/rust_node";

/**
 * Playwright global setup — runs once before all tests.
 * Checks for the Rust binary and warns (but does NOT throw) if it is absent,
 * since Rust-specific tests self-skip when the binary is missing.
 */
export default async function globalSetup(): Promise<void> {
  if (!fs.existsSync(RUST_BINARY_PATH)) {
    console.warn(
      `\n[e2e] WARNING: Rust binary not found at:\n  ${RUST_BINARY_PATH}\n` +
        `  Rust node tests will be skipped.\n` +
        `  To enable them, run:\n` +
        `    cd ${path.resolve(__dirname, "../../rust")} && cargo build --release -p saito-rust\n`
    );
  } else {
    console.log(`[e2e] Rust binary found at: ${RUST_BINARY_PATH}`);
  }
}
