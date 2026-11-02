/**
 * Whitelist-based JavaScript security validator for untrusted source.
 *
 * Validates source against a restrictive policy by parsing with Acorn and
 * walking the AST. Does not execute, rewrite, or "repair" the source.
 *
 * This is one layer of a broader sandbox (Worker + capability messaging).
 * Successful validation is not a complete sandbox guarantee.
 */

const acorn = require('acorn');

const DANGEROUS_PROPERTIES = new Set([
  'constructor',
  'prototype',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
]);

const ALWAYS_BANNED_GLOBALS = new Set([
  'window',
  'globalThis',
  'self',
  'global',
  'frames',
  'parent',
  'top',
  'document',
  'process',
  'require',
  'module',
  'exports',
  'eval',
  'Function',
  'Reflect',
  'Proxy',
  'Object',
  'Array',
  'Promise',
  'Symbol',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'RegExp',
  'Error',
  'Date',
  'JSON',
  'Math',
  'Number',
  'String',
  'Boolean',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'arguments',
  'debugger',
  'with',
  'this',
  'Worker',
  'SharedWorker',
  'importScripts',
  'Atomics',
  'WebAssembly',
  'SharedArrayBuffer',
  'Intl',
  'Deno',
  'Bun',
  'console',
  'alert',
  'confirm',
  'prompt',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'structuredClone',
  'navigator',
  'location',
  'history',
  'crypto',
  'performance',
  'caches',
  'cookieStore'
]);

const STORAGE_GLOBALS = new Set(['localStorage', 'sessionStorage', 'indexedDB']);

const NETWORK_GLOBALS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'AbortController',
  'Headers',
  'Request',
  'Response'
]);

const EVENT_PROPERTIES = new Set([
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'on',
  'once',
  'emit',
  'off',
  'removeListener',
  'addListener',
  'prependListener',
  'prependOnceListener'
]);

// Language-level identifier literals (not mutable globals in practical terms).
const SAFE_LANGUAGE_IDENTIFIERS = new Set(['undefined', 'NaN', 'Infinity']);

const DEFAULT_ALLOWED_SYNTAX = [
  'functions',
  'variables',
  'objects',
  'arrays',
  'conditionals',
  'loops',
  'arithmetic',
  'comparisons',
  'logical',
  'strings',
  'literals',
  'returns',
  'sequences',
  'blocks'
];

const SYNTAX_NODE_MAP = {
  functions: new Set([
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression'
  ]),
  variables: new Set(['VariableDeclaration', 'VariableDeclarator', 'AssignmentExpression', 'UpdateExpression']),
  objects: new Set(['ObjectExpression', 'Property', 'ObjectPattern']),
  arrays: new Set(['ArrayExpression', 'ArrayPattern', 'SpreadElement']),
  conditionals: new Set(['IfStatement', 'ConditionalExpression', 'SwitchStatement', 'SwitchCase']),
  loops: new Set([
    'ForStatement',
    'ForInStatement',
    'ForOfStatement',
    'WhileStatement',
    'DoWhileStatement',
    'BreakStatement',
    'ContinueStatement'
  ]),
  arithmetic: new Set([]), // handled via operator checks on Binary/Unary/Assignment
  comparisons: new Set([]),
  logical: new Set(['LogicalExpression']),
  strings: new Set(['TemplateLiteral', 'TemplateElement', 'TaggedTemplateExpression']),
  literals: new Set(['Literal', 'Identifier']),
  returns: new Set(['ReturnStatement']),
  sequences: new Set(['SequenceExpression']),
  blocks: new Set(['BlockStatement', 'ExpressionStatement', 'EmptyStatement'])
};

const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', '%', '**', '|', '&', '^', '~', '<<', '>>', '>>>']);
const COMPARISON_OPS = new Set(['==', '===', '!=', '!==', '<', '<=', '>', '>=']);
const LOGICAL_OPS = new Set(['&&', '||', '??', '!']);
const ASSIGNMENT_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '|=', '&=', '^=']);

function locOf(node) {
  const loc = node && node.loc && node.loc.start ? node.loc.start : null;
  return {
    line: loc ? loc.line : null,
    column: loc ? loc.column + 1 : null
  };
}

function makeError(type, message, node) {
  const { line, column } = locOf(node);
  return { type, message, line, column };
}

function normalizeAllowedMethods(raw) {
  if (!raw) {
    return {};
  }
  if (Array.isArray(raw)) {
    // Flat list is ambiguous without object context; treat as empty and require map form.
    return {};
  }
  const out = {};
  for (const [objectName, methods] of Object.entries(raw)) {
    out[objectName] = new Set(Array.isArray(methods) ? methods : []);
  }
  return out;
}

function normalizeAllowedProperties(raw) {
  if (!raw) {
    return {};
  }
  if (Array.isArray(raw)) {
    return {};
  }
  const out = {};
  for (const [objectName, props] of Object.entries(raw)) {
    out[objectName] = new Set(Array.isArray(props) ? props : []);
  }
  return out;
}

