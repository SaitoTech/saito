var ModTemplate = require('../../lib/templates/modtemplate');
const Main = require('./lib/ui/main');


class Tutorial extends ModTemplate {

  constructor(app) {
    super(app);

    this.name = 'Tutorial';
    this.slug = 'tutorial';
    this.description = 'Saito Development Tutorial';
    this.categories = 'Educational';

    this.main = new Main(this.app, this);

  }

  async initialize(app) {
    super.initialize(app);
  }

  async render() {
    this.main.render();
  }

}

module.exports = Tutorial;
