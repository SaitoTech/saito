const ModTemplate = require('./../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const RustscriptMain = require('./lib/ui/main');
const ast_execute = require('./lib/rustscript/ast_execute');
const script_to_scripthash = require('./lib/rustscript/script_to_scripthash');

const OpcodeChecksig = require('./lib/opcodes/CHECKSIG');
const OpcodeCheckmultisig = require('./lib/opcodes/CHECKMULTISIG');
const OpcodeCheckhash = require('./lib/opcodes/CHECKHASH');
const OpcodeCheckfield = require('./lib/opcodes/CHECKFIELD');
const OpcodeChecksender = require('./lib/opcodes/CHECKSENDER');
const OpcodeCheckrecipient = require('./lib/opcodes/CHECKRECIPIENT');
const OpcodeCheckpath = require('./lib/opcodes/CHECKPATH');
const OpcodeCheckpathhop = require('./lib/opcodes/CHECKPATHHOP');
const OpcodeImportfield = require('./lib/opcodes/IMPORTFIELD');
const OpcodeSumfields = require('./lib/opcodes/SUMFIELDS');
const OpcodeCheckown = require('./lib/opcodes/CHECKOWN');
const OpcodeCheckownnft = require('./lib/opcodes/CHECKOWNNFT');
const OpcodeCheckownnftwhere = require('./lib/opcodes/CHECKOWNNFTWHERE');
const OpcodeChecktime = require('./lib/opcodes/CHECKTIME');

class Rustscript extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'Rustscript';
    this.name = 'Rustscript';
    this.slug = 'rustscript';
    this.description = 'Symbolic P2SH contract scripting';
    this.categories = 'Utility Programming Cryptography';

    this.styles = [
      '/rustscript/css/main.css',
      '/rustscript/css/rustscript-editor.css',
      '/rustscript/css/rustscript-panel.css',
      '/rustscript/css/rustscript-welcome-overlay.css',
      '/rustscript/css/rustscript-templates-overlay.css',
      '/rustscript/css/rustscript-import-overlay.css',
      '/rustscript/css/rustscript-fields-overlay.css',
      '/rustscript/css/rustscript-opcodes-overlay.css'
    ];

    this.script = {};
    this.opcodes = {};
    this.main = null;
    this.header = null;
  }

  initialize(app) {
    super.initialize?.(app);

    [
      OpcodeChecksig,
      OpcodeCheckmultisig,
      OpcodeCheckhash,
      OpcodeCheckfield,
      OpcodeChecksender,
      OpcodeCheckrecipient,
      OpcodeCheckpath,
      OpcodeCheckpathhop,
      OpcodeImportfield,
      OpcodeSumfields,
      OpcodeCheckown,
      OpcodeCheckownnft,
      OpcodeCheckownnftwhere,
      OpcodeChecktime
    ].forEach((op) => {
      if (op && op.name && typeof op.execute === 'function') {
        const key = op.name.toLowerCase();
        this.opcodes[key] = (node, context) => op.execute(node, context) === true;
        this.opcodes[key].opcode = op;
      }
    });
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (this.main == null) {
      this.main = new RustscriptMain(this.app, this);
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
    }

    await this.header.render();
    this.main.render();
  }

  setScript(script) {
    if (!script || typeof script !== 'object' || Array.isArray(script)) {
      return;
    }
    this.script = JSON.parse(JSON.stringify(script));
  }

  getScript() {
    return JSON.parse(JSON.stringify(this.script));
  }

  setField(path, value) {
    if (typeof path !== 'string' || path.length === 0) {
      return;
    }
    const parts = path.split('.');
    let cursor = this.script;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  getField(path) {
    if (typeof path !== 'string' || path.length === 0) {
      return undefined;
    }
    const parts = path.split('.');
    let cursor = this.script;
    for (let i = 0; i < parts.length; i += 1) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return undefined;
      }
      cursor = cursor[parts[i]];
    }
    return cursor;
  }

  execute(context) {
    if (!context || typeof context !== 'object') {
      return false;
    }

    const clone = JSON.parse(JSON.stringify(this.script));
    const pending = [clone];

    while (pending.length > 0) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') {
        continue;
      }

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
          pending.push(node[i]);
        }
        continue;
      }

      if (node.required && typeof node.required === 'object' && !Array.isArray(node.required)) {
        if (!node.witness || typeof node.witness !== 'object' || Array.isArray(node.witness)) {
          node.witness = {};
        }
        const keys = Object.keys(node.required);
        for (let k = 0; k < keys.length; k += 1) {
          const key = keys[k];
          if (node.witness[key] === undefined) {
            node.witness[key] = node.required[key];
          }
        }
      }

      if (Array.isArray(node.args)) {
        for (let i = 0; i < node.args.length; i += 1) {
          pending.push(node.args[i]);
        }
      }
    }

    if (!clone || typeof clone !== 'object' || typeof clone.op !== 'string' || clone.op.length === 0) {
      return false;
    }

    const execContext = context.opcodes ? context : Object.assign({}, context, { opcodes: this.opcodes });
    const result = ast_execute(clone, execContext);
    return result === true;
  }

  scripthash() {
    const clone = JSON.parse(JSON.stringify(this.script));
    const pending = [clone];

    while (pending.length > 0) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') {
        continue;
      }

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
          pending.push(node[i]);
        }
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(node, 'witness')) {
        delete node.witness;
      }

      if (Array.isArray(node.args)) {
        for (let i = 0; i < node.args.length; i += 1) {
          pending.push(node.args[i]);
        }
      }
    }

    return script_to_scripthash(clone);
  }
}

module.exports = Rustscript;
