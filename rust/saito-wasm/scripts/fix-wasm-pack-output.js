const fs = require("fs");
const path = require("path");

function patchMsgHandlerForWeb(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let updated = original;

  // Current guarded CommonJS block.
  updated = updated.replace(
    /\nif\s*\(\s*typeof module !== \"undefined\"\s*&&\s*typeof exports !== \"undefined\"\s*&&\s*typeof module\.exports !== \"undefined\"\s*\)\s*\{\s*module\.exports\s*=\s*\{\s*MsgHandler\s*\};\s*\}\n/m,
    "\n",
  );

  // Previous guarded CommonJS block variant.
  updated = updated.replace(
    /\nconst canAssignCommonJsExports = \(\(\) => \{[\s\S]*?\}\)\(\);\s*\n\s*if \(canAssignCommonJsExports\) \{\s*module\.exports = \{ MsgHandler \};\s*\}\n/m,
    "\n",
  );

  // Legacy simple CommonJS block variant.
  updated = updated.replace(
    /\nif \(typeof module !== \"undefined\"\) \{\s*module\.exports = \{ MsgHandler \};\s*\}\n/m,
    "\n",
  );

  if (updated !== original) {
    fs.writeFileSync(filePath, updated, "utf8");
    return true;
  }

  return false;
}

function run() {
  const snippetsDir = path.join(__dirname, "..", "pkg", "web", "snippets");

  if (!fs.existsSync(snippetsDir)) {
    console.log(
      "No web snippets directory found; skipping wasm web snippet patch.",
    );
    return;
  }

  let scanned = 0;
  let patched = 0;

  for (const entry of fs.readdirSync(snippetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const msgHandlerPath = path.join(
      snippetsDir,
      entry.name,
      "js",
      "msg_handler.js",
    );
    if (!fs.existsSync(msgHandlerPath)) {
      continue;
    }

    scanned += 1;
    if (patchMsgHandlerForWeb(msgHandlerPath)) {
      patched += 1;
      console.log(`Patched browser snippet: ${msgHandlerPath}`);
    }
  }

  console.log(
    `Scanned ${scanned} web msg_handler snippet(s), patched ${patched}.`,
  );
}

run();
