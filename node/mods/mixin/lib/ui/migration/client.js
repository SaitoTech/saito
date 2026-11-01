const MigrationMain = require('./main');

const STATUS_POLL_MS = 5000;
const SAITO_ARRIVAL_POLL_MS = 1500;

const WAITING_FOR_ISSUANCE = new Set([
  'inbound_broadcast',
  'inbound_confirmed',
  'outbound_awaiting',
  'outbound_broadcast',
  'treasury_submitted',
  'treasury_accepted'
]);

const TERMINAL_STATUSES = new Set(['outbound_confirmed', 'succeeded', 'failed', 'cancelled']);

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

  async requestMigrationExtend(id) {
    const peer = this.mixin_peer?.publicKey;
    if (!peer) {
      throw new Error('Migration service is not available');
    }
    if (!id) {
      throw new Error('Migration extension requires an id');
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
          reject(new Error(response?.error || response?.err || 'Unable to extend the reservation'));
          return;
        }
        resolve(response);
      };
      const timer = setTimeout(() => finish({ error: 'Migration service timed out' }), 30000);
      try {
        this.app.network.sendRequestAsTransaction(
          'migration extend',
          { id },
          finish,
          peer
        );
      } catch (err) {
        finish({ error: err?.message || String(err) });
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

  expectedMigrationSaitoNolan(instructions = this.migration_instructions) {
    const amount = Number(instructions?.outbound_amount || instructions?.inbound_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0n;
    }
    try {
      return this.app.wallet.convertSaitoToNolan(amount);
    } catch (err) {
      return 0n;
    }
  },

  stopMigrationSaitoArrivalWatch() {
    if (this.migration_saito_arrival_timer) {
      clearInterval(this.migration_saito_arrival_timer);
      this.migration_saito_arrival_timer = null;
    }
    this.migration_saito_arrival_baseline = null;
    this.migration_saito_arrival_expected = null;
    this.migration_saito_arrival_id = null;
  },

  async startMigrationSaitoArrivalWatch() {
    const instructions = this.migration_instructions;
    const id = instructions?.id;
    const status = String(instructions?.status || '');
    if (!id || !WAITING_FOR_ISSUANCE.has(status) || this.migration_saito_arrival_timer) {
      return;
    }
    const expected = this.expectedMigrationSaitoNolan(instructions);
    if (expected <= 0n) {
      return;
    }
    this.migration_saito_arrival_expected = expected;
    this.migration_saito_arrival_id = id;
    let baseline = 0n;
    try {
      baseline = await this.app.wallet.getBalance('SAITO');
    } catch (err) {
      console.error('Migration: unable to read SAITO balance for arrival watch', err);
      this.migration_saito_arrival_expected = null;
      this.migration_saito_arrival_id = null;
      return;
    }
    if (
      this.migration_saito_arrival_timer ||
      this.migration_saito_arrival_id !== id ||
      !WAITING_FOR_ISSUANCE.has(String(this.migration_instructions?.status || ''))
    ) {
      return;
    }
    this.migration_saito_arrival_baseline = baseline;
    this.migration_saito_arrival_timer = setInterval(() => {
      void this.checkMigrationSaitoArrival();
    }, SAITO_ARRIVAL_POLL_MS);
    this.migration_saito_arrival_timer.unref?.();
    void this.checkMigrationSaitoArrival();
  },

  async checkMigrationSaitoArrival() {
    const instructions = this.migration_instructions;
    if (
      !instructions?.id ||
      this.migration_saito_arrival_id !== instructions.id ||
      this.migration_saito_arrival_baseline == null ||
      this.migration_saito_arrival_expected == null ||
      TERMINAL_STATUSES.has(String(instructions.status || ''))
    ) {
      return;
    }
    let balance = 0n;
    try {
      balance = await this.app.wallet.getBalance('SAITO');
    } catch (err) {
      return;
    }
    if (balance - this.migration_saito_arrival_baseline >= this.migration_saito_arrival_expected) {
      this.onMigrationSaitoArrived();
    }
  },

  onMigrationSaitoArrived() {
    const instructions = this.migration_instructions;
    if (!instructions?.id || TERMINAL_STATUSES.has(String(instructions.status || ''))) {
      this.stopMigrationSaitoArrivalWatch();
      return;
    }
    const amount = instructions.outbound_amount || instructions.inbound_amount || '';
    this.stopMigrationSaitoArrivalWatch();
    this.clearMigrationStatusPoll();
    this.migration_instructions = {
      ...instructions,
      status: 'outbound_confirmed',
      ui_status: amount
        ? `Migration complete. ${amount} SAITO issued.`
        : 'Migration complete.'
    };
    this.migration_page?.render();
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
    const status = String(next.status || '');
    if (TERMINAL_STATUSES.has(status)) {
      this.clearMigrationStatusPoll();
      this.stopMigrationSaitoArrivalWatch();
    } else if (WAITING_FOR_ISSUANCE.has(status)) {
      void this.startMigrationSaitoArrivalWatch();
    }
    this.migration_page?.render();
  },

  receiveMigrationInstructions(data) {
    if (!data?.address || !data?.id) {
      return;
    }
    this.stopMigrationSaitoArrivalWatch();
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
      if (WAITING_FOR_ISSUANCE.has(String(this.migration_instructions.status || ''))) {
        void this.startMigrationSaitoArrivalWatch();
      }
    }
  }
};
