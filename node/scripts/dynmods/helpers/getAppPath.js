'use strict';

/**
 * Resolve an existing entrypoint inside the ZIP. A module's source directory
 * and filename can differ from its public slug (pandemic -> epidemic).
 * @param {object} directory - unzipper.Open result
 * @param {string} slug - module slug
 * @returns {Promise<string>} path relative to the extraction directory
 */
async function getAppPath(directory, slug) {
  const files = new Set(
    directory.files.filter((file) => file.type !== 'Directory').map((file) => file.path)
  );
  const slugPaths = [`${slug}/${slug}/${slug}.js`, `${slug}/${slug}.js`, `${slug}.js`];
  for (const candidate of slugPaths) {
    if (files.has(candidate)) return candidate;
  }

  // zipmods uses <source-directory>/<source-directory>.js. Also support
  // the repeated directory wrapper accepted by the legacy resolver.
  const candidates = [...files].filter((filePath) => {
    const parts = filePath.split('/');
    return (
      (parts.length === 2 || (parts.length === 3 && parts[0] === parts[1])) &&
      parts[parts.length - 1] === `${parts[0]}.js`
    );
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`Ambiguous module entry point for slug "${slug}": ${candidates.join(', ')}`);
  }
  throw new Error(`No module entry point found in ZIP for slug "${slug}"`);
}

module.exports = { getAppPath };