function mergePolicy(policy = {}) {
  const allowedSyntax = Array.isArray(policy.allowedSyntax)
    ? policy.allowedSyntax.slice()
    : DEFAULT_ALLOWED_SYNTAX.slice();

  return {
    allowedGlobals: new Set(policy.allowedGlobals || []),
    allowedObjects: new Set(policy.allowedObjects || []),
    allowedMethods: normalizeAllowedMethods(policy.allowedMethods),
    allowedProperties: normalizeAllowedProperties(policy.allowedProperties),
    allowedSyntax: new Set(allowedSyntax),
    allowDynamicExecution: policy.allowDynamicExecution === true,
    allowImports: policy.allowImports === true,
    allowEvents: policy.allowEvents === true,
    allowStorage: policy.allowStorage === true,
    allowNetwork: policy.allowNetwork === true,
    allowAsync: policy.allowAsync === true,
    allowComputedProperties: policy.allowComputedProperties === true
  };
}

function isDangerousPropertyName(name) {
  return typeof name === 'string' && DANGEROUS_PROPERTIES.has(name);
}

function bindingKind(kind, meta = {}) {
  return { kind, ...meta };
}

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  declare(name, info) {
    this.bindings.set(name, info);
  }

  lookup(name) {
    if (this.bindings.has(name)) {
      return this.bindings.get(name);
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    return null;
  }
}

