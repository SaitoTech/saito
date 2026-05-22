const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const ModTemplate = require('./../../lib/templates/modtemplate');
const RustscriptMain = require('./lib/ui/main');
const semantic_to_tokens = require('./lib/rustscript/semantic_to_tokens');
const tokens_to_ast = require('./lib/rustscript/tokens_to_ast');
const ast_execute = require('./lib/rustscript/ast_execute');

const OpcodeChecksig = require('./lib/opcodes/checksig');
const OpcodeChecktime = require('./lib/opcodes/checktime');
const OpcodeCheckhash = require('./lib/opcodes/checkhash');
const OpcodeChecksender = require('./lib/opcodes/checksender');
const OpcodeCheckrecipient = require('./lib/opcodes/checkrecipient');
const OpcodeCheckfield = require('./lib/opcodes/checkfield');
const OpcodeCheckmultisig = require('./lib/opcodes/checkmultisig');
const OpcodeCheckown = require('./lib/opcodes/checkown');
const OpcodeCheckownnft = require('./lib/opcodes/checkownnft');
const OpcodeCheckpath = require('./lib/opcodes/checkpath');
const OpcodeCheckpathhop = require('./lib/opcodes/checkpathhop');
const OpcodeCheckownnftwhere = require('./lib/opcodes/checkownnftwhere');
const OpcodeImportfield = require('./lib/opcodes/importfield');
const OpcodeSumfields = require('./lib/opcodes/sumfields');

class Rustscript extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'Rustscript';
    this.name = 'Rustscript';
    this.slug = 'rustscript';
    this.description = 'Symbolic P2SH contract scripting';
    this.categories = 'Utility Programming Cryptography';

    this.styles = ['/rustscript/style.css'];

    this.opcodes = {};
    this.ui = new RustscriptMain(this.app, this, '.saito-container');
  }

  initialize(app) {
    super.initialize?.(app);

    const sharedHelpers = {
      evaluateCondition: this.evaluateCondition.bind(this)
    };

    [
      OpcodeChecksig,
      OpcodeChecktime,
      OpcodeCheckhash,
      OpcodeChecksender,
      OpcodeCheckrecipient,
      OpcodeCheckfield,
      OpcodeCheckmultisig,
      OpcodeCheckown,
      OpcodeCheckownnft,
      OpcodeCheckpath,
      OpcodeCheckpathhop,
      OpcodeCheckownnftwhere,
      OpcodeImportfield,
      OpcodeSumfields
    ].forEach((op) => {
      if (op?.name && typeof op.execute === 'function') {
        Object.assign(op, sharedHelpers);
        this.opcodes[op.name.toLowerCase()] = op;
      }
    });
  }

  render() {
    this.header = new SaitoHeader(this.app, this);
    this.header.render();
    this.ui.render();
  }

  buildContext(derived = {}) {
    const ctx = {
      app: this.app,
      opcodes: this.opcodes,
      tx: derived.tx ?? {},
      blk: derived.blk ?? {},
      witness: derived.witness ?? {},
      __opcodes: {},
      ...derived
    };
    if (!ctx.__opcodes) {
      ctx.__opcodes = {};
    }
    return ctx;
  }

  evaluateCondition(hopContext, condition, context = {}) {
    const { field, operator, value, type } = condition;

    const lhs = field
      .split('.')
      .reduce((obj, key) => (obj !== undefined && obj !== null ? obj[key] : undefined), hopContext);

    let rhs = value;
    if (typeof value === 'string' && context && context[value] !== undefined) {
      rhs = context[value];
    }

    const coerce = (v) => {
      if (!type) {
        return v;
      }
      if (type === 'number') {
        return Number(v);
      }
      if (type === 'string') {
        return String(v);
      }
      if (type === 'boolean') {
        if (v === true || v === false) {
          return v;
        }
        if (v === 'true') {
          return true;
        }
        if (v === 'false') {
          return false;
        }
        if (v === 1) {
          return true;
        }
        if (v === 0) {
          return false;
        }
        return false;
      }
      return v;
    };

    const left = coerce(lhs);
    const right = coerce(rhs);

    switch (operator) {
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Semantic script → locking script (LEFT) + unlocking script (RIGHT).
   */
  async parseExpertScript(source, execution_input = {}) {
    const text = String(source ?? '').trim();
    if (!text) {
      throw new Error('Script is empty');
    }

    const tokens = semantic_to_tokens(text);
    const raw = tokens_to_ast(tokens);
    const lockingScript = ast_execute.materialize(raw, this.opcodes, false);
    const unlockingScript = ast_execute.materialize(raw, this.opcodes, true);

    const json = JSON.stringify(lockingScript, null, 2);
    const validation = ast_execute.validate(lockingScript);

    const context = this.buildContext(execution_input);
    const execution = await ast_execute(unlockingScript, context);

    return {
      tokens,
      raw,
      ast: lockingScript,
      lockingScript,
      unlockingScript,
      json,
      validation,
      execution
    };
  }

  /**
   * Execute unlocking script JSON (RIGHT panel).
   */
  async runAst(unlockingScript, execution_input = {}) {
    const context = this.buildContext(execution_input);
    return ast_execute(unlockingScript, context);
  }
}

module.exports = Rustscript;
