const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const ModTemplate = require('./../../lib/templates/modtemplate');
const RustscriptMain = require('./lib/ui/main');
const { parseExpertScript } = require('./lib/parser');
const exampleScripts = require('./examples/scripts');

class Rustscript extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'Rustscript';
    this.name = 'Rustscript';
    this.slug = 'rustscript';
    this.description = 'Symbolic script parser prototype (AST only, no execution)';
    this.categories = 'Utility Programming Cryptography';

    this.styles = ['/rustscript/style.css'];

    this.examples = exampleScripts;
    this.ui = new RustscriptMain(this.app, this, '.saito-container');
  }

  render() {
    this.header = new SaitoHeader(this.app, this);
    this.header.render();
    this.ui.render();
  }

  /**
   * Parse symbolic expert script text into AST + debug views.
   * @param {string} source
   */
  parseExpertScript(source) {
    return parseExpertScript(source);
  }
}

module.exports = Rustscript;
