const CreateNftTemplate = require('./create-overlay.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class CreateNft {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.nft_type = null;

    this.app.connection.on('saito-nft-create-render-request', () => {
      this.image = null;
      this.render();
    });
  }

  render() {
    this.overlay.show(CreateNftTemplate(this.app, this.mod, this));

    // makes sure DOM is loaded before attaching events
    setTimeout(() => this.attachEvents(), 0);
  }

  createObject() {
    let obj = {};
    this.nft_type = document.querySelector('#create-nft-type-dropdown').value;
    //console.log('nft_type:', nft_type);

    if (this.nft_type == 'text') {
      let text = document.querySelector('#create-nft-textarea').value;

      try {
        obj.text = JSON.parse(text);
      } catch (e) {
        salert('Provide a valid JSON to create NFT');
        return false;
      }
    } else {
      if (!this.image) {
        salert(`Attach an image/file to create nft`);
        return false;
      }

      obj.image = this.image;
    }

    return obj;
  }

  attachEvents() {
    this.app.browser.addDragAndDropFileUploadToElement(
      'nft-image-upload',
      async (file) => {
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

      // Remove non-numeric characters (keeps only digits and optional decimal for checking)
      val = val.replace(/[^\d.]/g, '');

      // If decimal exists, take only the integer part before it
      if (val.includes('.')) {
        val = val.split('.')[0];
      }

      this.value = val;
    });

    document.querySelector('#create-nft-type-dropdown').onchange = async (e) => {
      let element = e.target;
      let nft_type = element.value;

      const data = { id: '', message: '' };
      const textarea = document.querySelector('#create-nft-textarea');
      textarea.value = JSON.stringify(data, null, 2);

      this.image = '';

      if (document.querySelector('.nft-file-transfer')) {
        document.querySelector('.nft-file-transfer').remove();
      }

      if (document.querySelector('.nft-image-preview')) {
        document.querySelector('.nft-image-preview').remove();
      }

      if (nft_type == 'text') {
        document.querySelector('#nft-image-upload').style.display = 'none';
        document.querySelector('#create-nft-textarea').style.display = 'block';
      } else if (nft_type == 'image') {
        document.querySelector('#nft-image-upload').style.display = 'block';
        document.querySelector('#nft-image-upload').innerHTML = `drag-and-drop NFT image`;
        document.querySelector('#create-nft-textarea').style.display = 'none';
      } else if (nft_type == 'file') {
        document.querySelector('#nft-image-upload').style.display = 'block';
        document.querySelector('#nft-image-upload').innerHTML = `drag-and-drop NFT file`;
        document.querySelector('#create-nft-textarea').style.display = 'none';
      }
    };

    document.querySelector('#create_nft').onclick = async (e) => {
      let obj = this.createObject();
      if (obj == false) {
        return;
      }
      //      console.log('obj: ', obj);

      //
      // this value is not either nolan/saito
      // this represents the number of nft to mint
      //
      let numNft = parseInt(document.querySelector('#create-nft-amount').value);

      if (numNft < 1) {
        salert('Need to create at least one NFT');
        return;
      } else if (numNft > 100000000) {
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

      console.log('nft_type: ', this.nft_type);

      let newtx = await this.app.wallet.createMintNftTransaction(
        BigInt(numNft),
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

    this.app.browser.addElementToSelector(html, '.textarea-container');
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

module.exports = CreateNft;
