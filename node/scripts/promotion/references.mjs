import fs from 'node:fs';
import path from 'node:path';
import { createRequire, isBuiltin } from 'node:module';
import { committedFiles, git, slash } from './common.mjs';

const sourceExtension = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/;
const assetExtension =
  /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|wasm|mp3|mp4|wav|ogg|json|pdf|html)$/i;

// Audit the committed project, never use git ls-files (which also includes staged files).
export function checkReferences(project, policy) {
  const root = git(project, ['rev-parse', '--show-toplevel']);
  const committed = committedFiles(root);
  const prefix = slash(path.relative(root, project));
  const require = createRequire(path.join(project, 'package.json'));
  const ts = require('typescript');
  const packageJson = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const configPath = path.join(project, 'config/build/tsconfig.json');
  const compilerOptions = fs.existsSync(configPath)
    ? ts.parseJsonConfigFileContent(
        ts.readConfigFile(configPath, ts.sys.readFile).config,
        ts.sys,
        path.dirname(configPath)
      ).options
    : { moduleResolution: ts.ModuleResolutionKind.NodeJs, allowJs: true, resolveJsonModule: true };
  const report = { scanned: 0, checked: 0, errors: [], exceptions: [] };
  const usedExceptions = new Set();

  function issue(source, line, kind, reference, message) {
    const item = { source, line, kind, reference, message };
    const index = policy.referenceExceptions.findIndex(
      (rule) => rule.source === source && rule.kind === kind && rule.reference === reference
    );
    if (index >= 0) {
      usedExceptions.add(index);
      report.exceptions.push({ ...item, reason: policy.referenceExceptions[index].reason });
    } else report.errors.push(item);
  }

  function isCommitted(file) {
    if (!committed.has(slash(path.relative(root, file))) || !fs.existsSync(file)) return false;
    const actual = fs.realpathSync(file);
    return committed.has(slash(path.relative(root, actual))) && fs.statSync(actual).isFile();
  }

  function localModule(reference, file) {
    const resolved = ts.resolveModuleName(reference, file, compilerOptions, ts.sys).resolvedModule;
    if (resolved) return resolved.resolvedFileName;
    const absolute = path.resolve(path.dirname(file), reference);
    return ['', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '/index.js', '/index.ts']
      .map((suffix) => absolute + suffix)
      .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  }

  function moduleReference(reference, file, source, line) {
    report.checked++;
    if (isBuiltin(reference)) return;
    const isLocal = reference.startsWith('.') || reference.startsWith('/');
    const target = localModule(reference, file);
    if (target && !slash(target).includes('/node_modules/')) {
      if (!isCommitted(target))
        issue(source, line, 'module', reference, 'Resolved file is not committed in HEAD');
      return;
    }
    if (isLocal) {
      issue(
        source,
        line,
        'module',
        reference,
        'Local module is missing or resolves outside committed project files'
      );
      return;
    }
    const name = reference.startsWith('@')
      ? reference.split('/').slice(0, 2).join('/')
      : reference.split('/')[0];
    if (!Object.hasOwn(dependencies, name)) {
      issue(source, line, 'module', reference, `Package ${name} is not a declared dependency`);
      return;
    }
    // TypeScript handles TS-only exports; Node handles package export maps and JS packages.
    if (!target) {
      try {
        createRequire(file).resolve(reference);
      } catch {
        issue(source, line, 'module', reference, 'Declared package entry cannot be resolved');
      }
    }
  }

  function fileReference(reference, target, source, line, kind = 'file') {
    report.checked++;
    if (!isCommitted(target))
      issue(
        source,
        line,
        kind,
        reference,
        `Missing or uncommitted: ${slash(path.relative(project, target))}`
      );
  }

  function assets(text, file, source, line) {
    const pattern =
      /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']|\burl\(\s*["']?([^\s"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g;
    for (const match of text.matchAll(pattern)) {
      const referenceLine = line + (text.slice(0, match.index).match(/\n/g) || []).length;
      const reference = match[1] || match[2] || match[3];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) continue;
      if (reference.includes('${') || reference.includes('{{')) {
        issue(
          source,
          referenceLine,
          'dynamic',
          reference,
          'Computed asset path needs an explicit reviewed exception'
        );
        continue;
      }
      const clean = reference.split(/[?#]/)[0];
      if (!assetExtension.test(clean)) continue; // Navigation URLs are routes, not necessarily files.
      let target;
      if (clean.startsWith('/')) {
        const module = /^\/([^/]+)\/(.+)$/.exec(clean);
        const moduleWeb = module && path.join(project, 'mods', module[1], 'web');
        target =
          moduleWeb && fs.existsSync(moduleWeb)
            ? path.join(moduleWeb, module[2])
            : path.join(project, 'web', clean.slice(1));
      } else if (/\.(?:css|html)$/.test(file)) {
        target = path.resolve(path.dirname(file), clean);
      } else {
        const module = /^mods\/([^/]+)\//.exec(source);
        target = path.resolve(project, module ? `mods/${module[1]}/web` : 'web', clean);
      }
      fileReference(reference, target, source, referenceLine, 'asset');
    }
  }

  for (const name of committed) {
    if (prefix && !name.startsWith(`${prefix}/`)) continue;
    const file = path.join(root, name);
    if (!sourceExtension.test(file) && !/\.(?:css|html)$/.test(file)) continue;
    const source = slash(path.relative(project, file));
    // Do not read a tracked symlink whose contents live outside the committed tree.
    if (!isCommitted(file)) {
      issue(source, 1, 'file', source, 'Source file or symlink target is missing or uncommitted');
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    report.scanned++;
    if (!sourceExtension.test(file)) {
      assets(
        text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (comment) =>
          comment.replace(/[^\n]/g, ' ')
        ),
        file,
        source,
        1
      );
      continue;
    }
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (tree.parseDiagnostics.length) {
      const error = tree.parseDiagnostics[0];
      issue(
        source,
        tree.getLineAndCharacterOfPosition(error.start ?? 0).line + 1,
        'file',
        source,
        `Cannot fully parse source (${tree.parseDiagnostics.length} diagnostics): ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`
      );
    }
    function constant(node) {
      if (!node) return undefined;
      if (ts.isStringLiteralLike(node)) return node.text;
      if (ts.isParenthesizedExpression(node)) return constant(node.expression);
      if (ts.isIdentifier(node) && node.text === '__dirname') return path.dirname(file);
      if (ts.isIdentifier(node) && node.text === '__filename') return file;
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = constant(node.left),
          right = constant(node.right);
        return left !== undefined && right !== undefined ? left + right : undefined;
      }
      if (ts.isTemplateExpression(node)) {
        let value = node.head.text;
        for (const span of node.templateSpans) {
          const part = constant(span.expression);
          if (part === undefined) return undefined;
          value += part + span.literal.text;
        }
        return value;
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(tree);
        if (callee === 'process.cwd') return project;
        if (callee === 'require.resolve') {
          const reference = constant(node.arguments[0]);
          return reference === undefined ? undefined : localModule(reference, file);
        }
        if (['path.join', 'path.resolve'].includes(callee)) {
          const parts = node.arguments.map(constant);
          if (parts.every((part) => part !== undefined)) {
            return callee === 'path.join' ? path.join(...parts) : path.resolve(project, ...parts);
          }
        }
      }
      return undefined;
    }
    function visit(node) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        moduleReference(node.moduleSpecifier.text, file, source, line);
      }
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        const argument = node.moduleReference.expression;
        if (argument && ts.isStringLiteralLike(argument))
          moduleReference(argument.text, file, source, line);
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(tree);
        const isModule = ['require', 'require.resolve', 'import', 'require.context'].includes(
          callee
        );
        const isFile = /(?:^|\.)(?:readFileSync|readFile|sendFile|createReadStream)$/.test(callee);
        if (isModule || isFile) {
          const argument = node.arguments[0];
          const reference = constant(argument);
          if (reference === undefined || callee === 'require.context') {
            issue(
              source,
              line,
              'dynamic',
              node.getText(tree),
              'Computed file/module reference needs a reviewed exception'
            );
          } else if (isModule) moduleReference(reference, file, source, line);
          else fileReference(reference, path.resolve(project, reference), source, line);
        }
      }
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(tree) === 'URL' &&
        node.arguments?.[1]?.getText(tree) === 'import.meta.url'
      ) {
        const reference = constant(node.arguments[0]);
        if (reference === undefined)
          issue(source, line, 'dynamic', node.getText(tree), 'Computed URL needs review');
        else fileReference(reference, path.resolve(path.dirname(file), reference), source, line);
      }
      if (ts.isStringLiteralLike(node)) assets(node.text, file, source, line);
      if (ts.isTemplateExpression(node)) assets(node.getText(tree), file, source, line);
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  policy.referenceExceptions.forEach((rule, index) => {
    if (!usedExceptions.has(index))
      report.errors.push({ ...rule, line: 0, message: 'Unused exception; remove or update it' });
  });
  return report;
}