function createSanitizeJS() {
  /**
   * @param {string} source
   * @param {object} [policy]
   * @returns {{ safe: boolean, errors: Array, warnings: Array }}
   */
  function sanitizeJS(source, policy = {}) {
    const warnings = [];
    const errors = [];
    const cfg = mergePolicy(policy);

    if (typeof source !== 'string') {
      return {
        safe: false,
        errors: [
          {
            type: 'invalid_source',
            message: 'Source must be a string',
            line: null,
            column: null
          }
        ],
        warnings
      };
    }

    let ast;
    try {
      ast = acorn.parse(source, {
        ecmaVersion: 2020,
        sourceType: 'script',
        locations: true,
        allowAwaitOutsideFunction: false,
        allowHashBang: false,
        allowReturnOutsideFunction: false
      });
    } catch (err) {
      return {
        safe: false,
        errors: [
          {
            type: 'parse_error',
            message: err.message || 'Failed to parse JavaScript',
            line: err.loc ? err.loc.line : null,
            column: err.loc ? err.loc.column + 1 : null
          }
        ],
        warnings
      };
    }

    const rootScope = new Scope(null);
    // Seed allowed objects into the root scope as authorized bindings.
    for (const name of cfg.allowedObjects) {
      rootScope.declare(name, bindingKind('allowed_object', { objectName: name }));
    }
    for (const name of cfg.allowedGlobals) {
      if (!ALWAYS_BANNED_GLOBALS.has(name) && !cfg.allowedObjects.has(name)) {
        rootScope.declare(name, bindingKind('allowed_global', { globalName: name }));
      }
    }

    function reject(type, message, node) {
      errors.push(makeError(type, message, node));
    }

    function syntaxAllowed(feature) {
      return cfg.allowedSyntax.has(feature);
    }

    function nodeTypeAllowed(type) {
      if (type === 'Program') {
        return true;
      }
      if (type === 'CallExpression' || type === 'MemberExpression' || type === 'ChainExpression') {
        return true; // gated by deeper checks
      }
      if (type === 'UnaryExpression' || type === 'BinaryExpression' || type === 'AssignmentExpression') {
        return true; // gated by operator checks
      }
      if (type === 'ThrowStatement' || type === 'TryStatement' || type === 'CatchClause') {
        return false;
      }
      if (type === 'ClassDeclaration' || type === 'ClassExpression' || type === 'ClassBody' || type === 'MethodDefinition') {
        return false;
      }
      if (type === 'ImportDeclaration' || type === 'ExportNamedDeclaration' || type === 'ExportDefaultDeclaration' || type === 'ExportAllDeclaration' || type === 'ImportExpression') {
        return cfg.allowImports;
      }
      if (type === 'AwaitExpression' || type === 'YieldExpression') {
        return cfg.allowAsync;
      }
      if (type === 'MetaProperty' || type === 'NewExpression' || type === 'ThisExpression' || type === 'Super' || type === 'WithStatement' || type === 'LabeledStatement') {
        return false;
      }

      for (const [feature, types] of Object.entries(SYNTAX_NODE_MAP)) {
        if (types.has(type)) {
          return syntaxAllowed(feature);
        }
      }
      // Unknown node type → reject (fail closed)
      return false;
    }

    function isBannedGlobalName(name) {
      if (ALWAYS_BANNED_GLOBALS.has(name)) {
        return true;
      }
      if (!cfg.allowStorage && STORAGE_GLOBALS.has(name)) {
        return true;
      }
      if (!cfg.allowNetwork && NETWORK_GLOBALS.has(name)) {
        return true;
      }
      if (!cfg.allowDynamicExecution && (name === 'eval' || name === 'Function')) {
        return true;
      }
      return false;
    }

    function resolveIdentifier(name, scope, node) {
      const local = scope.lookup(name);
      if (local) {
        return local;
      }
      if (SAFE_LANGUAGE_IDENTIFIERS.has(name)) {
        return bindingKind('primitive');
      }
      if (cfg.allowedObjects.has(name)) {
        return bindingKind('allowed_object', { objectName: name });
      }
      if (cfg.allowedGlobals.has(name) && !isBannedGlobalName(name)) {
        return bindingKind('allowed_global', { globalName: name });
      }
      if (isBannedGlobalName(name)) {
        reject('unauthorized_access', `Unauthorized global reference: ${name}`, node);
        return bindingKind('forbidden');
      }
      reject('unauthorized_access', `Unauthorized global reference: ${name}`, node);
      return bindingKind('forbidden');
    }

    function staticPropertyName(node) {
      if (!node) {
        return null;
      }
      if (node.type === 'Identifier') {
        return node.name;
      }
      if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
      }
      if (node.type === 'Literal' && typeof node.value === 'number') {
        return String(node.value);
      }
      return null;
    }

    function checkPropertyName(name, node, contextLabel) {
      if (name == null) {
        reject(
          'unauthorized_access',
          `Unsupported or non-static property access${contextLabel ? ` (${contextLabel})` : ''}`,
          node
        );
        return false;
      }
      if (isDangerousPropertyName(name)) {
        reject('unauthorized_access', `Unauthorized property access: ${name}`, node);
        return false;
      }
      if (!cfg.allowEvents && EVENT_PROPERTIES.has(name)) {
        reject('unauthorized_access', `Unauthorized event API access: ${name}`, node);
        return false;
      }
      return true;
    }

    /**
     * Classify an expression's value origin for access-control decisions.
     * Returns a binding descriptor.
     */
    function classify(node, scope) {
      if (!node) {
        return bindingKind('unknown');
      }

      switch (node.type) {
        case 'Identifier':
          return resolveIdentifier(node.name, scope, node);

        case 'Literal':
          return bindingKind('primitive');

        case 'TemplateLiteral':
          return bindingKind('primitive');

        case 'ArrayExpression':
          return bindingKind('local');

        case 'ObjectExpression':
          return bindingKind('local');

        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
          return bindingKind('local_function');

        case 'UnaryExpression':
        case 'BinaryExpression':
        case 'LogicalExpression':
        case 'ConditionalExpression':
        case 'UpdateExpression':
        case 'SequenceExpression':
          return bindingKind('primitive');

        case 'MemberExpression':
        case 'ChainExpression': {
          const member = node.type === 'ChainExpression' ? node.expression : node;
          return classifyMember(member, scope);
        }

        case 'CallExpression':
          return classifyCall(node, scope);

        case 'AssignmentExpression':
          return classify(node.right, scope);

        default:
          return bindingKind('unknown');
      }
    }

    function classifyMember(node, scope) {
      const objectInfo = classify(node.object, scope);

      if (node.computed && !cfg.allowComputedProperties) {
        // Allow only static string/number literals that we can check.
        if (node.property.type !== 'Literal') {
          reject(
            'unauthorized_access',
            'Computed property access is not permitted',
            node
          );
          return bindingKind('forbidden');
        }
      }

      const propName = staticPropertyName(node.property);
      if (node.computed && node.property.type === 'Literal' && typeof node.property.value !== 'string' && typeof node.property.value !== 'number') {
        reject('unauthorized_access', 'Computed property access is not permitted', node);
        return bindingKind('forbidden');
      }

      if (!checkPropertyName(propName, node, 'member')) {
        return bindingKind('forbidden');
      }

      if (objectInfo.kind === 'allowed_object') {
        const objectName = objectInfo.objectName;
        const methods = cfg.allowedMethods[objectName] || new Set();
        const props = cfg.allowedProperties[objectName] || new Set();
        if (methods.has(propName)) {
          return bindingKind('allowed_method', { objectName, methodName: propName });
        }
        if (props.has(propName)) {
          return bindingKind('allowed_property', { objectName, propertyName: propName });
        }
        reject(
          'unauthorized_access',
          `Unauthorized property access: ${objectName}.${propName}`,
          node
        );
        return bindingKind('forbidden');
      }

      if (objectInfo.kind === 'allowed_method' || objectInfo.kind === 'allowed_property') {
        // No chaining through authorized method/property results (blocks .constructor etc. already,
        // and blocks game.addInfluence.something).
        reject(
          'unauthorized_access',
          'Unauthorized property access through authorized reference',
          node
        );
        return bindingKind('forbidden');
      }

      if (objectInfo.kind === 'local' || objectInfo.kind === 'local_function' || objectInfo.kind === 'primitive') {
        // Locals may read/write own static properties, but never dangerous ones (already checked).
        return bindingKind('local');
      }

      if (objectInfo.kind === 'allowed_global') {
        reject(
          'unauthorized_access',
          `Unauthorized property access on global: ${objectInfo.globalName}`,
          node
        );
        return bindingKind('forbidden');
      }

      reject('unauthorized_access', 'Unauthorized property access', node);
      return bindingKind('forbidden');
    }

    function classifyCall(node, scope) {
      if (node.callee.type === 'Identifier') {
        const name = node.callee.name;
        if (!cfg.allowDynamicExecution && (name === 'eval' || name === 'Function')) {
          reject('dynamic_execution', `Dynamic code execution is not permitted: ${name}`, node);
          return bindingKind('forbidden');
        }
      }

      const calleeInfo = classify(node.callee, scope);

      if (calleeInfo.kind === 'forbidden') {
        return bindingKind('forbidden');
      }

      if (calleeInfo.kind === 'allowed_method') {
        return bindingKind('local'); // return value treated as opaque local data
      }

      if (calleeInfo.kind === 'local_function') {
        return bindingKind('local');
      }

      // Local object/array member calls are allowed only when the property name has
      // already passed dangerous-property checks inside classifyMember.
      if (
        calleeInfo.kind === 'local' &&
        (node.callee.type === 'MemberExpression' || node.callee.type === 'ChainExpression')
      ) {
        return bindingKind('local');
      }

      reject('unauthorized_call', 'Unauthorized function call', node);
      return bindingKind('forbidden');
    }

    function declarePattern(pattern, scope, info, nodeForError) {
      if (!pattern) {
        return;
      }
      switch (pattern.type) {
        case 'Identifier':
          scope.declare(pattern.name, info);
          break;
        case 'ObjectPattern':
          for (const prop of pattern.properties) {
            if (prop.type === 'RestElement') {
              declarePattern(prop.argument, scope, bindingKind('local'), prop);
              continue;
            }
            const keyName = staticPropertyName(prop.key);
            if (prop.computed || keyName == null) {
              reject('unauthorized_access', 'Computed or unsupported destructuring key', prop);
              continue;
            }
            if (!checkPropertyName(keyName, prop, 'destructure')) {
              continue;
            }
            // Destructuring from an allowed object must only pull allowed methods/properties.
            if (info.kind === 'allowed_object') {
              const objectName = info.objectName;
              const methods = cfg.allowedMethods[objectName] || new Set();
              const props = cfg.allowedProperties[objectName] || new Set();
              if (methods.has(keyName)) {
                // Extracted methods become unbound — reject to avoid losing call-site checks.
                reject(
                  'unauthorized_access',
                  `Destructuring authorized method is not permitted: ${objectName}.${keyName}`,
                  prop
                );
                continue;
              }
              if (!props.has(keyName)) {
                reject(
                  'unauthorized_access',
                  `Unauthorized destructuring: ${objectName}.${keyName}`,
                  prop
                );
                continue;
              }
              declarePattern(prop.value, scope, bindingKind('local'), prop);
            } else if (info.kind === 'local' || info.kind === 'primitive') {
              declarePattern(prop.value, scope, bindingKind('local'), prop);
            } else {
              reject('unauthorized_access', 'Unauthorized destructuring source', nodeForError || pattern);
            }
          }
          break;
        case 'ArrayPattern':
          for (const el of pattern.elements) {
            if (!el) {
              continue;
            }
            if (el.type === 'RestElement') {
              declarePattern(el.argument, scope, bindingKind('local'), el);
            } else {
              declarePattern(el, scope, bindingKind('local'), el);
            }
          }
          break;
        case 'AssignmentPattern':
          declarePattern(pattern.left, scope, info, nodeForError);
          walk(pattern.right, scope);
          break;
        case 'RestElement':
          declarePattern(pattern.argument, scope, bindingKind('local'), pattern);
          break;
        default:
          reject('unsupported_syntax', `Unsupported binding pattern: ${pattern.type}`, pattern);
      }
    }

    function walkFunction(node, parentScope) {
      if (!syntaxAllowed('functions')) {
        reject('unsupported_syntax', 'Function syntax is not permitted', node);
        return;
      }
      if ((node.async || node.generator) && !cfg.allowAsync) {
        reject('unsupported_syntax', 'Async or generator functions are not permitted', node);
        return;
      }

      const scope = new Scope(parentScope);
      for (const param of node.params) {
        declarePattern(param, scope, bindingKind('local'), param);
        // Default values / nested patterns may contain expressions.
        if (param.type === 'AssignmentPattern') {
          // declarePattern already walks right
        } else {
          walkPatternExpressions(param, parentScope);
        }
      }

      if (node.id && node.id.type === 'Identifier') {
        // Function declarations bind in the parent scope; expressions may self-ref.
        if (node.type === 'FunctionDeclaration') {
          parentScope.declare(node.id.name, bindingKind('local_function'));
        } else {
          scope.declare(node.id.name, bindingKind('local_function'));
        }
      }

      if (node.body.type === 'BlockStatement') {
        walk(node.body, scope);
      } else {
        // Arrow concise body
        walk(node.body, scope);
      }
    }

    function walkPatternExpressions(pattern, scope) {
      if (!pattern) {
        return;
      }
      if (pattern.type === 'AssignmentPattern') {
        walk(pattern.right, scope);
        walkPatternExpressions(pattern.left, scope);
      } else if (pattern.type === 'ObjectPattern') {
        for (const prop of pattern.properties) {
          if (prop.type === 'Property') {
            if (prop.computed) {
              walk(prop.key, scope);
            }
            walkPatternExpressions(prop.value, scope);
          } else if (prop.type === 'RestElement') {
            walkPatternExpressions(prop.argument, scope);
          }
        }
      } else if (pattern.type === 'ArrayPattern') {
        for (const el of pattern.elements) {
          walkPatternExpressions(el, scope);
        }
      } else if (pattern.type === 'RestElement') {
        walkPatternExpressions(pattern.argument, scope);
      }
    }

    function checkOperator(node) {
      const op = node.operator;
      if (node.type === 'BinaryExpression') {
        if (ARITHMETIC_OPS.has(op) && !syntaxAllowed('arithmetic')) {
          reject('unsupported_syntax', `Arithmetic operator not permitted: ${op}`, node);
        }
        if (COMPARISON_OPS.has(op) && !syntaxAllowed('comparisons') && !syntaxAllowed('conditionals')) {
          reject('unsupported_syntax', `Comparison operator not permitted: ${op}`, node);
        }
        if (op === 'in' || op === 'instanceof') {
          reject('unsupported_syntax', `Operator not permitted: ${op}`, node);
        }
      }
      if (node.type === 'UnaryExpression') {
        if ((op === '+' || op === '-' || op === '~') && !syntaxAllowed('arithmetic')) {
          reject('unsupported_syntax', `Arithmetic operator not permitted: ${op}`, node);
        }
        if (op === '!' && !syntaxAllowed('logical') && !syntaxAllowed('conditionals')) {
          reject('unsupported_syntax', 'Logical operator not permitted: !', node);
        }
        if (op === 'typeof' || op === 'delete' || op === 'void') {
          reject('unsupported_syntax', `Operator not permitted: ${op}`, node);
        }
      }
      if (node.type === 'LogicalExpression') {
        if (!syntaxAllowed('logical') && !syntaxAllowed('conditionals')) {
          reject('unsupported_syntax', `Logical operator not permitted: ${op}`, node);
        }
      }
      if (node.type === 'AssignmentExpression') {
        if (!syntaxAllowed('variables')) {
          reject('unsupported_syntax', 'Assignment is not permitted', node);
        }
        if (!ASSIGNMENT_OPS.has(op)) {
          reject('unsupported_syntax', `Assignment operator not permitted: ${op}`, node);
        }
        if (op !== '=' && ARITHMETIC_OPS.has(op.replace('=', '')) && !syntaxAllowed('arithmetic')) {
          reject('unsupported_syntax', `Arithmetic assignment not permitted: ${op}`, node);
        }
      }
    }

    function walk(node, scope) {
      if (!node || errors.length > 50) {
        return;
      }

      if (!nodeTypeAllowed(node.type)) {
        if (
          (node.type === 'ImportExpression' || node.type.startsWith('Import') || node.type.startsWith('Export')) &&
          !cfg.allowImports
        ) {
          reject('unauthorized_import', 'Import/export syntax is not permitted', node);
        } else if ((node.type === 'AwaitExpression' || node.type === 'YieldExpression') && !cfg.allowAsync) {
          reject('unsupported_syntax', `${node.type} is not permitted`, node);
        } else {
          reject('unsupported_syntax', `Unsupported syntax: ${node.type}`, node);
        }
        return;
      }

      switch (node.type) {
        case 'Program':
          for (const stmt of node.body) {
            if (stmt.type === 'FunctionDeclaration' && stmt.id && stmt.id.type === 'Identifier') {
              scope.declare(stmt.id.name, bindingKind('local_function'));
            }
          }
          for (const stmt of node.body) {
            walk(stmt, scope);
          }
          break;

        case 'BlockStatement':
          {
            const blockScope = new Scope(scope);
            for (const stmt of node.body) {
              if (stmt.type === 'FunctionDeclaration' && stmt.id && stmt.id.type === 'Identifier') {
                blockScope.declare(stmt.id.name, bindingKind('local_function'));
              }
            }
            for (const stmt of node.body) {
              walk(stmt, blockScope);
            }
          }
          break;

        case 'ExpressionStatement':
          walk(node.expression, scope);
          break;

        case 'EmptyStatement':
          break;

        case 'VariableDeclaration':
          if (!syntaxAllowed('variables')) {
            reject('unsupported_syntax', 'Variable declarations are not permitted', node);
            break;
          }
          for (const decl of node.declarations) {
            walk(decl, scope);
          }
          break;

        case 'VariableDeclarator': {
          let info = bindingKind('local');
          if (node.init) {
            walk(node.init, scope);
            info = classify(node.init, scope);
            // Aliasing an allowed object preserves the binding kind.
            if (info.kind === 'allowed_method') {
              // Do not allow storing method references for later unbound calls.
              reject(
                'unauthorized_access',
                'Storing authorized method references is not permitted',
                node
              );
              info = bindingKind('forbidden');
            } else if (info.kind === 'forbidden' || info.kind === 'unknown') {
              info = bindingKind('forbidden');
            }
          }
          declarePattern(node.id, scope, info, node);
          break;
        }

        case 'FunctionDeclaration':
          walkFunction(node, scope);
          break;

        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
          walkFunction(node, scope);
          break;

        case 'ReturnStatement':
          if (!syntaxAllowed('returns')) {
            reject('unsupported_syntax', 'Return statements are not permitted', node);
            break;
          }
          if (node.argument) {
            walk(node.argument, scope);
          }
          break;

        case 'IfStatement':
          if (!syntaxAllowed('conditionals')) {
            reject('unsupported_syntax', 'Conditionals are not permitted', node);
            break;
          }
          walk(node.test, scope);
          walk(node.consequent, scope);
          if (node.alternate) {
            walk(node.alternate, scope);
          }
          break;

        case 'ConditionalExpression':
          if (!syntaxAllowed('conditionals')) {
            reject('unsupported_syntax', 'Conditionals are not permitted', node);
            break;
          }
          walk(node.test, scope);
          walk(node.consequent, scope);
          walk(node.alternate, scope);
          break;

        case 'SwitchStatement':
          if (!syntaxAllowed('conditionals')) {
            reject('unsupported_syntax', 'Switch statements are not permitted', node);
            break;
          }
          walk(node.discriminant, scope);
          for (const c of node.cases) {
            walk(c, scope);
          }
          break;

        case 'SwitchCase':
          if (node.test) {
            walk(node.test, scope);
          }
          for (const cons of node.consequent) {
            walk(cons, scope);
          }
          break;

        case 'WhileStatement':
        case 'DoWhileStatement':
          if (!syntaxAllowed('loops')) {
            reject('unsupported_syntax', 'Loops are not permitted', node);
            break;
          }
          walk(node.test, scope);
          walk(node.body, scope);
          break;

        case 'ForStatement':
          if (!syntaxAllowed('loops')) {
            reject('unsupported_syntax', 'Loops are not permitted', node);
            break;
          }
          {
            const forScope = new Scope(scope);
            if (node.init) {
              walk(node.init, forScope);
            }
            if (node.test) {
              walk(node.test, forScope);
            }
            if (node.update) {
              walk(node.update, forScope);
            }
            walk(node.body, forScope);
          }
          break;

        case 'ForInStatement':
        case 'ForOfStatement':
          if (!syntaxAllowed('loops')) {
            reject('unsupported_syntax', 'Loops are not permitted', node);
            break;
          }
          {
            const forScope = new Scope(scope);
            walk(node.right, scope);
            if (node.left.type === 'VariableDeclaration') {
              walk(node.left, forScope);
            } else {
              // for (x of y) — x must already be a local binding target
              declarePattern(node.left, forScope, bindingKind('local'), node.left);
            }
            walk(node.body, forScope);
          }
          break;

        case 'BreakStatement':
        case 'ContinueStatement':
          if (!syntaxAllowed('loops') && !syntaxAllowed('conditionals')) {
            reject('unsupported_syntax', `${node.type} is not permitted`, node);
          }
          if (node.label) {
            reject('unsupported_syntax', 'Labeled break/continue is not permitted', node);
          }
          break;

        case 'Identifier':
          // Presence is validated when used as a value expression by classify/resolve.
          // Standalone Identifier nodes appear under expressions we already classify.
          resolveIdentifier(node.name, scope, node);
          break;

        case 'Literal':
          if (node.regex) {
            reject('unsupported_syntax', 'Regular expression literals are not permitted', node);
          }
          break;

        case 'TemplateLiteral':
          if (!syntaxAllowed('strings') && !syntaxAllowed('literals')) {
            reject('unsupported_syntax', 'Template literals are not permitted', node);
            break;
          }
          for (const expr of node.expressions) {
            walk(expr, scope);
          }
          break;

        case 'TaggedTemplateExpression':
          reject('unsupported_syntax', 'Tagged templates are not permitted', node);
          break;

        case 'ArrayExpression':
          if (!syntaxAllowed('arrays')) {
            reject('unsupported_syntax', 'Array literals are not permitted', node);
            break;
          }
          for (const el of node.elements) {
            if (el) {
              walk(el, scope);
            }
          }
          break;

        case 'ObjectExpression':
          if (!syntaxAllowed('objects')) {
            reject('unsupported_syntax', 'Object literals are not permitted', node);
            break;
          }
          for (const prop of node.properties) {
            walk(prop, scope);
          }
          break;

        case 'Property': {
          if (node.kind === 'get' || node.kind === 'set') {
            reject('unsupported_syntax', 'Getters and setters are not permitted', node);
            break;
          }
          if (node.computed) {
            if (!cfg.allowComputedProperties) {
              // Allow only static literal keys.
              if (node.key.type !== 'Literal' || (typeof node.key.value !== 'string' && typeof node.key.value !== 'number')) {
                reject('unauthorized_access', 'Computed property keys are not permitted', node);
                break;
              }
            } else {
              walk(node.key, scope);
            }
          }
          const keyName = staticPropertyName(node.key);
          if (!checkPropertyName(keyName, node, 'object key')) {
            break;
          }
          walk(node.value, scope);
          break;
        }

        case 'SpreadElement':
          if (!syntaxAllowed('arrays') && !syntaxAllowed('objects')) {
            reject('unsupported_syntax', 'Spread syntax is not permitted', node);
            break;
          }
          // Spreading may copy dangerous properties from objects; reject spreads of non-literals.
          if (node.argument.type !== 'ArrayExpression' && node.argument.type !== 'ObjectExpression') {
            reject('unauthorized_access', 'Spreading non-literal values is not permitted', node);
            break;
          }
          walk(node.argument, scope);
          break;

        case 'MemberExpression':
          classifyMember(node, scope);
          // Walk children for nested unauthorized refs.
          walk(node.object, scope);
          if (node.computed) {
            walk(node.property, scope);
          }
          break;

        case 'ChainExpression':
          reject('unsupported_syntax', 'Optional chaining is not permitted', node);
          break;

        case 'CallExpression':
          if (node.callee.type === 'ImportExpression' || (node.callee.type === 'Identifier' && node.callee.name === 'import')) {
            reject('unauthorized_import', 'Dynamic import is not permitted', node);
            break;
          }
          classifyCall(node, scope);
          // Avoid double-reporting identifier globals inside authorized callees:
          // walk arguments always; walk callee carefully.
          if (node.callee.type === 'MemberExpression') {
            walk(node.callee.object, scope);
            if (node.callee.computed) {
              walk(node.callee.property, scope);
            }
          } else if (node.callee.type === 'Identifier') {
            // classifyCall/resolve already handled unauthorized globals
          } else {
            walk(node.callee, scope);
          }
          for (const arg of node.arguments) {
            walk(arg, scope);
          }
          break;

        case 'NewExpression':
          reject('unsupported_syntax', 'new expressions are not permitted', node);
          break;

        case 'UnaryExpression':
          checkOperator(node);
          walk(node.argument, scope);
          break;

        case 'BinaryExpression':
        case 'LogicalExpression':
          checkOperator(node);
          walk(node.left, scope);
          walk(node.right, scope);
          break;

        case 'AssignmentExpression': {
          checkOperator(node);
          walk(node.right, scope);
          const rightInfo = classify(node.right, scope);
          if (node.left.type === 'Identifier') {
            const existing = scope.lookup(node.left.name);
            if (!existing) {
              reject('unauthorized_access', `Assignment to undeclared identifier: ${node.left.name}`, node.left);
            } else if (rightInfo.kind === 'allowed_method') {
              reject('unauthorized_access', 'Storing authorized method references is not permitted', node);
            } else if (rightInfo.kind === 'allowed_object' || rightInfo.kind === 'allowed_property' || rightInfo.kind === 'local' || rightInfo.kind === 'primitive' || rightInfo.kind === 'local_function' || rightInfo.kind === 'allowed_global') {
              scope.declare(node.left.name, rightInfo.kind === 'forbidden' ? bindingKind('forbidden') : rightInfo);
            } else {
              scope.declare(node.left.name, bindingKind('forbidden'));
            }
          } else if (node.left.type === 'MemberExpression') {
            classifyMember(node.left, scope);
            walk(node.left.object, scope);
            if (node.left.computed) {
              walk(node.left.property, scope);
            }
          } else {
            reject('unsupported_syntax', 'Unsupported assignment target', node.left);
          }
          break;
        }

        case 'UpdateExpression':
          if (!syntaxAllowed('arithmetic') && !syntaxAllowed('variables')) {
            reject('unsupported_syntax', 'Update expressions are not permitted', node);
            break;
          }
          walk(node.argument, scope);
          break;

        case 'SequenceExpression':
          if (!syntaxAllowed('sequences')) {
            reject('unsupported_syntax', 'Sequence expressions are not permitted', node);
            break;
          }
          for (const expr of node.expressions) {
            walk(expr, scope);
          }
          break;

        case 'ThisExpression':
          reject('unauthorized_access', 'Unauthorized this reference', node);
          break;

        case 'AwaitExpression':
          if (!cfg.allowAsync) {
            reject('unsupported_syntax', 'AwaitExpression is not permitted', node);
            break;
          }
          walk(node.argument, scope);
          break;

        case 'YieldExpression':
          if (!cfg.allowAsync) {
            reject('unsupported_syntax', 'YieldExpression is not permitted', node);
            break;
          }
          if (node.argument) {
            walk(node.argument, scope);
          }
          break;

        case 'ImportExpression':
          reject('unauthorized_import', 'Dynamic import is not permitted', node);
          break;

        default:
          reject('unsupported_syntax', `Unsupported syntax: ${node.type}`, node);
          break;
      }
    }

    walk(ast, rootScope);

    // Deduplicate nearly-identical errors (same type/message/line/column)
    const seen = new Set();
    const uniqueErrors = [];
    for (const err of errors) {
      const key = `${err.type}|${err.message}|${err.line}|${err.column}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      uniqueErrors.push(err);
    }

    return {
      safe: uniqueErrors.length === 0,
      errors: uniqueErrors,
      warnings
    };
  }

  return sanitizeJS;
}

const sanitizeJSImpl = createSanitizeJS();
const { createSandbox } = require('./sandbox');

// ---------------------------------------------------------------------------
// Isolated execution (persistent sandbox + capability messaging)
// ---------------------------------------------------------------------------

const DEFAULT_EXECUTION_POLICY = {
  allowNetwork: false,
  allowStorage: false,
  allowEvents: false,
  allowImports: false,
  allowDynamicExecution: false,
  allowAsync: true,
  maxExecutionTime: 5000,
  maxMessages: 1000,
  maxMessageSize: 65536
};

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-clone values that are safe to transfer to/from a Worker.
 * Rejects functions, class instances, DOM nodes, symbols, bigint, and cycles.
 */
function serializeTransferable(value, label = 'value', seen = new WeakSet()) {
  const t = typeof value;
  if (value === null || t === 'string' || t === 'boolean') {
    return value;
  }
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Unsupported non-finite number in ${label}`);
    }
    return value;
  }
  if (t === 'undefined') {
    throw new Error(`Unsupported undefined in ${label}`);
  }
  if (t === 'bigint' || t === 'symbol' || t === 'function') {
    throw new Error(`Unsupported type '${t}' in ${label}`);
  }
  if (t !== 'object') {
    throw new Error(`Unsupported type '${t}' in ${label}`);
  }
  if (seen.has(value)) {
    throw new Error(`Circular reference in ${label}`);
  }
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item, i) => serializeTransferable(item, `${label}[${i}]`, seen));
  }
  if (value instanceof Date || value instanceof RegExp || value instanceof Map || value instanceof Set || value instanceof Error) {
    throw new Error(`Unsupported object type in ${label}`);
  }
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView?.(value))) {
    throw new Error(`Unsupported binary data in ${label}`);
  }
  if (!isPlainObject(value)) {
    throw new Error(`Unsupported object (non-plain) in ${label}`);
  }
  seen.add(value);
  const out = {};
  for (const key of Object.keys(value)) {
    if (isDangerousPropertyName(key)) {
      throw new Error(`Unsupported property name '${key}' in ${label}`);
    }
    out[key] = serializeTransferable(value[key], `${label}.${key}`, seen);
  }
  return out;
}

