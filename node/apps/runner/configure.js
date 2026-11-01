const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./config');

const templates = { daemon: 'daemon', conquest: 'config', settlers: 'settlers',
  twilight: 'twilight', paths: 'paths', multi: 'multi' };

function configure(root, names) {
  names = names?.length ? names : ['daemon', ...Object.keys(templates).filter(name =>
    name !== 'daemon' && fs.existsSync(path.join(root, name + '.json')))];
  for (const name of names) if (!Object.hasOwn(templates, name)) throw Error(`Unknown runner config: ${name}`);
  const directory = path.join(root, 'config');
  fs.mkdirSync(directory, { recursive: true });
  return names.map(name => {
    const source = path.join(root, name + '.json');
    const target = path.join(directory, name + '.json');
    if (fs.existsSync(target)) {
      // Never silently choose between two independently edited configs.
      if (fs.existsSync(source) && fs.realpathSync(source) !== fs.realpathSync(target)) {
        throw Error(`Both ${source} and ${target} exist; keep the desired config in ${target} before migrating`);
      }
      return target;
    }
    const migrate = fs.existsSync(source);
    if (migrate && fs.lstatSync(source).isSymbolicLink()) throw Error(`Refusing to replace config symlink: ${source}`);
    const input = migrate ? source : path.join(__dirname, templates[name] + '.example.json');
    const config = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (migrate) {
      const resolved = loadConfig(source);
      // Absolute paths preserve behavior through both the old link and new path.
      config.dataDir = resolved.dataDir;
      if (config.decisionProvider?.executable?.includes('/')) config.decisionProvider.executable = resolved.decisionProvider.executable;
    } else {
      config.dataDir = path.relative(directory, path.resolve(root, config.dataDir || './runner-data'));
    }
    fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (migrate) {
      fs.unlinkSync(source);
      fs.symlinkSync(path.relative(root, target), source);
    }
    return target;
  });
}

if (require.main === module) {
  try {
    for (const file of configure(path.resolve(__dirname, '../..'), process.argv.slice(2))) console.log(file);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { configure };
