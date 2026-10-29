const MigrationMain = require('./main');

module.exports = {
  isMigrationRoute() {
    return this.urlpath?.[1]?.toLowerCase() === 'migration';
  },

  async requestMigration(data) {
    const peer = this.mixin_peer?.publicKey;
    if (!peer) {
      throw new Error('Migration service is not available');
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (response) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (!response?.address || response.error || response.err) {
          reject(new Error(response?.error || response?.err || 'Migration request failed'));
          return;
        }
        resolve(response);
      };
      const timer = setTimeout(() => finish({ error: 'Migration service timed out' }), 30000);
      try {
        this.app.network.sendRequestAsTransaction(
          'migration request',
          {
            publickey: data.publickey,
            chain_address: data.chain_address,
            email: data.email,
            ticker: data.ticker
          },
          finish,
          peer
        );
      } catch (err) {
        finish({ error: err?.message || String(err) });
      }
    });
  },

  receiveMigrationInstructions(data) {
    if (!data?.address || !data?.id) {
      return;
    }
    this.migration_instructions = {
      address: data.address,
      ticker: data.ticker,
      id: data.id
    };
    this.migration_error = '';
    this.migration_page?.render();
  },

  async renderMigrationPage() {
    this.migration_page = new MigrationMain(this.app, this);
    if (!this.migration_header) {
      const SaitoHeader = require('../../../../../lib/saito/ui/saito-header/saito-header');
      this.migration_header = new SaitoHeader(this.app, this);
      await this.migration_header.initialize(this.app);
    }
    await this.migration_header.render();
    await this.migration_page.render();
  }
};
