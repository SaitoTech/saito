const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../lib/config');

const templates = { daemon: 'daemon', conquest: 'config', settlers: 'settlers',
  twilight: 'twilight', paths: 'paths', multi: 'multi' };

function configure(root, names) {
  const directory = path.join(root, 'apps/runner/config');
  const oldSource = name => [path.join(root, name + '.json'), path.join(root, 'config', name + '.json')]
    .filter(file => fs.existsSync(file));
  names = names?.length ? names : ['daemon', ...Object.keys(templates).filter(name =>
    name !== 'daemon' && oldSource(name).length)];
  for (const name of names) if (!Object.hasOwn(templates, name)) throw Error(`Unknown runner config: ${name}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const guide = path.join(directory, 'README.md');
  if (!fs.existsSync(guide)) fs.copyFileSync(path.join(__dirname, '../config-src/README.md'), guide, fs.constants.COPYFILE_EXCL);
  const agents = path.join(directory, 'agents.json');
  if (!fs.existsSync(agents)) fs.writeFileSync(agents,
    fs.readFileSync(path.join(__dirname, '../config-src/agents.example.json')),
    { flag: 'wx', mode: 0o600 });
  return names.map(name => {
    const target = path.join(directory, name + '.json');
    const sources = oldSource(name);
    const distinct = [...new Set(sources.map(file => fs.realpathSync(file)))];
    if (distinct.length > 1 || (fs.existsSync(target) && distinct.some(file => file !== fs.realpathSync(target)))) {
      throw Error(`Both old and new configs exist for ${name}; keep the desired config in ${target} before migrating`);
    }
    if (fs.existsSync(target)) return target;
    const source = distinct[0];
    if (source && !sources.includes(source)) throw Error(`Refusing to migrate external config symlink for ${name}`);
    const migrate = !!source;
    const input = source || path.join(__dirname, '../config-src', templates[name] + '.example.json');
    const config = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (migrate) {
      const resolved = loadConfig(source);
      // Absolute paths preserve behavior through both the old link and new path.
      config.dataDir = resolved.dataDir;
      if (config.agent !== undefined || config.gameAgents !== undefined || config.chatAgent) {
        config.agentsFile = path.resolve(path.dirname(source), config.agentsFile || 'agents.json');
      }
      if (config.decisionProvider?.executable?.includes('/')) config.decisionProvider.executable = resolved.decisionProvider.executable;
    } else {
      config.dataDir = path.relative(directory, path.resolve(root, config.dataDir || './runner-data'));
    }
    fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (migrate) {
      for (const old of new Set([...sources, source])) {
        fs.unlinkSync(old);
        fs.symlinkSync(path.relative(path.dirname(old), target), old);
      }
    }
    return target;
  });
}

if (require.main === module) {
  try {
    for (const file of configure(path.resolve(__dirname, '../../..'), process.argv.slice(2))) console.log(file);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { configure };