function normalizeCapabilities(capabilities = {}) {
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    throw new Error('context.capabilities must be a plain object');
  }
  const handlers = {};
  const descriptors = {};
  for (const [namespace, methods] of Object.entries(capabilities)) {
    if (!namespace || typeof namespace !== 'string') {
      throw new Error('Invalid capability namespace');
    }
    if (isDangerousPropertyName(namespace)) {
      throw new Error(`Unauthorized capability namespace: ${namespace}`);
    }
    if (!methods || typeof methods !== 'object' || Array.isArray(methods)) {
      throw new Error(`Capability namespace '${namespace}' must map to an object of methods`);
    }
    handlers[namespace] = {};
    descriptors[namespace] = [];
    for (const [method, impl] of Object.entries(methods)) {
      if (!method || typeof method !== 'string' || isDangerousPropertyName(method)) {
        throw new Error(`Invalid capability method: ${namespace}.${method}`);
      }
      const fn = typeof impl === 'function' ? impl : impl && typeof impl.handler === 'function' ? impl.handler : null;
      if (!fn) {
        throw new Error(`Capability ${namespace}.${method} must be a function`);
      }
      handlers[namespace][method] = {
        fn,
        validateArgs: typeof impl === 'object' && typeof impl.validateArgs === 'function' ? impl.validateArgs : null
      };
      descriptors[namespace].push(method);
    }
  }
  return { handlers, descriptors };
}

