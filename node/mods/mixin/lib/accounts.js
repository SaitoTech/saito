class Accounts {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  getCredentials() {
    return this.app?.options?.mixin || {};
  }

  saveCredentials(credentials) {
    const apiKey = this.app.options?.mixin?.api_key;
    const depositAddresses = this.app.options?.mixin?.deposit_addresses;
    const next = credentials && typeof credentials === 'object' ? { ...credentials } : {};
    delete next.api_key;
    delete next.deposit_addresses;
    if (apiKey && typeof apiKey === 'object' && !Array.isArray(apiKey)) {
      next.api_key = apiKey;
    }
    if (Array.isArray(depositAddresses)) {
      next.deposit_addresses = depositAddresses;
    }
    this.app.options.mixin = next;
    this.app.storage.saveOptions();
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
    if (options?.additional !== true) {
      const existing = await this.mod.database.getCredentials(publicKey);
      if (existing.length) {
        return { ciphertext: existing[0].ciphertext, restored: true, user_id: existing[0].user_id };
      }
    }

    const credentials = await this.mod.api.createAccount(`Saito User ${publicKey}`);
    const ciphertext = this.encryptCredentials(credentials, publicKey);
    await this.mod.database.saveCredentials(publicKey, ciphertext, credentials.user_id);
    return { ciphertext, restored: false, user_id: credentials.user_id };
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
        function (res) {
          console.log('Callback for mixin save new deposit address: ', res);
        },
        this.mod.mixin_peer?.publicKey
      );
    }

    return address;
  }
}

module.exports = Accounts;
