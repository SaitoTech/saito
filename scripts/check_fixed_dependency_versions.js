#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const IGNORED_DIRS = new Set([".git", "node_modules", "target"]);
const PACKAGE_DEPENDENCY_FIELDS = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);
const PACKAGE_OVERRIDE_FIELDS = new Set(["overrides", "resolutions"]);

const errors = [];

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), files);
      }
      continue;
    }

    if (entry.name === "Cargo.toml" || entry.name === "package.json") {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function isExactNpmVersion(spec) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    spec
  );
}

function isAllowedNonRegistryNpmSpec(spec) {
  return /^(?:file:|link:|workspace:|git\+|github:|https?:)/.test(spec);
}

function checkNpmSpec(filePath, dependencyPath, spec) {
  if (typeof spec !== "string") {
    return;
  }

  if (isExactNpmVersion(spec) || isAllowedNonRegistryNpmSpec(spec)) {
    return;
  }

  errors.push(
    `${relative(filePath)} ${dependencyPath} uses non-fixed npm version "${spec}"`
  );
}

function checkPackageDependencyMap(filePath, field, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [name, spec] of Object.entries(value)) {
    checkNpmSpec(filePath, `${field}.${name}`, spec);
  }
}

function checkPackageOverrideMap(filePath, field, value, prefix = field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [name, spec] of Object.entries(value)) {
    const nextPrefix = `${prefix}.${name}`;
    if (typeof spec === "string") {
      checkNpmSpec(filePath, nextPrefix, spec);
    } else if (spec && typeof spec === "object" && !Array.isArray(spec)) {
      checkPackageOverrideMap(filePath, field, spec, nextPrefix);
    }
  }
}

function checkPackageJson(filePath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${relative(filePath)} is not valid JSON: ${error.message}`);
    return;
  }

  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    checkPackageDependencyMap(filePath, field, manifest[field]);
  }

  for (const field of PACKAGE_OVERRIDE_FIELDS) {
    checkPackageOverrideMap(filePath, field, manifest[field]);
  }
}

function stripTomlComment(line) {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = inString;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (character === "#" && !inString) {
      return line.slice(0, index);
    }
  }

  return line;
}

function isDependencySection(sectionName) {
  return /(^|\.)((build-)?dependencies|dev-dependencies)$/.test(sectionName);
}

function checkCargoVersion(filePath, dependencyName, version, lineNumber) {
  if (version.startsWith("=")) {
    return;
  }

  errors.push(
    `${relative(filePath)}:${lineNumber} ${dependencyName} uses ` +
      `non-fixed Cargo version "${version}"; use "=${version}"`
  );
}

function checkCargoDependencyEntry(filePath, sectionName, entry, lineNumber) {
  if (!isDependencySection(sectionName)) {
    return;
  }

  const match = entry.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/s);
  if (!match) {
    return;
  }

  const dependencyName = match[1];
  const value = match[2].trim();
  const stringVersion = value.match(/^"([^"]+)"/);
  if (stringVersion) {
    checkCargoVersion(filePath, dependencyName, stringVersion[1], lineNumber);
    return;
  }

  const tableVersion = value.match(/\bversion\s*=\s*"([^"]+)"/s);
  if (tableVersion) {
    checkCargoVersion(filePath, dependencyName, tableVersion[1], lineNumber);
  }
}

function checkCargoToml(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  let sectionName = "";
  let pendingEntry = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = stripTomlComment(lines[index]).trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[+([^\]]+)\]+$/);
    if (sectionMatch && !pendingEntry) {
      sectionName = sectionMatch[1];
      continue;
    }

    if (!isDependencySection(sectionName)) {
      continue;
    }

    if (pendingEntry) {
      pendingEntry.text += `\n${line}`;
      pendingEntry.braceDepth +=
        (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

      if (pendingEntry.braceDepth <= 0) {
        checkCargoDependencyEntry(
          filePath,
          sectionName,
          pendingEntry.text,
          pendingEntry.lineNumber
        );
        pendingEntry = null;
      }
      continue;
    }

    if (!line.includes("=")) {
      continue;
    }

    const braceDepth =
      (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (braceDepth > 0) {
      pendingEntry = { text: line, braceDepth, lineNumber };
      continue;
    }

    checkCargoDependencyEntry(filePath, sectionName, line, lineNumber);
  }
}

for (const filePath of walk(ROOT).sort()) {
  if (filePath.endsWith("package.json")) {
    checkPackageJson(filePath);
  } else if (filePath.endsWith("Cargo.toml")) {
    checkCargoToml(filePath);
  }
}

if (errors.length > 0) {
  console.error("Dependency manifests must use fixed registry versions.");
  console.error("npm registry dependencies must use exact versions like 1.2.3.");
  console.error(
    'Cargo registry dependencies must use exact versions like "=1.2.3".'
  );
  console.error("");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("All Cargo.toml and package.json dependency versions are fixed.");
