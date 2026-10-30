const MigrationMain = require('./main');

const STATUS_POLL_MS = 5000;

function statusMessage(data = {}) {
  const status = String(data.status || '');
  const amount = data.inbound_amount || data.outbound_amount || '';
  if (status === 'inbound_awaiting') {
    if (Number(data.reserved_until) > 0 && Date.now() >= Number(data.reserved_until)) {
      return 'This reservation has expired. Start a new migration to get a fresh deposit address.';
    }
    return 'Waiting for your deposit...';
  }
  if (status === 'inbound_broadcast' || status === 'inbound_confirmed') {
    return amount
      ? `Deposit of ${amount} detected. Waiting for SAITO issuance...`
      : 'Deposit detected. Waiting for SAITO issuance...';
  }
  if (
    status === 'outbound_awaiting' ||
    status === 'outbound_broadcast' ||
    status === 'treasury_submitted' ||
    status === 'treasury_accepted'
  ) {
    return amount
      ? `Issuing ${amount} SAITO to your wallet...`
      : 'Issuing SAITO to your wallet...';
  }
  if (status === 'outbound_confirmed' || status === 'succeeded') {
    return amount ? `Migration complete. ${amount} SAITO issued.` : 'Migration complete.';
  }
  if (status === 'failed' || status === 'cancelled') {
    return data.error || 'This migration reservation is no longer active. Start a new migration if needed.';
  }
  return data.error || 'Waiting for your deposit...';
}

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

  async requestMigrationStatus(id) {
    const peer = this.mixin_peer?.publicKey;
    if (!peer || !id) {
      return null;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (response) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(response || null);
      };
      const timer = setTimeout(() => finish(null), 15000);
      try {
        this.app.network.sendRequestAsTransaction(
          'migration status',
          { id },
          finish,
          peer
        );
      } catch (err) {
        finish(null);
      }
    });
  },

  clearMigrationStatusPoll() {
    clearInterval(this.migration_status_timer);
    this.migration_status_timer = null;
  },

  startMigrationStatusPoll() {
    this.clearMigrationStatusPoll();
    const id = this.migration_instructions?.id;
    if (!id) {
      return;
    }
    this.migration_status_timer = setInterval(() => {
      void this.refreshMigrationStatus();
    }, STATUS_POLL_MS);
    void this.refreshMigrationStatus();
  },

  async refreshMigrationStatus() {
    const id = this.migration_instructions?.id;
    if (!id) {
      return;
    }
    const response = await this.requestMigrationStatus(id);
    if (!response || response.error) {
      return;
    }
    this.applyMigrationStatus(response);
  },

  applyMigrationStatus(data = {}) {
    if (!this.migration_instructions?.id || Number(data.id) !== Number(this.migration_instructions.id)) {
      return;
    }
    const next = {
      ...this.migration_instructions,
      address: data.address || this.migration_instructions.address,
      ticker: data.ticker || this.migration_instructions.ticker,
      reserved_until: data.reserved_until || this.migration_instructions.reserved_until,
      status: data.status || this.migration_instructions.status,
      inbound_amount: data.inbound_amount || '',
      outbound_amount: data.outbound_amount || '',
      ui_status: statusMessage(data)
    };
    this.migration_instructions = next;
    if (['outbound_confirmed', 'succeeded', 'failed', 'cancelled'].includes(String(data.status || ''))) {
      this.clearMigrationStatusPoll();
    }
    this.migration_page?.render();
  },

  receiveMigrationInstructions(data) {
    if (!data?.address || !data?.id) {
      return;
    }
    this.migration_instructions = {
      address: data.address,
      ticker: data.ticker,
      id: data.id,
      reserved_until: data.reserved_until,
      status: data.status || 'inbound_awaiting',
      mixin_id: data.mixin_id || '',
      ui_status: statusMessage(data)
    };
    this.startMigrationStatusPoll();
    this.migration_page?.render();
  },

  receiveMigrationStatusUpdate(data) {
    if (!this.app.BROWSER || !data?.id) {
      return;
    }
    this.applyMigrationStatus(data);
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
    if (this.migration_instructions?.id) {
      this.startMigrationStatusPoll();
    }
  }
};
