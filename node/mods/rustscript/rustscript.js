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
    ].forEach((handler) => {
      const name = handler.name || handler.op;
      if (name && typeof handler === 'function') {
        this.opcodes[name.toLowerCase()] = handler;
      }
    });
  }

  render() {
    this.header = new SaitoHeader(this.app, this);
    this.header.render();
    this.ui.render();
  }

  buildContext({ tx, blk, witness, ...derived } = {}) {
    return {
      app: this.app,
      opcodes: this.opcodes,
      tx: tx ?? {},
      blk: blk ?? {},
      witness: witness ?? {},
      ...derived
    };
  }

  /**
   * Semantic script → locking script JSON (LEFT panel).
   */
  async parseExpertScript(source, execution_input = {}) {
    const text = String(source ?? '').trim();
    if (!text) {
      throw new Error('Script is empty');
    }

    const tokens = semantic_to_tokens(text);
    const lockingScript = tokens_to_ast(tokens);
    const json = JSON.stringify(lockingScript, null, 2);
    const validation = ast_execute.validate(lockingScript);

    const context = this.buildContext(execution_input);
    const execution = await ast_execute(lockingScript, context);

    return {
      tokens,
      ast: lockingScript,
      lockingScript,
      json,
      validation,
      execution
    };
  }

  /**
   * Execute locking script JSON with execution context payload.
   */
  async runAst(lockingScript, execution_input = {}) {
    const context = this.buildContext(execution_input);
    return ast_execute(lockingScript, context);
  }
}

module.exports = Rustscript;
