class Accounts {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.creation_requests = new Map();
    this.backup_request = null;
  }

  getCredentials() {
    return this.mod?.credentials && typeof this.mod.credentials === 'object'
      ? this.mod.credentials
      : {};
  }

  saveCredentials(credentials) {
    const next = credentials && typeof credentials === 'object' ? { ...credentials } : {};
    delete next.api_key;
    delete next.deposit_addresses;
    delete next.operation_mode;
    delete next.execution_mode;
    delete next.admin_choice;
    delete next.fulfillment_mode;
    delete next.payout_mode;
    delete next.treasury_provider_publickeys;
    delete next.treasury_delegate_publickeys;
    this.mod.credentials = next;
    this.mod.account_created = next.user_id && !next.setup ? 1 : 0;
    return this.mod.save();
  }

  areCredentialsDeprecated(credentials) {
    return typeof credentials?.pin_token_base64 !== 'undefined';
  }

  encryptCredentials(credentials, publicKey) {
    const buf = Buffer.from(JSON.stringify(credentials), 'utf8');
    return this.app.crypto.encryptWithPublicKey(buf, publicKey).toString('base64');
  }

  decryptCredentials(ciphertext, privateKey) {
    const decrypted = this.app.crypto.decryptWithPrivateKey(
      Buffer.from(ciphertext, 'base64'),
      privateKey
    );
    return JSON.parse(decrypted.toString('utf8'));
  }

  async createAccount(publicKey, options = {}) {
    if (options?.additional === true) {
      return this.createAndStoreAccount(publicKey, options);
    }
    if (this.creation_requests.has(publicKey)) {
      return this.creation_requests.get(publicKey);
    }
    const request = this.createAndStoreAccount(publicKey, options);
    this.creation_requests.set(publicKey, request);
    try {
      return await request;
    } finally {
      this.creation_requests.delete(publicKey);
    }
  }

  async createAndStoreAccount(publicKey, options) {
    if (options?.additional !== true) {
      const existing = await this.mod.database.getCredentials(publicKey);
      if (existing.length) {
        return { ciphertext: existing[0].ciphertext, restored: true, user_id: existing[0].user_id };
      }
    }

    const credentials = options.browserSetup
      ? await this.mod.api.createBareAccount(`Saito User ${publicKey}`)
      : await this.mod.api.createAccount(`Saito User ${publicKey}`);
    if (!credentials.setup) {
      credentials.backed_up = true;
    }
    const ciphertext = this.encryptCredentials(credentials, publicKey);
    await this.mod.database.saveCredentials(publicKey, ciphertext, credentials.user_id);
    return { ciphertext, restored: false, user_id: credentials.user_id };
  }

  async finishBrowserAccount(keys) {
    if (!this.app.BROWSER) {
      throw new Error('Mixin wallet setup may only run in the browser');
    }
    await this.saveCredentials(keys);
    const completed = await this.mod.api.finishAccountSetup(keys, pending => this.saveCredentials(pending));
    await this.saveCredentials(completed);
    return completed;
  }

  async backupCredentials(peerKey = this.mod.mixin_peer?.publicKey) {
    const keys = this.getCredentials();
    if (!this.app.BROWSER || !peerKey || !keys.user_id || keys.setup || keys.backed_up) {
      return false;
    }
    if (this.backup_request) {
      return this.backup_request;
    }
    const ciphertext = this.encryptCredentials({ ...keys, backed_up: true }, this.mod.publicKey);
    this.backup_request = new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result?.ok === true);
      };
      const timer = setTimeout(() => finish(null), 10000);
      try {
        Promise.resolve(this.app.network.sendRequestAsTransaction(
          'mixin account backup',
          { account_hash: ciphertext, user_id: keys.user_id },
          finish,
          peerKey
        )).catch(() => finish(null));
      } catch (err) {
        finish(null);
      }
    });
    try {
      const saved = await this.backup_request;
      if (saved && this.mod.credentials.user_id === keys.user_id && !this.mod.credentials.setup) {
        await this.saveCredentials({ ...this.mod.credentials, backed_up: true });
      } else if (!saved) {
        console.warn('Mixin encrypted account backup was not acknowledged; retained locally for retry.');
      }
      return saved;
    } finally {
      this.backup_request = null;
    }
  }

  async createAddress(assetId, chainId, credentials = null) {
    const selected = credentials || this.getCredentials();
    if (!selected?.user_id) {
      return false;
    }
    const address = await this.mod.api.createAddress(selected, chainId);
    if (!address) {
      return false;
    }

    await this.mod.database.insertAddress({
      mixinUserId: selected.user_id,
      publicKey: this.mod.publicKey,
      assetId,
      address,
      createdAt: Date.now()
    });
    if (!this.app.BROWSER && typeof this.mod.rememberDepositAddress === 'function') {
      const ticker = (this.mod.crypto_mods || []).find((item) => item.asset_id === assetId)?.ticker || '';
      this.mod.rememberDepositAddress({
        address,
        assetId,
        ticker,
        mixinUserId: selected.user_id
      });
    }

    if (this.app.BROWSER) {
      this.app.network.sendRequestAsTransaction(
        'mixin save new deposit address',
        {
          user_id: selected.user_id,
          asset_id: assetId,
          address,
          publickey: this.mod.publicKey
        },
        function () {},
        this.mod.mixin_peer?.publicKey
      );
    }

    return address;
  }
}

module.exports = Accounts;
