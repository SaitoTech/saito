const CreateNFTTemplate = require('./create-overlay.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class CreateNFT {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/saito/css-imports/ui/saito-nft.css');
    }
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.help_overlay = new SaitoOverlay(this.app, this.mod);
    this.enable_deposit = false;
    this.app.connection.on('saito-nft-create-render-request', (defaults = {}) => {
      this.render(defaults);
    });
  }

  render(defaults = {}) {

    this.defaults = defaults;
    this.reset();

    this.overlay.show(CreateNFTTemplate(this.app, this.mod, this), () => {
      if (typeof this.defaults.callback === 'function') {
        this.defaults.callback({ status: 'cancelled' });
      }
    });

    for (const nft_mod of this.app.modules.respondTo('saito-create-nft', this.mod)) {
      let obj = nft_mod.respondTo('saito-create-nft', this.mod);
      this.module_provided_nfts.push(obj);
    }

    const typeDropdown = document.querySelector('#create-nft-type-dropdown');

    for (let z = 0; z < this.module_provided_nfts.length; z++) {
      let obj = this.module_provided_nfts[z];
      if (obj.title) {
        const opt = document.createElement('option');
        opt.value = obj.class;
        opt.textContent = obj.title;
        typeDropdown.appendChild(opt);
      }
    }

    this.attachEvents();
    this.setDefaults();
  }

  setDefaults() {
    if (this.defaults?.type) {
      let dropdown = document.querySelector('#create-nft-type-dropdown');
      dropdown.value = this.defaults.type;
      dropdown.dispatchEvent(new Event('change', { bubbles: true }));

      if (this.defaults.locked?.includes('type')) {
        dropdown.disabled = true;
      }
    }

    if (this.defaults?.title) {
      let title = document.querySelector('.saito-nft-create .secondary input.title');
      title.value = this.defaults.title;
      if (this.defaults.locked?.includes('title')) {
        title.readOnly = true;
      }
    }

    if (this.defaults?.description) {
      let description = document.querySelector(
        '.saito-nft-create .secondary textarea.description'
      );
      description.value = this.defaults.description;
      if (this.defaults.locked?.includes('description')) {
        description.readOnly = true;
      }
    }

    if (this.defaults?.image) {
      this.image = this.defaults.image;
      this.addImage(this.defaults.image);
    }

    if (this.defaults?.quantity) {
      let amount = document.querySelector('#create-nft-amount');
      amount.value = String(this.defaults.quantity);
      if (this.defaults.locked?.includes('quantity')) {
        amount.readOnly = true;
      }
    }

    if (this.defaults?.deposit) {
      let deposit = document.querySelector('#create-nft-deposit');
      deposit.value = String(this.defaults.deposit);
      if (this.defaults.locked?.includes('deposit')) {
        deposit.readOnly = true;
      }
    }
  }

  async createObject() {

    let obj = {};
    this.nft_type = document.querySelector('#create-nft-type-dropdown').value;
    let processed = false;

    for (let z = 0; z < this.module_provided_nfts.length; z++) {
      try {
        let modobj = this.module_provided_nfts[z];
        if (modobj.class.includes(this.nft_type)) {
          if (modobj.createData) {
            obj = await modobj.createData(this.file);
            processed = true;
          } else {
            obj.text = text;
            processed = true;
          }
        }
      } catch (err) {
        console.log('Error with Custom NFT Type: ' + JSON.stringify(err));
      }
    }

    if (this.nft_type === 'text' && processed == false) {
      let text = document.querySelector('#create-nft-textarea').value;
      try {
        obj.text = text;
      } catch (e) {
        salert('Provide parseable TEXT to create NFT');
        return false;
      }
      processed = true;
    }

    if (this.nft_type === 'token' && processed == false) {
      if (this.image) {
        obj.image = this.image;
      }
      processed = true;
    }

    if (this.nft_type === 'json' && processed == false) {
      let text = document.querySelector('#create-nft-textarea').value;
      try {
        let tmpobj = JSON.parse(text);
        if (tmpobj.text) {
          obj = tmpobj.text;
        } else {
          obj = tmpobj;
        }
      } catch (er) {
        salert('Provide a valid JSON to create NFT');
        return false;
      }
      processed = true;
    }

    if (this.nft_type === 'css' && processed == false) {
      let text = document.querySelector('#create-nft-textarea').value;
      try {
        obj.css = text;
      } catch (e) {
        salert('Provide parseable TEXT to create NFT');
        return false;
      }
      processed = true;
    }

    if (this.nft_type === 'js' && processed == false) {
      let text = document.querySelector('#create-nft-textarea').value;
      try {
        obj.js = text;
      } catch (e) {
        salert('Provide parseable JS to create NFT');
        return false;
      }
      processed = true;
    }

    if (this.nft_type == 'image' && processed == false) {
      if (!this.image) {
        salert(`Attach an image/file to create nft`);
        return false;
      }
      obj.image = this.image;
      processed = true;
    }

    return obj;
  }

  enableDepositInput() {
    const amountInput = document.getElementById('create-nft-amount');
    const depositInput = document.getElementById('create-nft-deposit');

    if (!amountInput || !depositInput) return;

    //
    // Auto deposit (readonly, synced)
    //
    if (!this.enable_deposit) {
      // Make deposit uneditable
      depositInput.setAttribute('readonly', 'readonly');
      depositInput.style.border = 'none';
      depositInput.style.cursor = 'not-allowed';

      //
      // Attach sync listener
      //
      if (this._amountSyncListener) {
        amountInput.removeEventListener('input', this._amountSyncListener);
      }

      this._amountSyncListener = function () {
        let val = this.value.replace(/[^\d]/g, '');

        if (val.includes('.')) {
          val = val.split('.')[0];
        }

        this.value = val;
        depositInput.value = val || '0';
      };

      amountInput.addEventListener('input', this._amountSyncListener);

      // Force sync immediately
      depositInput.value = amountInput.value || '0';
    }
    //
    // Manual deposit
    //
    else {
      // Re-enable editing
      depositInput.removeAttribute('readonly');
      depositInput.style.border = '';
      depositInput.style.cursor = 'text';

      //
      // Remove sync listener
      //
      if (this._amountSyncListener) {
        amountInput.removeEventListener('input', this._amountSyncListener);
        this._amountSyncListener = null;
      }
    }
  }

  attachEvents() {
    this.enableDepositInput();

    // Help Overlay
    const helpLink = document.querySelector('#create-nft-help-link');
    if (helpLink) {
      helpLink.onclick = (e) => {
        e.preventDefault();

        this.help_overlay.show(`
          <div class="create-nft-help-overlay">
            <div class="create-nft-help-text">
    Creating an NFT requires a deposit of SAITO per NFT created. This 
    circulates with the NFT and ensures the network can track and 
    transfer it. Destroying the NFT will recover the deposit.
            <p></p>
    You can manually change the deposit amount, just be aware that 
    removing the deposit completely will result in the network 
    automatically pruning the NFT after a single genesis period.
            </div>

            <div class="create-nft-deposit-container">
              <input id="create-nft-enable-deposit" type="checkbox" class="saito-checkbox">
              <span>let me manually specify the deposit</span>
            </div>
          </div>
        `);

        const cbox = document.querySelector('#create-nft-enable-deposit');
        if (cbox) {
          cbox.checked = this.enable_deposit;

          cbox.onchange = () => {
            this.enable_deposit = cbox.checked;
            this.enableDepositInput();
          };
        }
      };
    }

    // Upload
    this.app.browser.addDragAndDropFileUploadToElement(
      'nft-image-upload',

      async (file) => {
        for (let z = 0; z < this.module_provided_nfts.length; z++) {
          let obj = this.module_provided_nfts[z];
          if (obj.class) {
            if (obj.class.includes(this.nft_type)) {
              this.file = file;
              return;
            }
          }
        }

        if (this.image) {
          salert('NFT Image Editing not allowed, refresh to restart...');
          return;
        }

        this.image = file;

        this.addImage(file);
      },
      true
    );

    // NFT Type
    document.querySelector('#create-nft-type-dropdown').onchange = async (e) => {
      this.nft_type = e.target.value;
      const uploadEl = document.querySelector('#nft-image-upload');
      const textarea = document.querySelector('#create-nft-textarea');

      document.querySelector('.saito-nft-create .upload .file')?.remove();
      document.querySelector('.saito-nft-create .upload .preview')?.remove();

      let processed = false;

      //alert(this.nft_type + ' ... ');

      if (this.nft_type === 'text') {
        uploadEl.style.display = 'none';
        textarea.style.display = 'flex';
        textarea.innerHTML = 'provide text or markdown';
      }
      if (this.nft_type === 'token') {
        const uploadText = uploadEl.querySelector('div');
        if (uploadText) {
          uploadText.innerHTML = 'upload token logo/image (optional)';
        }
        document.querySelector('.saito-nft-create .secondary .label.ticker').style.display =
          'block';
        document.querySelector('.saito-nft-create .secondary input.ticker').style.display =
          'block';
        uploadEl.style.display = 'flex';
        textarea.style.display = 'none';
      }
      if (this.nft_type === 'js') {
        uploadEl.style.display = 'none';
        textarea.style.display = 'flex';
        textarea.innerHTML = 'alert("Hello World!");';
      }
      if (this.nft_type === 'css') {
        uploadEl.style.display = 'none';
        textarea.style.display = 'flex';
        textarea.innerHTML = '--saito-primary: green;';
      }
      if (this.nft_type === 'json') {
        uploadEl.style.display = 'none';
        textarea.style.display = 'flex';
        textarea.innerHTML = JSON.stringify({ key1: 'value1', key2: 'value2' }, null, 2);
      }
      if (this.nft_type === 'image') {
        uploadEl.style.display = 'flex';
        textarea.style.display = 'none';
      }
      if (this.nft_type === 'file') {
        uploadEl.style.display = 'flex';
        textarea.style.display = 'none';
      }

      for (let z = 0; z < this.module_provided_nfts.length; z++) {
        let obj = this.module_provided_nfts[z];
        if (obj.class) {
          if (obj.class.includes(this.nft_type)) {
            if (obj.json) {
              uploadEl.style.display = 'none';
              textarea.style.display = 'block';
              textarea.innerHTML = JSON.stringify(obj.json, null, 2);
            }

            if (obj.createData) {
              uploadEl.style.display = 'flex';
              textarea.style.display = 'none';
            }
          }
        }
      }

      if (this.image && uploadEl) {
        this.addImage(this.image);
      }
    };

    // Wizard Navigation
    const nextStep = document.getElementById('next-step');
    if (nextStep) {
      nextStep.onclick = () => {
        const root = document.querySelector('.saito-nft-create');
        if (root) {
          root.classList.add('provide-metadata');
        }
        const titleEl = document.querySelector('.saito-nft-create .header .title');
        if (titleEl) {
          titleEl.innerHTML = 'Provide Metadata';
        }
      };
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.onclick = () => {
        const root = document.querySelector('.saito-nft-create');
        if (root) {
          root.classList.remove('provide-metadata');
        }
        const titleEl = document.querySelector('.saito-nft-create .header .title');
        if (titleEl) {
          titleEl.innerHTML = 'Create NFT';
        }
      };
    }

    // Create NFT
    document.querySelector('#create_nft').onclick = async (e) => {
      let obj = await this.createObject();
      if (obj == false) {
        return;
      }

      //
      // this value is not either nolan/saito
      // this represents the number of nft to mint
      //
      let numNFT = parseInt(document.querySelector('#create-nft-amount').value);

      if (numNFT < 1) {
        salert('Need to create at least one NFT');
        return;
      } else if (numNFT > 100000000) {
        salert('Cannot mint more than 100,000,000 NFTs');
        return;
      }

      let balance = await this.app.wallet.getBalance();

      // value of nft (nolan)
      let depositAmt = parseInt(document.querySelector('#create-nft-deposit').value);
      depositAmt = BigInt(this.app.wallet.convertSaitoToNolan(depositAmt));

      if (balance < depositAmt) {
        salert('Insufficient funds!');
        return;
      }

      if (depositAmt < BigInt(1)) {
        salert(`Need at least 1 SAITO to create NFT`);
        return;
      }
      let fee = BigInt(0n);

      let tx_msg = {
        data: obj
      };

      let ticker = (
        document.querySelector('.saito-nft-create .secondary input.ticker').value || ''
      ).toUpperCase();
      let title_el = document.querySelector('.saito-nft-create .secondary input.title');
      let title = title_el.value || title_el.getAttribute('placeholder') || '';
      title = title.trim();

      let desc_field = document.querySelector('.saito-nft-create .secondary textarea.description');
      let description = desc_field?.innerText || desc_field?.value || desc_field.innerHTML || '';
      description = description.trim();

      if (ticker) {
        tx_msg.ticker = ticker;
        this.nft_type = 'token';
      }

      if (title) {
        tx_msg.title = title;
      }

      if (description) {
        tx_msg.description = description;
      }

      siteMessage('Minting NFT...', 3000);

      try {
        let publickey = await this.app.wallet.getPublicKey();
        let newtx = await this.app.wallet.createMintNFTTransaction(
          BigInt(numNFT),
          depositAmt,
          tx_msg,
          fee,
          publickey,
          this.nft_type
        );
        await newtx.sign();
        await this.app.network.propagateTransaction(newtx);

        if (typeof this.defaults.callback === 'function') {
          this.defaults.callback({
            status: 'created',
            tx: newtx,
            signature: newtx.signature,
            nft_id: this.app.wallet.computeNFTIdFromTx(newtx)
          });
          this.defaults.callback = null;
        }
      } catch (err) {
        console.error('CreateNFT: mint failed', err);
        siteMessage('Failed to mint NFT. Please try again.', 3000);
        return;
      }

      this.overlay.close();
    };
  }

  addImage(data = '') {
    let fileInfo = this.parseFileInfo(data);

    let html = ``;
    if (fileInfo.isImage) {
      html = `<div class="preview">
                      <img style="max-height: inherit; max-width: inherit; height: inherit; width: inherit" src="${data}"/>
              </div>`;
    } else {
      html = `
                <div class="file">
                    <div class="file-transfer-progress"></div>
                    <i class="fa-solid fa-file-export"></i>
                    <div class="file-name">${fileInfo.name}</div>
                    <div class="file-size fixed-width">${fileInfo.size / 1024} KB</div>
                </div>
            `;
    }

    this.app.browser.addElementToSelector(html, '.saito-nft-create .primary .upload');
    document.querySelector('#nft-image-upload').style.display = 'none';
  }

  // Utilities for processing a file...

  parseDataUri(dataUri) {
    const [header, data] = dataUri.split(',', 2);
    if (!header.startsWith('data:')) {
      throw new Error('Not a valid data URI');
    }
    // strip leading "data:"
    const parts = header.slice(5).split(';');
    const mediaType = parts[0] || '';
    const params = {};
    for (let i = 1; i < parts.length; i++) {
      const [key, val] = parts[i].split('=');
      // treat bare "base64" as a boolean flag
      params[key] = val === undefined ? '' : val;
    }
    return { mediaType, params, data };
  }

  extractMediaType(dataUri) {
    try {
      return this.parseDataUri(dataUri).mediaType || null;
    } catch {
      return null;
    }
  }

  extractExtension(dataUri) {
    const mediaType = this.extractMediaType(dataUri);
    if (!mediaType) return null;
    const parts = mediaType.split('/');
    if (parts.length !== 2) return null;
    // drop any "+suffix" (e.g. "svg+xml" → "svg")
    return parts[1].split('+')[0].toLowerCase();
  }

  extractFileName(dataUri) {
    try {
      const { params } = this.parseDataUri(dataUri);
      // look for either "name" or "filename"
      const fname = params.name || params.filename;
      if (fname) return fname;
      const ext = this.extractExtension(dataUri) || 'bin';
      return `file.${ext}`;
    } catch {
      return null;
    }
  }

  getFileSizeFromDataUri(dataUri) {
    try {
      const base64 = this.parseDataUri(dataUri).data;
      // count padding characters ("=" at end)
      const paddingMatches = base64.match(/=+$/);
      const padding = paddingMatches ? paddingMatches[0].length : 0;
      // formula: bytes = 3/4 * length_of_base64 - padding
      return Math.round((base64.length * 3) / 4 - padding);
    } catch {
      return null;
    }
  }

  isImageDataUri(dataUri) {
    const mt = this.extractMediaType(dataUri);
    return mt !== null && mt.startsWith('image/');
  }

  parseFileInfo(dataUri) {
    return {
      mediaType: this.extractMediaType(dataUri),
      extension: this.extractExtension(dataUri),
      name: this.extractFileName(dataUri),
      size: this.getFileSizeFromDataUri(dataUri),
      isImage: this.isImageDataUri(dataUri)
    };
  }

  reset() {
    this.image = '';
    this.nft_type = null;
    this.module_provided_nfts = [];
    this.file = null;
  }
}

module.exports = CreateNFT;
