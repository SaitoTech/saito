const saito = require('../../lib/saito/saito');
const Transaction = require('../../lib/saito/transaction').default;
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoPhotoUploader = require('../../lib/saito/ui/saito-photo-uploader/saito-photo-uploader');
const UpdateDescription = require('./lib/ui/update-description');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const SaitoProfile = require('../../lib/saito/ui/saito-profile/saito-profile');
const pageHome = require('./index');

// Keychain profile-index keys that are metadata, not archived tx signatures.
const PROFILE_INDEX_META_KEYS = new Set(['tx_sig', 'archive_nodes', 'archive']);

class Profile extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = 'Profile';
    this.slug = 'profile';
    this.description = 'Profile Module';
    this.archive_public_key;

    // publicKey → complete profile object (authoritative local snapshot)
    this.cache = {};
    // publicKey → true once we have attempted a full load into cache
    this.profile_ready = {};
    // publicKey → in-flight ensureProfileLoaded promise
    this.profile_loading = {};
    this.enable_profile_edits = true;

    this.social = this.buildSocial({
      twitter: '@SaitoOfficial',
      title: '🟥 Saito User - Web3 Social Media',
      url: '/redsquare#profile',
      description: 'Peer to peer Web3 social media platform',
      image: 'https://saito.tech/wp-content/uploads/2022/04/saito_card.png' //square image with "Saito" below logo
    });

    app.connection.on('profile-fetch-content-and-update-dom', async (key) => {
      console.info('profile-fetch-content-and-update-dom --- ' + key);

      const profile = await this.ensureProfileLoaded(key);
      this.app.connection.emit('profile-update-dom', key, profile);
    });

    app.connection.on('profile-edit-banner', (profile_key) => {
      this.photoUploader = new SaitoPhotoUploader(this.app, this.mod, 'banner');
      this.photoUploader.callbackAfterUpload = async (photo) => {
        let banner = await this.app.browser.resizeImg(photo);
        this.sendProfileTransaction({ banner }, profile_key);
      };
      this.photoUploader.render(this.photo);
    });

    app.connection.on('profile-edit-description', (key) => {
      const elementId = `profile-description-${key}`;
      const element = document.querySelector(`#${elementId}`);
      this.updateDescription = new UpdateDescription(this.app, this, key);
      this.updateDescription.render(element ? element.textContent : '');
    });
  }

  async onConfirmation(blk, tx, conf) {
    let txmsg = tx.returnMessage();
    if (Number(conf) == 0) {
      if (txmsg.request === 'update profile') {
        if (this.app.BROWSER) {
          console.debug('Profile onConfirmation');
        }
        await this.receiveProfileTransaction(tx);
      }
    }
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (!app.BROWSER) {
      return;
    }

    if (service.service === 'archive') {
      let keys_to_check = app.keychain.returnKeys({ watched: true, profile: undefined });

      console.debug('PROFILE -- check friends keys in Archive!');

      for (let key of keys_to_check) {
        // Save an empty profile index so we don't keep querying on every page load.
        // Live updates still arrive via onConfirmation once we are watching them.
        app.keychain.addKey(key.publicKey, { profile: {} });

        const txs = await this.loadProfileTransactions(key.publicKey, peer);
        const profile = this.buildProfileFromTransactions(txs);
        this.setCachedProfile(key.publicKey, profile);

        const authoritative = this.selectAuthoritativeTransaction(txs);
        if (authoritative) {
          await this.receiveProfileTransaction(authoritative);
        } else if (txs.length > 0) {
          // Legacy incremental history: persist newest tx per field until a snapshot exists
          const newestFirst = this.sortProfileTransactionsNewestFirst(txs);
          const txs_found = {};
          for (let i = newestFirst.length - 1; i >= 0; i--) {
            const txmsg = newestFirst[i].returnMessage();
            for (const field in txmsg?.data || {}) {
              txs_found[field] = newestFirst[i];
            }
          }
          for (const field in txs_found) {
            await this.receiveProfileTransaction(txs_found[field]);
          }
        }
      }
    }
  }

  async render() {
    // Check for URL param (since that is the prime use case)
    let param = this.app.browser.returnURLParameter('load_key');
    if (param) {
      let key = JSON.parse(this.app.crypto.base64ToString(param));

      if (key.publicKey !== this.publicKey) {
        let result = await this.app.wallet.onUpgrade('import', key.privateKey);
        if (result) {
          let c = await sconfirm(`Import key ${this.app.keychain.returnUsername(key.publicKey)}?`);
          if (c) {
            reloadWindow(300);
          }
          return;
        }
      }
    }

    this.main = new SaitoProfile(this.app, this);
    this.header = new SaitoHeader(this.app, this);

    await this.header.initialize(this.app);

    this.main.reset(this.publicKey);

    this.addComponent(this.main);
    this.addComponent(this.header);

    await super.render(this.app, this);
  }

  /**
   * Return the cached complete profile for a public key (may be empty).
   * Own wallet profile is sourced from app.options.profile when cache is cold.
   */
  returnProfile(publicKey = '') {
    const key = publicKey || this.publicKey;
    if (key === this.publicKey) {
      this.ensureOwnProfileCached();
    }
    return Object.assign({}, this.cache[key] || {});
  }

  /**
   * Seed cache for the local wallet from app.options.profile (no network I/O).
   */
  ensureOwnProfileCached() {
    if (!this.publicKey) {
      return {};
    }
    if (this.profile_ready[this.publicKey] && this.cache[this.publicKey]) {
      return this.cache[this.publicKey];
    }
    const saved =
      this.app.options?.profile && typeof this.app.options.profile === 'object'
        ? this.app.options.profile
        : {};
    return this.setCachedProfile(this.publicKey, saved);
  }

  /**
   * Persist the local wallet's complete profile into app.options.
   */
  saveOwnProfileOptions(profile = {}) {
    if (!this.app.BROWSER) {
      return;
    }
    this.app.options.profile = Object.assign({}, profile || {});
    this.app.storage.saveOptions();
  }

  /**
   * Apply a partial update to the local profile object.
   * Pass null/undefined for a field to remove it (supports field deletion).
   *
   * @param {string} publicKey
   * @param {Object} data partial field updates
   * @returns {Object} complete profile after update
   */
  applyLocalProfileUpdate(publicKey, data = {}) {
    if (publicKey === this.publicKey) {
      this.ensureOwnProfileCached();
    } else if (!this.cache[publicKey]) {
      this.cache[publicKey] = {};
    }

    for (const field of Object.keys(data)) {
      const value = data[field];
      if (value === null || typeof value === 'undefined') {
        delete this.cache[publicKey][field];
      } else {
        this.cache[publicKey][field] = value;
      }
    }

    this.profile_ready[publicKey] = true;

    if (publicKey === this.publicKey) {
      this.saveOwnProfileOptions(this.cache[publicKey]);
    }

    return this.cache[publicKey];
  }

  setCachedProfile(publicKey, profile = {}) {
    this.cache[publicKey] = Object.assign({}, profile || {});
    this.profile_ready[publicKey] = true;
    if (publicKey === this.publicKey && this.app.BROWSER) {
      this.saveOwnProfileOptions(this.cache[publicKey]);
    }
    return this.cache[publicKey];
  }

  /**
   * Load a profile into cache when the UI asks for it.
   * Own wallet uses app.options only — never blocks on network during init/send.
   */
  async ensureProfileLoaded(publicKey) {
    if (!publicKey) {
      return {};
    }

    if (publicKey === this.publicKey) {
      return this.ensureOwnProfileCached();
    }

    if (this.profile_ready[publicKey]) {
      if (!this.cache[publicKey]) {
        this.cache[publicKey] = {};
      }
      return this.cache[publicKey];
    }

    if (!this.app.BROWSER) {
      return this.setCachedProfile(publicKey, {});
    }

    if (this.profile_loading[publicKey]) {
      return this.profile_loading[publicKey];
    }

    this.profile_loading[publicKey] = (async () => {
      let profile = null;

      if (this.app.keychain.isWatched(publicKey)) {
        const returned_key = this.app.keychain.returnKey(publicKey);
        if (returned_key?.profile) {
          profile = await this.fetchProfileFromArchive(returned_key);
        }
      }

      if (profile === null) {
        const txs = await this.loadProfileTransactions(publicKey, null);
        profile = this.buildProfileFromTransactions(txs);
      }

      return this.setCachedProfile(publicKey, profile || {});
    })();

    try {
      return await this.profile_loading[publicKey];
    } finally {
      delete this.profile_loading[publicKey];
    }
  }

  loadProfileTransactions(publicKey, peer = null) {
    return new Promise((resolve) => {
      this.app.storage.loadTransactions(
        // limit 100: enough legacy incremental history for migration;
        // snapshot-era profiles only need the newest tx.
        { field1: 'Profile', field2: publicKey, limit: 100 },
        (txs) => resolve(txs || []),
        peer
      );
    });
  }

  /**
   * Reconstruct profile content from archived txs.
   *
   * New snapshot txs (msg.snapshot) are authoritative — newest wins.
   * Legacy incremental txs are merged oldest → newest for migration.
   */
  buildProfileFromTransactions(txs = []) {
    if (!txs?.length) {
      return {};
    }

    const newestFirst = this.sortProfileTransactionsNewestFirst(txs);

    for (let i = 0; i < newestFirst.length; i++) {
      const txmsg = newestFirst[i].returnMessage();
      if (this.isSnapshotMessage(txmsg)) {
        return Object.assign({}, txmsg.data || {});
      }
    }

    // Legacy incremental history: merge oldest → newest
    const data = {};
    for (let i = newestFirst.length - 1; i >= 0; i--) {
      const txmsg = newestFirst[i].returnMessage();
      if (txmsg?.data) {
        Object.assign(data, txmsg.data);
      }
    }
    return data;
  }

  /**
   * Newest snapshot tx if any; otherwise null (legacy-only history).
   */
  selectAuthoritativeTransaction(txs = []) {
    if (!txs?.length) {
      return null;
    }

    const newestFirst = this.sortProfileTransactionsNewestFirst(txs);
    for (let i = 0; i < newestFirst.length; i++) {
      const txmsg = newestFirst[i].returnMessage();
      if (this.isSnapshotMessage(txmsg)) {
        return newestFirst[i];
      }
    }
    return null;
  }

  isSnapshotMessage(txmsg) {
    return Boolean(txmsg && (txmsg.snapshot === 1 || txmsg.snapshot === true));
  }

  sortProfileTransactionsNewestFirst(txs = []) {
    return txs.slice().sort((a, b) => {
      const ta = Number(a?.timestamp) || 0;
      const tb = Number(b?.timestamp) || 0;
      return tb - ta;
    });
  }

  /**
   * Update profile fields and broadcast a complete snapshot transaction.
   *
   * Callers may pass a partial update (e.g. `{ description }`). The module
   * merges that into the local complete profile, then serializes the full
   * object. Pass `null`/`undefined` for a field to remove it.
   *
   * @param {Object} data partial update { image, banner, description, archive, ... }
   **/
  async sendProfileTransaction(data = {}) {
    // Own profile is local state (app.options.profile) — do not await network I/O.
    const snapshot = Object.assign({}, this.applyLocalProfileUpdate(this.publicKey, data));

    this.app.connection.emit('saito-header-update-message', { msg: 'broadcasting profile update' });

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);
    newtx.msg = {
      module: this.name,
      request: 'update profile',
      snapshot: 1,
      data: snapshot
    };

    await newtx.sign();

    this.app.connection.emit('profile-update-dom', this.publicKey, snapshot);

    await this.app.network.propagateTransaction(newtx);
  }

  /**
   * Optional capability for other modules (e.g. Store) to update own Profile
   * without importing this module. Blank/null field values remove the field.
   */
  respondTo(type = '', obj = null) {
    if (type === 'profile-update') {
      return {
        get: (publicKey = '') => this.returnProfile(publicKey || this.publicKey),
        update: async (data = {}) => this.applyProfileUpdateRequest(data)
      };
    }
    return null;
  }

  /**
   * Merge a partial profile update and broadcast only when something changes.
   * Empty string / null / undefined for a field removes it from the snapshot.
   */
  async applyProfileUpdateRequest(data = {}) {
    if (!data || typeof data !== 'object') {
      return this.returnProfile(this.publicKey);
    }

    const patch = {};
    let has_keys = false;
    for (const [key, value] of Object.entries(data)) {
      has_keys = true;
      const blank = value == null || String(value).trim() === '';
      patch[key] = blank ? null : String(value).trim();
    }
    if (!has_keys) {
      return this.returnProfile(this.publicKey);
    }

    const current = this.returnProfile(this.publicKey);
    let changed = false;
    for (const [key, next] of Object.entries(patch)) {
      const cur_raw = current[key];
      const cur =
        cur_raw == null || String(cur_raw).trim() === '' ? null : String(cur_raw).trim();
      if (cur !== next) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return current;
    }

    await this.sendProfileTransaction(patch);
    return this.returnProfile(this.publicKey);
  }

  /**
   * Processes a received transaction to update a user's profile.
   *
   * Snapshot txs replace the cached profile entirely.
   * Legacy incremental txs merge into cache (migration / in-flight old peers).
   *
   * @param {Object} tx - The transaction object received, containing data to be processed.
   **/
  async receiveProfileTransaction(tx) {
    let from = tx?.from[0]?.publicKey;

    if (!from) {
      console.error('Profile: Invalid TX');
      return;
    }

    let txmsg = tx.returnMessage();
    const incoming = txmsg?.data && typeof txmsg.data === 'object' ? txmsg.data : {};

    if (this.isSnapshotMessage(txmsg)) {
      this.setCachedProfile(from, incoming);
    } else {
      // Legacy incremental update — merge until that user publishes a snapshot
      if (from === this.publicKey) {
        this.ensureOwnProfileCached();
      } else if (!this.cache[from]) {
        this.cache[from] = {};
      }
      Object.assign(this.cache[from], incoming);
      this.profile_ready[from] = true;
      if (from === this.publicKey) {
        this.saveOwnProfileOptions(this.cache[from]);
      }
    }

    if (this.app.BROWSER && this.app.keychain.isWatched(from)) {
      console.info(`PROFILE UPDATE for ${this.app.keychain.returnUsername(from)}: `, incoming);

      const returned_key = this.app.keychain.returnKey(from);
      const previous_index = Object.assign({}, returned_key?.profile || {});

      if (this.isSnapshotMessage(txmsg)) {
        // Snapshot replaces all prior local Profile txs for this key
        await this.deleteIndexedProfileTransactions(previous_index);

        const profile_index = { tx_sig: tx.signature };
        if (previous_index.archive_nodes) {
          profile_index.archive_nodes = previous_index.archive_nodes;
        }

        this.app.keychain.addKey(from, { profile: profile_index });
      } else {
        // Legacy incremental: only replace archived txs for fields in this update
        for (const field of Object.keys(incoming)) {
          const prior = previous_index[field];
          if (typeof prior === 'string' && prior) {
            await this.app.storage.deleteTransaction(prior, '', 'localhost');
          }
        }

        const profile_index = Object.assign({}, previous_index);
        for (const field of Object.keys(incoming)) {
          if (field === 'archive') {
            profile_index[field] = incoming[field];
          } else {
            profile_index[field] = tx.signature;
          }
        }
        delete profile_index.tx_sig;

        this.app.keychain.addKey(from, { profile: profile_index });
      }

      await this.saveProfileTransaction(tx);
    } else if (!this.app.BROWSER) {
      await this.saveProfileTransaction(tx);
    }

    if (tx.isFrom(this.publicKey)) {
      this.app.connection.emit('saito-header-update-message', { msg: '' });
      siteMessage('Profile updated', 2000);
    }

    if (this.app.keychain.isWatched(from)) {
      this.app.connection.emit('profile-update-dom', from, this.cache[from]);
    }
  }

  /**
   * Load profile content for a watched key from the local archive.
   * Uses newest snapshot when present; otherwise merges legacy incremental txs.
   */
  async fetchProfileFromArchive(key) {
    console.info('PROFILE: Fetching local profile for: ', key);
    return this.app.storage.loadTransactions(
      { field2: key.publicKey, field1: 'Profile', limit: 100 },
      (txs) => this.buildProfileFromTransactions(txs),
      'localhost'
    );
  }

  /**
   * Delete previously indexed local Profile txs (snapshot and/or legacy per-field).
   */
  async deleteIndexedProfileTransactions(profile_index = {}) {
    const sigs = new Set();

    if (profile_index.tx_sig && typeof profile_index.tx_sig === 'string') {
      sigs.add(profile_index.tx_sig);
    }

    for (const field of Object.keys(profile_index)) {
      if (PROFILE_INDEX_META_KEYS.has(field)) {
        continue;
      }
      const value = profile_index[field];
      if (typeof value === 'string' && value) {
        sigs.add(value);
      }
    }

    for (const sig of sigs) {
      await this.app.storage.deleteTransaction(sig, '', 'localhost');
    }
  }

  async saveProfileTransaction(tx) {
    await this.app.storage.saveTransaction(tx, { field1: 'Profile', preserve: 1 }, 'localhost');
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let mod_self = this;

    expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

      let updatedSocial = Object.assign({}, mod_self.social);

      updatedSocial.url = reqBaseURL + encodeURI(mod_self.returnSlug());

      let html = pageHome(app, mod_self, app.build_number, updatedSocial);
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    });

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }
}

module.exports = Profile;
