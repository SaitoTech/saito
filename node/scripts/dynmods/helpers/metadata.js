'use strict';

/**
 * Extract literal module metadata from zip without executing module code.
 * Does not require app or browser.
 */

const unzipper = require('unzipper');
const ts = require('typescript');

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
 * @returns {Promise<{ name, gamename, image, description, categories, slug, publisher_message, status, class, version }>}
 */
async function getMetadataFromZip(zipPath) {
  const metadata = {
    name: 'Unknown Module',
    gamename: '',
    image: '',
    description: 'unknown',
    categories: 'unknown',
    slug: '',
    publisher_message: '',
    status: '',
    class: '',
    version: ''
  };

  const directory = await unzipper.Open.file(zipPath);
  const promises = directory.files.map(async (file) => {
    const filePath = file.path;

    //console.log('filePath:', filePath);

    if (filePath.endsWith('arcade.jpg') || filePath.endsWith('saito_icon.jpg')) {
      const content = await file.buffer();
      metadata.image = 'data:image/jpeg;base64,' + content.toString('base64');
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
    const source = ts.createSourceFile(
      filePath,
      content.toString('utf-8'),
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.JS
    );
    const found = new Set();

    // Read constructor literals, preserving multiline strings, HTML and punctuation.
    // Parsing rather than evaluating also skips comments and dynamic expressions.
    function visit(node) {
      if (ts.isConstructorDeclaration(node) && node.body) {
        for (const statement of node.body.statements) {
          if (!ts.isExpressionStatement(statement)) continue;
          const assignment = statement.expression;
          if (
            !ts.isBinaryExpression(assignment) ||
            assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken
          ) continue;
          const { left, right } = assignment;
          if (
            !ts.isPropertyAccessExpression(left) ||
            left.expression.kind !== ts.SyntaxKind.ThisKeyword
          ) continue;
          const key = left.name.text;
          if (key === 'image' || !Object.hasOwn(metadata, key) || found.has(key)) continue;
          if (!ts.isStringLiteral(right) && !ts.isNoSubstitutionTemplateLiteral(right)) continue;
          metadata[key] = right.text;
          found.add(key);
        }
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  });

  await Promise.all(promises);
  return metadata;
}

module.exports = { getMetadataFromZip, cleanString };
