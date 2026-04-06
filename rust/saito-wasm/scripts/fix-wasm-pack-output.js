const fs = require("fs");
const path = require("path");

const target = process.argv[2];

if (!target || !["web", "node"].includes(target)) {
  console.error("usage: node scripts/fix-wasm-pack-output.js <web|node>");
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, "..");
const rootPackagePath = path.join(projectRoot, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const pkgDir = path.join(projectRoot, "pkg", target);
const pkgPackagePath = path.join(pkgDir, "package.json");

if (!fs.existsSync(pkgPackagePath)) {
  console.error(`missing wasm-pack output: ${pkgPackagePath}`);
  process.exit(1);
}

const pkgPackage = JSON.parse(fs.readFileSync(pkgPackagePath, "utf8"));
const normalizedPackage = {
  name: rootPackage.name,
  version: rootPackage.version,
  files: ["index_bg.wasm", "index.js", "index.d.ts", "snippets/**/*"],
  types: "index.d.ts",
  dependencies: pkgPackage.dependencies || {},
};

if (target === "web") {
  normalizedPackage.module = "index.js";
  normalizedPackage.sideEffects = ["./snippets/*"];
} else {
  normalizedPackage.main = "index.js";
}

fs.writeFileSync(pkgPackagePath, `${JSON.stringify(normalizedPackage, null, 2)}\n`);

const npmIgnorePath = path.join(pkgDir, ".npmignore");
fs.writeFileSync(
  npmIgnorePath,
  [
    "*",
    "!index.d.ts",
    "!index.js",
    "!index_bg.wasm",
    "!index_bg.wasm.d.ts",
    "!package.json",
    "!snippets/",
    "!snippets/**",
    "",
  ].join("\n")
);

if (target === "web") {
  const snippetsDir = path.join(pkgDir, "snippets");

  if (fs.existsSync(snippetsDir)) {
    const replacement = "\nexport { MsgHandler };\n";
    const commonJsFooter = [
      "\nexport { MsgHandler };\n",
      "\nif (typeof module !== \"undefined\") {\n",
      "  module.exports = { MsgHandler };\n",
      "}\n",
      "\n",
      "//\n",
      "// FEB 12, 2026 - above replaces this\n",
      "// module.exports = exports = {MsgHandler};\n",
      "//\n",
      "\n",
      "// if (typeof exports === \"undefined\") {\n",
      "//     module.exports = {MsgHandler};\n",
      "// } else {\n",
      "//     exports = {MsgHandler};\n",
      "// }\n",
      "// export {MsgHandler};\n",
    ].join("");

    for (const snippetFolder of fs.readdirSync(snippetsDir, { withFileTypes: true })) {
      if (!snippetFolder.isDirectory()) {
        continue;
      }

      const snippetPath = path.join(snippetsDir, snippetFolder.name, "js", "msg_handler.js");

      if (!fs.existsSync(snippetPath)) {
        continue;
      }

      const content = fs.readFileSync(snippetPath, "utf8");
      if (content.includes(commonJsFooter)) {
        fs.writeFileSync(snippetPath, content.replace(commonJsFooter, replacement));
      }
    }
  }
}