function buildValidationPolicy(policy, capabilityDescriptors, dataKeys = []) {
  const merged = { ...DEFAULT_EXECUTION_POLICY, ...(policy || {}) };
  const allowedObjects = new Set(merged.allowedObjects || []);
  const allowedMethods = { ...(merged.allowedMethods || {}) };
  const allowedGlobals = new Set(merged.allowedGlobals || []);

  for (const [namespace, methods] of Object.entries(capabilityDescriptors)) {
    allowedObjects.add(namespace);
    const existing = new Set(allowedMethods[namespace] || []);
    for (const method of methods) {
      existing.add(method);
    }
    allowedMethods[namespace] = Array.from(existing);
  }

  // Data bindings are injected as function parameters in the Worker, so treat
  // their names as authorized identifiers during validation of the wrapped body.
  for (const key of dataKeys) {
    if (typeof key === 'string' && key && !isDangerousPropertyName(key)) {
      allowedGlobals.add(key);
    }
  }

  return {
    ...merged,
    allowedObjects: Array.from(allowedObjects),
    allowedMethods,
    allowedGlobals: Array.from(allowedGlobals),
    // Capability stubs are async; awaiting them is the supported call style.
    allowAsync: true,
    allowNetwork: merged.allowNetwork === true,
    allowStorage: merged.allowStorage === true,
    allowEvents: merged.allowEvents === true,
    allowImports: merged.allowImports === true,
    allowDynamicExecution: merged.allowDynamicExecution === true
  };
}

