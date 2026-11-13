const IMAGE_NAMES = ['png', 'jpg', 'jpeg', 'webp', 'svg'];

const FIELD = /this\.(name|description|status|class|categories)\s*=\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g;

function moduleName(name) {
  const value = String(name || '');
  if (!/^[a-z0-9_-]+$/i.test(value)) {
    return '';
  }
  return value;
}

function assignment(source, field) {
  FIELD.lastIndex = 0;
  let match;
  while ((match = FIELD.exec(source))) {
    if (match[1] === field) {
      return match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return '';
}

function imageFile(fs, path, module_dir, name) {
  for (const ext of IMAGE_NAMES) {
    const file = path.join(module_dir, 'web', 'img', `${name}.${ext}`);
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return file;
      }
    } catch (err) {
      continue;
    }
  }
  return '';
}

function readModuleMetadata(fs, path, modules_dir, name) {
  const module_name = moduleName(name);
  if (!fs || !path || !module_name) {
    return {};
  }
  const module_dir = path.join(modules_dir, module_name);
  const entry = path.join(module_dir, `${module_name}.js`);
  let source = '';
  try {
    source = fs.readFileSync(entry, 'utf8');
  } catch (err) {
    return {};
  }
  const categories = assignment(source, 'categories')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const metadata = {
    title: assignment(source, 'name') || module_name,
    description: assignment(source, 'description'),
    categories,
    status: assignment(source, 'status'),
    class: assignment(source, 'class')
  };
  if (imageFile(fs, path, module_dir, module_name)) {
    metadata.image = `/admin/module-image/${encodeURIComponent(module_name)}`;
  }
  return metadata;
}

function contentType(file) {
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function serveModuleImage(fs, path, modules_dir, req, res) {
  const module_name = moduleName(req?.params?.module);
  if (!fs || !path || !module_name) {
    res.status(404).end();
    return;
  }
  const file = imageFile(fs, path, path.join(modules_dir, module_name), module_name);
  if (!file) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', contentType(file));
  res.sendFile(file);
}

module.exports = { readModuleMetadata, serveModuleImage };
