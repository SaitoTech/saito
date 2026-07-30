const BlockTeaserTemplate = require('./block-teaser.template');
const { formatBlocksForTeaser } = require('../explorer-format');

class BlockTeaser {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render(container) {
    if (!container) {
      return;
    }

    const loading = !this.mod.blocksReady;
    const error = this.mod.blocksError ? this.app.browser.escapeHTML(this.mod.blocksError) : null;
    const blocks = loading ? [] : formatBlocksForTeaser(this.app, this.mod.blocks || []);

    this.app.browser.replaceElementContentBySelector(
      BlockTeaserTemplate({
        blocks,
        loading,
        error,
        loadingMessage:
          'Fetching block data. Please be patient while we load the latest blocks from the network.'
      }),
      container
    );

    this.attachEvents();
  }

  attachEvents() {
    document
      .querySelectorAll('.block-teaser .explorer-block-card[data-block-hash]')
      .forEach((el) => {
        const navigate = (event) => {
          if (event?.target?.closest('.explorer-pubkey-link')) {
            return;
          }
          event?.preventDefault?.();
          const hash = el.getAttribute('data-block-hash');
          if (hash) {
            this.mod.renderBlock(hash);
          }
        };

        el.onclick = navigate;
        el.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            navigate(event);
          }
        };
      });
  }
}

module.exports = BlockTeaser;
