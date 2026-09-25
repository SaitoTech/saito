'use strict';

// Isolated production-loader/module-context audit; writes only to /tmp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const webpack = require('webpack');
const root = path.resolve(__dirname, '../../..');
const configPath = path.join(root, 'config/build/webpack.config.cjs');
const configRequire = createRequire(configPath);
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'settlersx-build-'));
let config;
// The repository config runs webpack immediately, so capture its configuration
// without invoking its normal output path or editing global build settings.
const capture = new Proxy(webpack, { apply(_target, _this, args) { config = args[0]; } });
vm.runInThisContext('(function(require, __dirname, process) {\n' + fs.readFileSync(configPath, 'utf8') + '\n})', { filename: configPath })(
  Object.assign(name => name === 'webpack' ? capture : configRequire(name), { resolve: configRequire.resolve }),
  path.dirname(configPath), { argv: ['node', configPath, 'dev'] }
);
const entry = path.join(output, 'entry.js');
const sourceDirectory = path.join(root, 'mods/settlersx');
const moduleDirectory = path.join(output, 'mods/settlersx/');
// Mirror scripts/compile's module staging: runtime assets and root docs are
// removed before discovery, but nested development folders are still included.
const excluded = new Set(['web', 'sql', 'www', 'src', 'docs', 'compile', 'BUGS.txt', 'DESCRIPTION.txt', 'README.txt', 'install.sh', 'license']);
fs.cpSync(sourceDirectory, moduleDirectory, {
  recursive: true,
  filter(source) {
    const relative = path.relative(sourceDirectory, source);
    const top = relative.split(path.sep)[0];
    return !excluded.has(top) && !(relative === top && /(?:\.md|-dump\.txt)$/.test(top));
  }
});
fs.symlinkSync(path.join(root, 'lib'), path.join(output, 'lib'), 'dir');
fs.symlinkSync(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'dir');
// Mirror app.ts's extensionless dynamic require so every file in this module
// is discovered, including development tools that must be ignored for web.
fs.writeFileSync(entry, `const load = name => require(${JSON.stringify(moduleDirectory)} + name); module.exports = load('settlersx.js');`);
config.entry = entry;
config.output = { path: path.join(output, 'bundle'), filename: 'settlersx.js' };
config.cache = false;
config.devtool = false;
config.mode = 'development';
config.optimization.minimize = false;
// The normal compiler copies sources under dist/bundler first. Resolve their
// existing source paths directly for this isolated test of the same loaders.
for (const rule of config.module.rules) {
  if (rule.test?.test('source.ts')) rule.include = [path.join(root, 'lib')];
  const loaders = Array.isArray(rule.use) ? rule.use : [rule.use];
  for (const loader of loaders) if (loader && typeof loader === 'object' && loader.options?.cacheDirectory) loader.options.cacheDirectory = path.join(output, 'babel-cache');
}
webpack(config, (error, stats) => {
  if (error) throw error;
  const report = stats.toJson({ all: false, errors: true, warnings: true, modules: true, nestedModules: true });
  fs.writeFileSync(path.join(output, 'stats.json'), JSON.stringify(report, null, 2));
  if (stats.hasErrors()) {
    console.error(stats.toString({ all: false, errors: true, errorDetails: true }));
    console.error(`Build details: ${output}`);
    process.exitCode = 1;
    return;
  }
  // Webpack can report success while emitting invalid external expressions
  // for artwork paths discovered by the extensionless module require.
  const bundlePath = path.join(config.output.path, config.output.filename);
  new vm.Script(fs.readFileSync(bundlePath, 'utf8'), { filename: bundlePath });
  const flatten = modules => modules.flatMap(module => [module, ...flatten(module.modules || [])]);
  const modules = flatten(report.modules || []);
  for (const file of ['tools/serve.cjs', 'tests/browser.cjs', 'tests/flows.cjs', 'tests/scene-browser.cjs', 'tests/parity.cjs', 'tests/geometry.cjs', 'tests/build.cjs']) {
    assert.ok(modules.some(module => module.name?.includes(file) && module.name.includes('(ignored)')), `${file} is ignored in browser module discovery`);
    assert.ok(!modules.some(module => module.nameForCondition === path.join(moduleDirectory, file)), `${file} is never bundled`);
  }
  console.log(`SettlersX production loaders and dynamic module discovery compile successfully; Node-only tools ignored. ${report.warnings.length} framework/dependency warnings. Output: ${output}`);
});
