const CreateNFTTemplate = require('./create-overlay.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class CreateNFT {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.nft_type = null;
    this.module_provided_nfts = [];
    this.file = null;
    this.app.connection.on('saito-nft-create-render-request', () => {
      this.image = null;
      this.render();
    });
  }

  render() {

    this.module_provided_nfts = [];

    this.overlay.show(CreateNFTTemplate(this.app, this.mod, this));

    for (const nft_mod of this.app.modules.respondTo('saito-create-nft', this.mod)) {
      let obj = nft_mod.respondTo('saito-create-nft', this.mod);
      this.module_provided_nfts.push(obj);
    }

    setTimeout(() => {
      try {
        for (let z = 0; z < this.module_provided_nfts.length; z++) {
          let obj = this.module_provided_nfts[z];
          if (obj.title) {
            let x = `<option value="${obj.class}">${obj.title}</option>`;
            let y = document.querySelector('#create-nft-type-dropdown');
            if (y) {
              const opt = document.createElement('option');
              opt.value = obj.class;
              opt.textContent = obj.title;
              y.appendChild(opt);
            }
          }
        }
      } catch (err) {
        console.log('Error with Custom NFT Type: ' + JSON.stringify(err));
      }

      this.attachEvents();
    }, 0);
  }

  async createObject() {
    let obj = {};
    this.nft_type = document.querySelector('#create-nft-type-dropdown').value;
    let processed = false;

    for (let z = 0; z < this.module_provided_nfts.length; z++) {
      try {
        let modobj = this.module_provided_nfts[z];
        if (modobj.class.includes(this.nft_type)) {
          if (modobj.createObject) {
            obj = await modobj.createObject(this.file);
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

    if (this.nft_type === 'json' && processed == false) {
      let text = document.querySelector('#create-nft-textarea').value;
      try {
        obj = JSON.parse(text);
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

  attachEvents() {
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

    const nftAmountInput = document.getElementById('create-nft-amount');

    nftAmountInput.addEventListener('input', function () {
      let val = this.value;
      val = val.replace(/[^\d.]/g, '');
      if (val.includes('.')) {
        val = val.split('.')[0];
      }
      this.value = val;
    });

    document.querySelector('#create-nft-type-dropdown').onchange = async (e) => {
      let element = e.target;
      this.nft_type = element.value;
      let textarea = document.querySelector('#create-nft-textarea');

      this.image = '';

      if (document.querySelector('.nft-file-transfer')) {
        document.querySelector('.nft-file-transfer').remove();
      }

      if (document.querySelector('.nft-image-preview')) {
        document.querySelector('.nft-image-preview').remove();
      }

      let processed = false;

      if (this.nft_type === 'text') {
        document.querySelector('#nft-image-upload').style.display = 'none';
        document.querySelector('#create-nft-textarea').style.display = 'block';
        textarea.innerHTML = 'provide text or markdown';
      }
      if (this.nft_type === 'js') {
        document.querySelector('#nft-image-upload').style.display = 'none';
        document.querySelector('#create-nft-textarea').style.display = 'block';
        textarea.innerHTML = 'alert("Hello World!");';
      }
      if (this.nft_type === 'css') {
        document.querySelector('#nft-image-upload').style.display = 'none';
        document.querySelector('#create-nft-textarea').style.display = 'block';
        textarea.innerHTML = '--saito-primary: green;';
      }
      if (this.nft_type === 'json') {
        document.querySelector('#nft-image-upload').style.display = 'none';
        document.querySelector('#create-nft-textarea').style.display = 'block';
        textarea.innerHTML = JSON.stringify({ key1: 'value1', key2: 'value2' }, null, 2);
      }
      if (this.nft_type === 'image') {
        document.querySelector('#nft-image-upload').style.display = 'block';
        document.querySelector('#nft-image-upload').innerHTML = `drag-and-drop NFT image`;
        document.querySelector('#create-nft-textarea').style.display = 'none';
      }
      if (this.nft_type === 'file') {
        document.querySelector('#nft-image-upload').style.display = 'block';
        document.querySelector('#nft-image-upload').innerHTML = `drag-and-drop NFT file`;
        document.querySelector('#create-nft-textarea').style.display = 'none';
      }

      for (let z = 0; z < this.module_provided_nfts.length; z++) {
        let obj = this.module_provided_nfts[z];
        if (obj.class) {
          if (obj.class.includes(this.nft_type)) {
            if (obj.json) {
              document.querySelector('#nft-image-upload').style.display = 'none';
              document.querySelector('#create-nft-textarea').style.display = 'block';
              textarea.innerHTML = JSON.stringify(obj.json, null, 2);
            }

            if (obj.createObject) {
              document.querySelector('#nft-image-upload').style.display = 'block';
              document.querySelector('#nft-image-upload').innerHTML = `drag-and-drop ROM file`;
              document.querySelector('#create-nft-textarea').style.display = 'none';
            }
          }
        }
      }
    };

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

      let newtx = await this.app.wallet.createMintNFTTransaction(
        BigInt(numNFT),
        depositAmt,
        tx_msg,
        fee,
        this.mod.publicKey,
        this.nft_type
      );

      await newtx.sign();
      await this.app.network.propagateTransaction(newtx);

      siteMessage('Minting NFT...', 3000);

      this.overlay.close();
    };
  }

  addImage(data = '') {
    let fileInfo = this.parseFileInfo(data);

    let html = ``;
    if (fileInfo.isImage) {
      html = `<div class="nft-image-preview">
                      <img style="max-height: inherit; max-width: inherit; height: inherit; width: inherit" src="${data}"/>
                      <i class="fa fa-times" id="rmv-nft"></i>
                    </div>`;
    } else {
      html = `
                <div class="nft-file-transfer">
                    <div class="file-transfer-progress"></div>
                    <i class="fa-solid fa-file-export"></i>
                    <div class="file-name">${fileInfo.name}</div>
                    <div class="file-size fixed-width">${fileInfo.size / 1024} KB</div>
                    <i class="fa fa-times" id="rmv-nft"></i>
                </div>
            `;
    }

    this.app.browser.addElementToSelector(
      html,
      '.create-nft-container .nft-creator .textarea-container'
    );
    document.querySelector('#nft-image-upload').style.display = 'none';

    if (document.querySelector('#rmv-nft')) {
      document.querySelector('#rmv-nft').onclick = async (e) => {
        if (document.querySelector('.nft-image-preview')) {
          document.querySelector('.nft-image-preview').remove();
        }

        if (document.querySelector('.nft-file-transfer')) {
          document.querySelector('.nft-file-transfer').remove();
        }

        document.querySelector('#nft-image-upload').style.display = 'block';
        this.image = '';
      };
    }
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
}

module.exports = CreateNFT;
