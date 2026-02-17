'use strict';

/**
 * Resolve entrypoint path inside unzipper directory (same logic as DevTools getAppPath).
 * @param {object} directory - unzipper.Open result
 * @param {string} slug - module slug
 * @returns {Promise<string>} e.g. 'slug.js', 'slug/slug.js', or 'slug/slug/slug.js'
 */
async function getAppPath(directory, slug) {
  let appPath = `${slug}.js`;
  const promises = directory.files.map(async (file) => {
    const filePath = file.path;
    if (filePath === `${slug}/${slug}/`) {
      appPath = `${slug}/${slug}/${slug}.js`;
    } else if (filePath === `${slug}/`) {
      appPath = `${slug}/${slug}.js`;
    }
  });
  await Promise.all(promises);
  return appPath;
}

module.exports = { getAppPath };
