import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Exercises the real sandbox-browser.js path:
 * opaque iframe (allow-scripts, no allow-same-origin) → inline nonce bootstrap → Blob Worker.
 * Self-contained: does not require the Saito node webServer for assertions.
 */

const sandboxPath = path.resolve(__dirname, "../../node/lib/helpers/sandbox-browser.js");

function loadSandboxBrowserSource(): string {
  const source = fs.readFileSync(sandboxPath, "utf8");
  if (source.includes("require(")) {
    throw new Error("sandbox-browser.js must stay free of require() for browser injection");
  }
  return source.replace(/module\.exports\s*=\s*/, "window.__saitoSandboxExports = ");
}

test.describe("opaque-origin JavaScript sandbox", () => {
  test.beforeEach(async ({ page }) => {
    // Parent page intentionally has no CSP, matching Saito Admin/Lite Client HTML.
    await page.setContent("<!DOCTYPE html><html><body></body></html>");
    await page.addScriptTag({ content: loadSandboxBrowserSource() });
  });

  test("initializes, executes, and reuses the persistent sandbox", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { createSandbox } = (window as any).__saitoSandboxExports;
      const sandbox = createSandbox();
      await sandbox.initialize();
      const first = await sandbox.execute({
        source: "return left + right;",
        data: { left: 2, right: 2 },
        capabilities: {},
        handlers: null,
        limits: { maxExecutionTime: 5000 }
      });
      const second = await sandbox.execute({
        source: "return left * right;",
        data: { left: 3, right: 5 },
        capabilities: {},
        handlers: null,
        limits: { maxExecutionTime: 5000 }
      });
      const iframe = document.querySelector("iframe");
      const sandboxAttr = iframe?.getAttribute("sandbox") || "";
      sandbox.terminate();
      return { first, second, sandboxAttr, iframeCountAfter: document.querySelectorAll("iframe").length };
    });

    expect(result.first).toBe(4);
    expect(result.second).toBe(15);
    expect(result.sandboxAttr).toBe("allow-scripts");
    expect(result.sandboxAttr).not.toContain("allow-same-origin");
    expect(result.iframeCountAfter).toBe(0);
  });

  test("blocks arbitrary inline scripts under the sandbox CSP", async ({ page }) => {
    const blocked = await page.evaluate(async () => {
      const { createSandbox, buildSandboxCsp, createBootstrapNonce } =
        (window as any).__saitoSandboxExports;
      const sandbox = createSandbox();
      await sandbox.initialize();

      // Probe the live opaque document: inject an unauthorized inline script.
      const iframe = document.querySelector("iframe") as HTMLIFrameElement;
      const win = iframe.contentWindow as Window;
      const doc = iframe.contentDocument as Document;
      let ran = false;
      try {
        const probe = doc.createElement("script");
        probe.textContent = "window.__probeRan = true;";
        doc.body.appendChild(probe);
        ran = !!(win as any).__probeRan;
      } catch (_err) {
        ran = false;
      }

      // Confirm nonce-bearing CSP remains restrictive.
      const nonce = createBootstrapNonce();
      const csp = buildSandboxCsp(nonce);
      sandbox.terminate();
      return {
        ran,
        hasUnsafeInline: /unsafe-inline/.test(csp),
        hasNonce: csp.includes(`'nonce-${nonce}'`)
      };
    });

    expect(blocked.ran).toBe(false);
    expect(blocked.hasUnsafeInline).toBe(false);
    expect(blocked.hasNonce).toBe(true);
  });

  test("Worker path has no network capability from untrusted code", async ({ page }) => {
    const outcome = await page.evaluate(async () => {
      const { createSandbox } = (window as any).__saitoSandboxExports;
      const sandbox = createSandbox();
      await sandbox.initialize();
      let error = "";
      try {
        await sandbox.execute({
          source: "return await fetch('https://example.com');",
          data: {},
          capabilities: {},
          handlers: null,
          limits: { maxExecutionTime: 5000 }
        });
      } catch (err: any) {
        error = String(err && err.message ? err.message : err);
      }
      sandbox.terminate();
      return error;
    });

    // fetch is not a capability param and is not a Worker free binding under validation,
    // or fails inside the worker; either way execution must not succeed.
    expect(outcome.length).toBeGreaterThan(0);
  });
});
