// Read literal constructor fields without loading or running disabled modules.
function constructorMetadata(source) {
  const tokens =
    source.match(
      /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_$][\w$]*|[^\s]/g
    ) || [];
  const code = tokens.filter((token) => !token.startsWith('//') && !token.startsWith('/*'));
  const fields = new Set(['name', 'description', 'categories', 'status', 'class', 'slug', 'img']);
  const result = {};
  const start = code.findIndex((token, i) => token === 'constructor' && code[i + 1] === '(');
  if (start < 0) return result;
  let i = start + 2;
  let parentheses = 1;
  while (i < code.length && parentheses) {
    if (code[i] === '(') parentheses++;
    if (code[i] === ')') parentheses--;
    i++;
  }
  if (code[i++] !== '{') return result;
  let depth = 1;
  for (; i < code.length && depth; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') depth--;
    if (
      depth !== 1 ||
      code[i] !== 'this' ||
      code[i + 1] !== '.' ||
      !fields.has(code[i + 2]) ||
      code[i + 3] !== '=' ||
      code[i + 5] !== ';'
    )
      continue;
    const literal = code[i + 4];
    if (!/^['"`]/.test(literal) || (literal[0] === '`' && literal.includes('${'))) continue;
    result[code[i + 2]] = literal
      .slice(1, -1)
      .replace(/\\(?:u([\da-fA-F]{4})|x([\da-fA-F]{2})|([\s\S]))/g, (_, unicode, hex, escaped) =>
        unicode || hex
          ? String.fromCharCode(parseInt(unicode || hex, 16))
          : ({ n: '\n', r: '\r', t: '\t', '\n': '' }[escaped] ?? escaped)
      )
      .trim();
  }
  return result;
}

function findModuleImage(fs, path, modulesDir, name, metadata = {}) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) return '';
  const webDir = path.join(modulesDir, name, 'web');
  const candidates = [];
  const prefix = `/${metadata.slug || name}/`;
  if (metadata.img?.startsWith(prefix)) candidates.push(metadata.img.slice(prefix.length));
  for (const stem of [
    'img/arcade/arcade',
    'img/saito_icon',
    'saito_icon',
    'img/arcade',
    `img/${name}`
  ]) {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'])
      candidates.push(`${stem}.${ext}`);
  }
  for (const candidate of candidates) {
    if (!/\.(png|jpe?g|webp|svg|gif)$/i.test(candidate)) continue;
    try {
      const filename = fs.realpathSync(path.resolve(webDir, candidate));
      const relative = path.relative(fs.realpathSync(webDir), filename);
      if (
        !relative.startsWith('..') &&
        !path.isAbsolute(relative) &&
        fs.statSync(filename).isFile()
      ) {
        return filename;
      }
    } catch (_) {
      // A module need not provide a thumbnail.
    }
  }
  return '';
}

function readModuleMetadata(fs, path, modulesDir, name) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) return {};
  let metadata = {};
  try {
    metadata = constructorMetadata(
      fs.readFileSync(path.join(modulesDir, name, `${name}.js`), 'utf8')
    );
  } catch (_) {
    // Keep the module available even when its metadata cannot be read.
  }
  const image = findModuleImage(fs, path, modulesDir, name, metadata);
  return {
    title: metadata.name || name,
    description: metadata.description || '',
    categories: (metadata.categories || '').split(/[\s,]+/).filter(Boolean),
    status: metadata.status || '',
    class: metadata.class || '',
    image: image ? `/admin/module-image/${encodeURIComponent(name)}` : ''
  };
}

function serveModuleImage(fs, path, modulesDir, req, res) {
  const name = req.params.module;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) return res.sendStatus(404);
  try {
    const metadata = constructorMetadata(
      fs.readFileSync(path.join(modulesDir, name, `${name}.js`), 'utf8')
    );
    const filename = findModuleImage(fs, path, modulesDir, name, metadata);
    if (filename) {
      return res.sendFile(filename, {
        headers: {
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }
  } catch (_) {
    // Missing modules and missing covers use the UI's blank placeholder.
  }
  return res.sendStatus(404);
}

module.exports = { constructorMetadata, findModuleImage, readModuleMetadata, serveModuleImage };
