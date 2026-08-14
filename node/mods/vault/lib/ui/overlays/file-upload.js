const ScriptingKeyOverlay = require('./scripting.js');
const FileUploadTemplate = require('./file-upload.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SaitoNFT = require('./../../../../../lib/saito/ui/saito-nft/saito-nft');
const {
  createVaultAddFileTransaction
} = require('../../transactions/add-file');

const DEFAULT_COPY =
  'A standard Access Key provides access to the owner of the NFT. Transfer the NFT and ownership of the file transfers with it.';

class FileUpload {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.scripting_overlay = new ScriptingKeyOverlay(this.app, this.mod);
    this.nft_id = '';
    this.busy = false;
    this.onComplete = null;
    this.onError = null;
    this.library_mode = false;
  }

  async render(opts = {}) {
    if (!(await this.ensureBalance())) {
      return;
    }

    const isMobile =
      this.app.browser.isMobileBrowser() ||
      (typeof window !== 'undefined' && window.innerWidth <= 768);

    this.busy = false;
    this.onComplete = typeof opts.onComplete === 'function' ? opts.onComplete : null;
    this.onError = typeof opts.onError === 'function' ? opts.onError : null;
    this.library_mode = !!opts.library_mode || !!this.onComplete;
    this._completed = false;

    if (opts.file) {
      this.mod.file = opts.file;
    }
    if (opts.filename) {
      this.mod.filename = opts.filename;
    }

    this.overlay.show(FileUploadTemplate(this.app, this.mod, isMobile), () => {
      // User closed the overlay without a successful library handoff.
      if (this.library_mode && !this._completed && typeof this.onError === 'function') {
        try {
          this.onError(new Error('Vault upload cancelled'));
        } catch (err) {}
      }
    });

    //
    // Prefill path (e.g. N-WASM library): skip file picker and open key step.
    //
    if (opts.prefilled && this.mod.file) {
      this.attachEvents(false);
      this.showKeyStep();
      return;
    }

    this.attachEvents(isMobile);
  }

  root() {
    return document.querySelector('.vault-upload-overlay');
  }

  async wait_for_paint() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  setKeyStepState(mode = 'idle', message = '') {
    const root = this.root();
    if (!root) {
      return;
    }

    const keyStep = root.querySelector('.key-step');
    if (!keyStep) {
      return;
    }

    this.busy = mode === 'busy';
    keyStep.classList.toggle('is-uploading', mode === 'busy');
    keyStep.classList.toggle('is-success', mode === 'success');
    keyStep.classList.toggle('is-error', mode === 'error');

    const confirm = keyStep.querySelector('[data-action="confirm-key"]');
    const toggle = keyStep.querySelector('[data-action="toggle-mode"]');
    if (confirm) {
      confirm.disabled = mode === 'busy' || mode === 'success';
    }
    if (toggle) {
      toggle.setAttribute('aria-disabled', mode === 'busy' || mode === 'success' ? 'true' : 'false');
      toggle.style.pointerEvents = mode === 'busy' || mode === 'success' ? 'none' : '';
    }

    const state = keyStep.querySelector('.upload-state');
    const status = keyStep.querySelector('.upload-state .status');
    if (state) {
      state.hidden = mode === 'idle';
    }
    if (status && message) {
      status.textContent = message;
    }
  }

  showKeyStep() {
    const root = this.root();
    if (!root) {
      return;
    }

    const keyStep = root.querySelector('.key-step');
    const uploadStep = root.querySelector('.saito-file-drop-zone-wrap');
    if (keyStep) {
      keyStep.style.display = 'flex';
      this.setKeyStepState('idle');
    }
    if (uploadStep) {
      uploadStep.style.display = 'none';
    }

    this.applyMode();
  }

  applyMode() {
    const root = this.root();
    if (!root) {
      return;
    }

    const title = root.querySelector('.saito-overlay-form-header .saito-overlay-form-header-title');
    if (title) {
      title.textContent = 'STANDARD KEY';
    }

    const copy = root.querySelector('[data-key-copy]');
    if (copy) {
      copy.textContent = DEFAULT_COPY;
    }

    const artwork = root.querySelector('.key-artwork');
    if (artwork) {
      artwork.classList.add('jade');
      artwork.classList.remove('crystal');
    }
  }

  async ensureBalance() {
    const wallet_balance = await this.app.wallet.getBalance('SAITO');
    if (wallet_balance === 0n) {
      siteMessage('Insufficient SAITO to Create Vault NFTs...', 3000);
      this.app.connection.emit('saito-purchase-launch');
      return false;
    }
    return true;
  }

  showStandardKeyStep() {
    this.overlay.show(FileUploadTemplate(this.app, this.mod, false));
    this.attachEvents(false);
    this.showKeyStep();
  }

  openScriptingFlow() {
    this.overlay.hide();
    this.scripting_overlay.render();
    this.scripting_overlay.onReturnToDefault = () => {
      this.showStandardKeyStep();
    };
    this.scripting_overlay.callback = async (obj) => {
      if (!obj?.access_script) {
        return;
      }
      // Re-show key step busy state for the custom-key mint path.
      this.showStandardKeyStep();
      this.setKeyStepState('busy', 'Creating access key…');
      await this.wait_for_paint();
      try {
        await this.mintNFT(obj.access_script, obj.nft_type || 'vault-nft-key');
      } catch (err) {
        console.error('Vault advanced CREATE KEY error:', err);
        this.setKeyStepState(
          'error',
          err?.message || 'Unable to create Vault key. Please try again.'
        );
      }
    };
  }

  attachEvents(openFilePicker = false) {
    const root = this.root();
    if (!root) {
      return;
    }

    const keyStep = root.querySelector('.key-step');
    const uploadStep = root.querySelector('.saito-file-drop-zone-wrap');
    if (keyStep) {
      keyStep.style.display = 'none';
    }
    if (uploadStep) {
      uploadStep.style.display = 'flex';
    }

    this.app.browser.addDragAndDropFileUploadToElement(
      'vault-file-upload',
      async (file, confirm = false, fileobj = null) => {
        try {
          if (!file && fileobj) {
            if (fileobj.size > this.app.browser.MAX_FILE_SIZE) {
              salert(`File size exceeds browser limit. Please choose a smaller file.`);
            } else {
              salert(
                `Failed to read file. File may be too large (${(fileobj.size / 1024 / 1024).toFixed(2)} MB). Try a smaller file.`
              );
            }
            return;
          }

          if (fileobj && fileobj.size > this.app.browser.MAX_FILE_SIZE) {
            salert(`File size exceeds browser limit. Please choose a smaller file.`);
            return;
          }

          if (!file || !fileobj) {
            salert('Invalid file. Please try again.');
            return;
          }

          this.mod.file = file;
          this.mod.filename = fileobj.name;
          this.showKeyStep();
        } catch (err) {
          console.error('Vault file upload error:', err);
          salert('Error processing file. Please try again.');
        }
      },
      true
    );

    if (openFilePicker) {
      document.querySelector('#hidden_file_element_vault-file-upload')?.click();
    }

    root.querySelector('[data-action="toggle-mode"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.busy) {
        return;
      }
      this.openScriptingFlow();
    });

    root.querySelector('[data-action="confirm-key"]')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (this.busy) {
        return;
      }

      if (!(await this.ensureBalance())) {
        return;
      }

      // Immediate feedback before any mint/sign/upload work.
      this.setKeyStepState('busy', 'Creating access key…');
      await this.wait_for_paint();

      try {
        await this.mintNFT();
      } catch (err) {
        console.error('Vault CREATE KEY error:', err);
        // Stay on this overlay with a recoverable error — do not fail the
        // library promise yet so the user can retry CREATE KEY.
        this.setKeyStepState(
          'error',
          err?.message || 'Unable to create Vault key. Please try again.'
        );
      }
    });
  }

  async mintNFT(access_script = null, nft_type = 'vault-nft-key') {
    if (!this.mod.file) {
      throw new Error('Please upload a file before creating an NFT.');
    }

    const depositAmt = BigInt(this.app.wallet.convertSaitoToNolan(1));
    const balance = await this.app.wallet.getBalance();
    if (balance < depositAmt) {
      throw new Error('Insufficient funds to mint NFT');
    }

    this.setKeyStepState('busy', 'Minting Vault key…');
    await this.wait_for_paint();

    const txmsg = {
      module: 'Vault',
      request: 'mint-vault-key',
      data: {
        link: 'https://saito.io/vault',
        filename: this.mod.filename,
        file_id: ''
      }
    };

    const nft_tx = await this.app.wallet.createMintNFTTransaction(
      BigInt(1),
      depositAmt,
      txmsg,
      BigInt(0n),
      this.app.wallet.publicKey,
      nft_type
    );

    const nft_obj = new SaitoNFT(this.app, this.mod, nft_tx);
    this.nft_id = nft_obj.id;
    if (!this.nft_id) {
      throw new Error('Unable to compute NFT ID for minted NFT');
    }

    this.setKeyStepState('busy', 'Binding access key to file…');
    await this.wait_for_paint();

    const file_tx = await createVaultAddFileTransaction(
      this.app,
      this.mod,
      this.nft_id,
      access_script
    );
    if (!file_tx) {
      throw new Error('Error creating Vault file transaction');
    }

    // Hydrate msg from on-chain data before patching — nft_tx.msg defaults to {}
    // and sign()/packData() would otherwise overwrite data without link/module/etc.
    const msg = nft_tx.returnMessage() || {};
    if (!msg.data || typeof msg.data !== 'object') {
      msg.data = {};
    }
    msg.data.file_id = file_tx.signature;
    msg.data.filename = this.mod.filename;
    if (access_script != null) {
      msg.data.file_access_script = access_script;
    }
    nft_tx.msg = msg;

    this.setKeyStepState('busy', 'Signing and broadcasting…');
    await this.wait_for_paint();

    await nft_tx.sign();
    await this.app.network.propagateTransaction(nft_tx);

    // Keep a local copy so N-WASM / Vault can resolve metadata by tx signature.
    try {
      await this.app.storage.saveTransaction(nft_tx, { field1: 'Vault' }, 'localhost');
    } catch (err) {
      console.warn('Vault: unable to persist mint tx locally:', err);
    }

    if (!this.mod.peer) {
      throw new Error('ERROR: issue connecting to server. Please try again later.');
    }

    this.setKeyStepState('busy', 'Uploading file to Vault…');
    await this.wait_for_paint();

    await new Promise((resolve, reject) => {
      try {
        this.app.network.sendRequestAsTransaction(
          'vault add file',
          file_tx.serialize_to_web(this.app),
          (res) => {
            if (res?.err) {
              reject(res.err instanceof Error ? res.err : new Error(String(res.err)));
              return;
            }
            resolve(res);
          },
          this.mod.peer?.publicKey
        );
      } catch (err) {
        reject(err);
      }
    });

    //
    // Do not cache Access Key metadata here. Mint-time slip/utxo keys are not
    // authoritative until the mint tx is confirmed and visible in wallet.nfts.
    // Cache happens in cacheConfirmedAccessKey() after the transaction monitor.
    //

    this.setKeyStepState('success', 'Upload complete. Waiting for network confirmation…');
    await this.wait_for_paint();
    siteMessage('File Upload Successful..', 3000);

    if (!this.mod.transaction_monitor) {
      throw new Error('Vault: transaction_monitor is not initialized');
    }

    //
    // Library mode: wait for mint confirmation, cache confirmed metadata, then
    // hand control back so N-WASM can refresh its library. Standalone Vault
    // keeps the My NFTs path after the same confirmed cache write.
    //
    if (this.library_mode) {
      await new Promise((resolve) => {
        this.mod.transaction_monitor.render({
          tx: nft_tx,
          title: 'Upload complete',
          lead: 'Your Vault Key has been broadcast to the Saito network.',
          subtitle: 'This page will update automatically when your Vault Key is confirmed.',
          successTitle: 'Vault Key Received',
          successLead: 'Your Vault Key has arrived. Returning to your library…',
          successActionLabel: 'Continue',
          auto_continue_on_confirm: true,
          callback: (result) => {
            this.busy = false;
            if (result?.status === 'confirmed') {
              this._completed = true;
              this.overlay.hide();
              this.cacheConfirmedAccessKey(nft_tx, file_tx, access_script, result)
                .then((meta) => {
                  if (typeof this.onComplete === 'function') {
                    try {
                      this.onComplete({
                        status: 'confirmed',
                        nft_tx,
                        nft_id: meta?.nft_id || this.nft_id,
                        file_id: meta?.file_id || file_tx.signature,
                        filename: meta?.filename || this.mod.filename
                      });
                    } catch (err) {
                      console.error('Vault onComplete error:', err);
                    }
                  }
                  resolve(result);
                })
                .catch((err) => {
                  console.error('Vault confirmed Access Key cache error:', err);
                  if (typeof this.onError === 'function') {
                    try {
                      this.onError(
                        err instanceof Error ? err : new Error(String(err || 'Vault cache failed'))
                      );
                    } catch (e) {}
                  }
                  resolve(result);
                });
              return;
            }

            // User dismissed the monitor before confirmation — treat as cancel.
            this._completed = true;
            this.overlay.hide();
            if (typeof this.onError === 'function') {
              try {
                this.onError(new Error('Vault upload cancelled before confirmation'));
              } catch (err) {}
            }
            resolve(result);
          }
        });
      });
      return;
    }

    this.overlay.hide();
    this.busy = false;

    this.mod.transaction_monitor.render({
      tx: nft_tx,
      title: 'Upload complete',
      lead: 'Your Vault Key has been broadcast to the Saito network.',
      subtitle: 'This page will update automatically when your Vault Key is confirmed.',
      successTitle: 'Vault Key Received',
      successLead:
        'Your Vault Key has arrived. Press Continue to open My NFTs and retrieve your new Access Key.',
      successActionLabel: 'Continue',
      callback: (result) => {
        if (result?.status === 'confirmed') {
          this.cacheConfirmedAccessKey(nft_tx, file_tx, access_script, result)
            .catch((err) => {
              console.warn('Vault: confirmed Access Key cache failed:', err);
            })
            .finally(() => {
              this.app.connection.emit('vault-file-access-render');
            });
        }
      }
    });
  }

  //
  // After mint confirmation: refresh wallet NFT slips and write/replace the
  // single Vault NFT→file cache entry used by Vault download and N-WASM.
  //
  /**
   * After mint confirmation, collect Access Key fields from the mint tx +
   * wallet slips for onComplete / My NFTs. Does not write a cross-module cache.
   */
  async cacheConfirmedAccessKey(nft_tx, file_tx, access_script = null, confirmed = null) {
    const tx = confirmed?.tx || nft_tx;
    let msg = {};
    try {
      msg = tx?.returnMessage?.() || nft_tx?.returnMessage?.() || nft_tx?.msg || {};
    } catch (err) {
      msg = nft_tx?.msg || {};
    }
    const data = msg?.data && typeof msg.data === 'object' ? msg.data : {};

    try {
      await this.app.wallet.updateNFTList();
    } catch (err) {
      console.warn('Vault: updateNFTList after Access Key confirmation failed:', err);
    }

    const tx_sig = nft_tx?.signature || tx?.signature || '';
    const nft_id = this.nft_id || '';
    const nfts = this.app.options?.wallet?.nfts || [];
    const nft_entry =
      nfts.find((n) => (nft_id && n.id === nft_id) || (tx_sig && n.tx_sig === tx_sig)) || null;

    let slip1_utxokey = nft_entry?.slip1?.utxo_key || '';
    let slip2_utxokey = nft_entry?.slip2?.utxo_key || '';
    let slip3_utxokey = nft_entry?.slip3?.utxo_key || '';

    // Wallet list is preferred; fall back to slips on the confirmed mint tx.
    if (!slip1_utxokey || !slip2_utxokey || !slip3_utxokey) {
      try {
        const nft = new SaitoNFT(this.app, this.mod, tx || nft_tx, nft_entry);
        slip1_utxokey = slip1_utxokey || nft.slip1?.utxo_key || '';
        slip2_utxokey = slip2_utxokey || nft.slip2?.utxo_key || '';
        slip3_utxokey = slip3_utxokey || nft.slip3?.utxo_key || '';
        if (!this.nft_id && nft.id) {
          this.nft_id = nft.id;
        }
      } catch (err) {
        console.warn('Vault: unable to derive slips from confirmed mint tx:', err);
      }
    }

    const file_id = data.file_id || file_tx?.signature || '';
    if (!file_id) {
      throw new Error('Confirmed Vault Access Key is missing file_id');
    }

    return {
      nft_id: this.nft_id || nft_entry?.id || tx_sig,
      tx_sig,
      file_id,
      filename: data.filename || this.mod.filename || '',
      link: data.link || 'https://saito.io/vault',
      slip1_utxokey,
      slip2_utxokey,
      slip3_utxokey,
      file_access_script: data.file_access_script || access_script || null
    };
  }
}

module.exports = FileUpload;
