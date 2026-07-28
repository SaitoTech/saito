const NodeCard = require('./node-card');

class NodeCardManager {
  constructor(app, mod, containerSelector) {
    this.app = app;
    this.mod = mod;
    this.container = containerSelector;
    this.cards = new Set();
  }

  render() {
    this.addCard('Browser', '', {}, this.app.options);
  }

  addCard(title, endpoint, config = {}, options = {}) {
    console.log('addCard config:', config);

    const onExplore = (url, config) => {
      console.log('onExplore config: ', config);
      this.addCard(url.replace(/^https?:\/\//, ''), url, config);
    };
    const onClose = () => this.removeCard(card);

    const props = { title, endpoint, onExplore, onClose, options: options, config: config };

    const card = new NodeCard(this.app, this.mod, props);
    card.render();
    this.cards.add(card);
  }

  removeCard(card) {
    if (!this.cards.has(card)) return;
    card.remove();
    this.cards.delete(card);
  }

  clearAll() {
    this.cards.forEach((card) => this.removeCard(card));
    this.cards.clear();
  }
}

module.exports = NodeCardManager;
