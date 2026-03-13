#!/usr/bin/env node
'use strict';


const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {

  if (request.startsWith('saito-js/lib/')) {

    // try normal npm layout first
    try {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    } catch (err) {

      // fallback to legacy dist layout
      const alt = request.replace('saito-js/lib/', 'saito-js/dist/lib/');
      return originalResolveFilename.call(this, alt, parent, isMain, options);
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};



/**
 * CLI Dynamic Module Compiler
 * Compiles zipped modules from dist/mods/zip/ into .saito files in dist/mods/saito/.
 * Replicates DevTools createAppBinary + browser download step; no browser, no network.
 *
 * Safe to run from any directory: project root is resolved from this script's location
 * (node/scripts/dynmods -> node/), not from process.cwd().
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const unzipper = require('unzipper');
const { getMetadataFromZip } = require('./helpers/metadata');
const { getAppPath } = require('./helpers/getAppPath');
const { buildSaitoPayload } = require('./helpers/saitoPayload');

// Project root (node/) from script location so it works whether you run from node/ or scripts/dynmods/
const PROJECT_ROOT = path.resolve(path.join(__dirname, '..', '..'));

let saitoJsInitialized = false;

/**
 * Minimal saito-js init so Transaction/Slip.Type are set (WASM). Run once before any buildSaitoPayload().
 * Uses the same saito-js classes that dist/ts/lib/saito/transaction extends.
 * Resolves saito-wasm from saito-js's node_modules (same as index.node).
 */
async function initSaitoJsForCompile() {
  if (saitoJsInitialized) return;
  const createRequire = require('module').createRequire;
  const requireFromSaitoJs = createRequire(
    path.join(PROJECT_ROOT, 'node_modules', 'saito-js', 'package.json')
  );
  const wasm = requireFromSaitoJs('saito-wasm/pkg/node');
  const SaitoJsTransaction = require('saito-js/lib/transaction').default;
  const SaitoJsSlip = require('saito-js/lib/slip').default;
  SaitoJsTransaction.Type = wasm.WasmTransaction;
  SaitoJsSlip.Type = wasm.WasmSlip;
  saitoJsInitialized = true;
}
const ZIP_DIR = path.join(PROJECT_ROOT, 'dist', 'mods', 'zip');
const SAITO_DIR = path.join(PROJECT_ROOT, 'dist', 'mods', 'saito');
const TMP_MOD = path.join(PROJECT_ROOT, 'dist');
const DYN_WEB = path.join(PROJECT_ROOT, 'dist', 'dyn', 'web');
const DYN_MODULE_JS = path.join(DYN_WEB, 'dyn.module.js');

function ensureDirs() {
  [ZIP_DIR, SAITO_DIR, TMP_MOD].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function cleanTmpMod(slug) {
  if (slug) {
    rimraf(path.join(TMP_MOD, slug));
  } else if (TMP_MOD !== path.join(PROJECT_ROOT, 'dist')) {
    rimraf(TMP_MOD);
  }
}

function cleanDynWeb() {
  try {
    if (fs.existsSync(DYN_MODULE_JS)) fs.writeFileSync(DYN_MODULE_JS, '');
    const baseTxt = path.join(DYN_WEB, 'base.txt');
    if (fs.existsSync(baseTxt)) fs.writeFileSync(baseTxt, '');
  } catch (e) {
    // ignore
  }
}

function getZipFiles() {
  if (!fs.existsSync(ZIP_DIR)) return [];
  return fs.readdirSync(ZIP_DIR).filter((f) => f.toLowerCase().endsWith('.zip'));
}

function runZipmods() {
  const zipmodsPath = path.join(__dirname, 'zipmods.sh');
  execSync(`bash "${zipmodsPath}"`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const zipIdx = args.indexOf('--zip');
  const slugIdx = args.indexOf('--slug');
  if (zipIdx === -1 || slugIdx === -1) return null;
  const zipPath = args[zipIdx + 1];
  const slug = args[slugIdx + 1];
  if (!zipPath || !slug) return null;
  return { zipPath: path.resolve(zipPath), slug };
}

async function compileOne(zipFileName) {
  const zipPath = path.join(ZIP_DIR, zipFileName);
  const directory = await unzipper.Open.file(zipPath);

  let metadata;
  try {
    metadata = await getMetadataFromZip(zipPath);
  } catch (err) {
    throw new Error(`Metadata extraction failed: ${err.message}`);
  }

  let slug = (metadata.slug || '').trim();
  if (!slug) {
    throw new Error('Module has no slug (missing or invalid this.slug in main .js)');
  }

  const appPath = await getAppPath(directory, slug);

  if (!fs.existsSync(TMP_MOD)) {
    fs.mkdirSync(TMP_MOD, { recursive: true });
  }
  await directory.extract({ path: TMP_MOD });

  const entryPath = path.join(TMP_MOD, appPath);

  if (!fs.existsSync(entryPath)) {
    throw new Error(`Entry point not found: ${entryPath}`);
  }

  try {
    //fix for path on linux
    //const entry = appPath.replace(`${slug}/`, '');
    //execSync(`node config/build/webpack.config.dynmod.cjs --entrypoint=${entry}`, {
    execSync(`node config/build/webpack.config.dynmod.cjs --entrypoint=${appPath}`, {

      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`Webpack failed: ${err.stderr ? err.stderr.toString() : err.message}`);
  }

  if (!fs.existsSync(DYN_MODULE_JS)) {
    throw new Error('Webpack did not produce dyn.module.js');
  }

  const dynModuleBinary = fs.readFileSync(DYN_MODULE_JS, { encoding: 'binary' });
  const DYN_MOD_WEB = Buffer.from(dynModuleBinary, 'binary').toString('base64');

  //console.log('metadata:', metadata);

  const msg = {
    module: 'Appstore',
    request: 'submit application',
    bin: DYN_MOD_WEB,
    name: metadata.name || '',
    description: metadata.description || '',
    slug: metadata.slug || '',
    image: metadata.image || '',
    version: metadata.version || '1.0.0',
    publisher: '',
    categories: metadata.categories || '',
  };

  const saitoJson = buildSaitoPayload(msg);
  const outPath = path.join(SAITO_DIR, `${slug}.saito`);
  fs.writeFileSync(outPath, saitoJson, 'utf8');

  return { slug, outPath };
}

async function runSingle(zipPath, slugArg) {
  ensureDirs();
  const baseName = path.basename(zipPath);
  process.stdout.write(`Compiling ${baseName} (slug: ${slugArg}) ... `);
  let slug;
  try {
    const directory = await unzipper.Open.file(zipPath);
    let metadata;
    try {
      metadata = await getMetadataFromZip(zipPath);
    } catch (err) {
      throw new Error(`Metadata extraction failed: ${err.message}`);
    }
    slug = (metadata.slug || slugArg || '').trim();
    if (!slug) throw new Error('No slug in module and none provided via --slug');
    const appPath = await getAppPath(directory, slug);
    if (!fs.existsSync(TMP_MOD)) fs.mkdirSync(TMP_MOD, { recursive: true });
    cleanTmpMod(slug);
    await directory.extract({ path: TMP_MOD });
    const entryPath = path.join(TMP_MOD, appPath);
    if (!fs.existsSync(entryPath)) throw new Error(`Entry point not found: ${entryPath}`);
    //fix for path on linux
    //const entry = appPath.replace(`${slug}/`, '');
    //execSync(`node config/build/webpack.config.dynmod.cjs --entrypoint=${entry}`, {
    execSync(`node config/build/webpack.config.dynmod.cjs --entrypoint=${entry}`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (!fs.existsSync(DYN_MODULE_JS)) throw new Error('Webpack did not produce dyn.module.js');
    const dynModuleBinary = fs.readFileSync(DYN_MODULE_JS, { encoding: 'binary' });
    const DYN_MOD_WEB = Buffer.from(dynModuleBinary, 'binary').toString('base64');
    const msg = {
      module: 'Appstore',
      request: 'submit application',
      bin: DYN_MOD_WEB,
      name: metadata.name || '',
      description: metadata.description || '',
      slug: metadata.slug || '',
      image: metadata.image || '',
      version: metadata.version || '1.0.0',
      publisher: '',
      categories: metadata.categories || '',
    };
    const saitoJson = buildSaitoPayload(msg);
    const outPath = path.join(SAITO_DIR, `${slug}.saito`);
    fs.writeFileSync(outPath, saitoJson, 'utf8');
    console.log(`OK -> ${path.relative(PROJECT_ROOT, outPath)}`);
    return { slug, outPath };
  } finally {
    if (slug) cleanTmpMod(slug);
    cleanDynWeb();
  }
}

async function run() {
  if (process.argv[2] === 'deploy') {
    const deploySh = path.join(__dirname, 'deploy.sh');
    execSync(`bash "${deploySh}"`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
    return;
  }

  await initSaitoJsForCompile();

  const single = parseArgs();
  if (single) {
    await runSingle(single.zipPath, single.slug);
    return;
  }

  ensureDirs();
  const modsDir = path.join(PROJECT_ROOT, 'mods');
  if (fs.existsSync(modsDir) && fs.readdirSync(modsDir).some((f) => fs.statSync(path.join(modsDir, f)).isDirectory())) {
    console.log('Running zipmods to create zips from mods/...\n');
    runZipmods();
  }
  const zips = getZipFiles();
  if (zips.length === 0) {
    console.log('No .zip files found in dist/mods/zip/. Place module zips there, or ensure mods/ has at least one directory so zipmods can create them.');
    return;
  }

  console.log(`Found ${zips.length} zip(s) in dist/mods/zip/\n`);
  let success = 0;
  let failed = 0;

  for (const zipFile of zips) {
    process.stdout.write(`Compiling ${zipFile} ... `);
    let slug;
    try {
      const zipPath = path.join(ZIP_DIR, zipFile);
      const directory = await unzipper.Open.file(zipPath);
      const metadata = await getMetadataFromZip(zipPath);
      slug = (metadata.slug || '').trim();
    } catch (e) {
      console.log('FAILED');
      console.error(`  Error: ${e.message}`);
      failed++;
      continue;
    }
    if (!slug) {
      console.log('FAILED');
      console.error(`  Error: Module has no slug (missing or invalid this.slug in main .js)`);
      failed++;
      continue;
    }
    cleanTmpMod(slug);
    try {
      const { outPath } = await compileOne(zipFile);
      console.log(`OK -> ${path.relative(PROJECT_ROOT, outPath)}`);
      success++;
    } catch (err) {
      console.log('FAILED');
      console.error(`  Error: ${err.message}`);
      failed++;
    } finally {
      cleanTmpMod(slug);
      cleanDynWeb();
    }
  }

  console.log('\n---');
  console.log(`SUCCESS: ${success}`);
  console.log(`FAILED: ${failed}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