/**
 * Validate the same shape the Worker executes: an async function body.
 * This permits top-level return/await inside the script without relaxing
 * script-mode sanitizeJS() for unrelated callers.
 */
function wrapSourceForExecutionValidation(source) {
  return `async function __saito_exec__() {\n${source}\n}`;
}

/**
 * Helper object owning the persistent sandbox. Browser must call methods on
 * this object (do not destructure executeJS unbound).
 */
const sanitizeHelper = {
  sandbox: null,

  sanitizeJS(source, policy = {}) {
    return sanitizeJSImpl(source, policy);
  },

  /**
   * Validate and execute untrusted JavaScript in the persistent sandbox.
   * Creates and initializes the sandbox on first use; reuses it afterward.
   */
  async executeJS(source, context = {}, policy = {}) {
    if (typeof source !== 'string') {
      throw new Error('JavaScript source must be a string');
    }

    const execPolicy = { ...DEFAULT_EXECUTION_POLICY, ...(policy || {}) };
    const capabilities = context && context.capabilities ? context.capabilities : {};
    const rawData = context && context.data ? context.data : {};

    const { handlers, descriptors } = normalizeCapabilities(capabilities);

    let data;
    try {
      data = serializeTransferable(rawData, 'context.data');
    } catch (err) {
      throw new Error(`Invalid execution data: ${err.message}`);
    }

    const validationPolicy = buildValidationPolicy(execPolicy, descriptors, Object.keys(data));
    const validation = this.sanitizeJS(wrapSourceForExecutionValidation(source), validationPolicy);
    if (!validation.safe) {
      const detail = validation.errors.map((e) => e.message).join('; ');
      const err = new Error(
        detail ? `JavaScript validation failed: ${detail}` : 'JavaScript validation failed'
      );
      err.validation = validation;
      throw err;
    }

    if (!this.sandbox || this.sandbox.isTerminated()) {
      this.sandbox = createSandbox();
      try {
        await this.sandbox.initialize();
      } catch (err) {
        this.sandbox = null;
        throw err;
      }
    }

    return this.sandbox.execute({
      source,
      data,
      capabilities: descriptors,
      handlers,
      limits: {
        maxExecutionTime: execPolicy.maxExecutionTime,
        maxMessages: execPolicy.maxMessages,
        maxMessageSize: execPolicy.maxMessageSize
      }
    });
  }
};

module.exports = sanitizeHelper;
module.exports.sanitizeJS = sanitizeHelper.sanitizeJS.bind(sanitizeHelper);
module.exports.executeJS = sanitizeHelper.executeJS.bind(sanitizeHelper);
module.exports.serializeTransferable = serializeTransferable;
module.exports.DEFAULT_ALLOWED_SYNTAX = DEFAULT_ALLOWED_SYNTAX;
module.exports.DEFAULT_EXECUTION_POLICY = DEFAULT_EXECUTION_POLICY;
module.exports.DANGEROUS_PROPERTIES = DANGEROUS_PROPERTIES;
