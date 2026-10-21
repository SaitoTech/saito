class Accounts {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  getCredentials() {
    return this.app?.options?.mixin || {};
  }

  saveCredentials(credentials) {
    this.app.options.mixin = credentials;
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

  async createAccount(publicKey) {
    const existing = await this.mod.database.getCredentials(publicKey);
    if (existing) {
      return { ciphertext: existing, restored: true };
    }

    const credentials = await this.mod.api.createAccount(`Saito User ${publicKey}`);
    const ciphertext = this.encryptCredentials(credentials, publicKey);
    await this.mod.database.saveCredentials(publicKey, ciphertext);
    return { ciphertext, restored: false };
  }

  async createAddress(assetId, chainId) {
    const credentials = this.getCredentials();
    const address = await this.mod.api.createAddress(credentials, chainId);
    if (!address) {
      return false;
    }

    await this.mod.database.insertAddress({
      mixinUserId: credentials.user_id,
      publicKey: this.mod.publicKey,
      assetId,
      address,
      createdAt: Date.now()
    });

    if (this.app.BROWSER) {
      this.app.network.sendRequestAsTransaction(
        'mixin save new deposit address',
        {
          user_id: credentials.user_id,
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
