'use strict';

/**
 * Extract module metadata from zip (same logic as DevTools getNameAndDescriptionFromZip).
 * Does not require app or browser.
 */

const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

function cleanString(str) {
  if (!str || typeof str !== 'string') return '';
  str = str.replace(/^\s+|\s+$/gm, '');
  str = str.substring(1, str.length - 1);
  return [...str]
    .map((char) => {
      if (char === ' ') return ' ';
      if (char === '.') return '.';
      if (char === ',') return ',';
      if (char === '!') return '!';
      if (char === '`') return '';
      if (char === '\\' || char === "'" || char === '"' || char === ';') return '';
      if (!/[a-zA-Z0-9_-]/.test(char)) return '';
      return char;
    })
    .join('');
}

/**
 * @param {string} zipPath - absolute path to zip file
 * @returns {Promise<{ name, image, description, categories, slug, version }>}
 */
async function getMetadataFromZip(zipPath) {
  let name = 'Unknown Module';
  let image = '';
  let description = 'unknown';
  let categories = 'unknown';
  let slug = '';
  let version = '1.0.0';

  const directory = await unzipper.Open.file(zipPath);
  const promises = directory.files.map(async (file) => {
    const filePath = file.path;

    //console.log('filePath:', filePath);

    if (filePath.endsWith('arcade.jpg') || filePath.endsWith('saito_icon.jpg')) {
      const content = await file.buffer();
      image = 'data:image/jpeg;base64,' + content.toString('base64');
      return;
    }
    if (filePath.substr(0, 3) === 'lib') return;
    if (filePath.substr(-2) !== 'js') return;
    if (filePath.indexOf('web/') > -1) return;
    if (filePath.indexOf('src/') > -1) return;
    if (filePath.indexOf('www/') > -1) return;
    if (filePath.indexOf('lib/') > -1) return;
    if (filePath.indexOf('license/') > -1) return;
    if (filePath.indexOf('docs/') > -1) return;
    if (filePath.indexOf('sql/') > -1) return;

    const content = await file.buffer();
    const zipText = content.toString('utf-8');
    const zipLines = zipText.split('\n');

    let foundName = 0;
    let foundDescription = 0;
    let foundCategories = 0;
    let foundSlug = 0;

    for (let i = 0; i < zipLines.length && i < 100 && (foundName === 0 || foundDescription === 0 || foundCategories === 0 || foundSlug === 0); i++) {
      if (/this\.name/.test(zipLines[i]) && foundName === 0) {
        foundName = 1;
        if (zipLines[i].indexOf('=') > 0) {
          name = zipLines[i].substring(zipLines[i].indexOf('='));
          name = cleanString(name);
          name = name.replace(/^\s+|\s+$/gm, '');
          if (name.length > 50) { name = 'Unknown'; foundName = 0; }
          if (name === 'name') { name = 'Unknown'; foundName = 0; }
        }
      }
      if (/this\.description/.test(zipLines[i]) && foundDescription === 0) {
        foundDescription = 1;
        if (zipLines[i].indexOf('=') > 0) {
          description = zipLines[i].substring(zipLines[i].indexOf('='));
          description = cleanString(description);
          description = description.replace(/^\s+|\s+$/gm, '');
        }
      }
      if (/this\.categories/.test(zipLines[i]) && foundCategories === 0) {
        foundCategories = 1;
        if (zipLines[i].indexOf('=') > 0) {
          categories = zipLines[i].substring(zipLines[i].indexOf('='));
          categories = cleanString(categories);
          categories = categories.replace(/^\s+|\s+$/gm, '');
        }
      }
      if (/this\.slug/.test(zipLines[i]) && foundSlug === 0) {
        foundSlug = 1;
        if (zipLines[i].indexOf('=') > 0) {
          slug = zipLines[i].substring(zipLines[i].indexOf('='));
          slug = cleanString(slug);
          slug = slug.replace(/^\s+|\s+$/gm, '');
        }
      }
    }
  });

  await Promise.all(promises);
  return { name, image, description, categories, slug, version };
}

module.exports = { getMetadataFromZip, cleanString };
