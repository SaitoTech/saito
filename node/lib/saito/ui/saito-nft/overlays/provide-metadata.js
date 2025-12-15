let ProvideMetaDataOverlayTemplate = require('./provide-metadata.template');
let SaitoNFT = require('./../saito-nft');
let SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class ProvideMetaDataOverlay {
  constructor(app, mod, attach_events = true) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.nfttx = null;
    this.nft = null;

    //
    // ui helpers
    //
    this.nft = null;

    if (attach_events == true) {
      app.connection.on('saito-nft-details-render-request', (nft) => {
        this.nft = nft;
        this.owner = nft.slip1.public_key;
        this.render();
      });

      app.connection.on('saito-nft-details-close-request', () => {
        this.overlay.close();
      });
    }
  }

  render(newtx) {
    this.nft = new SaitoNFT(this.app, this.mod, newtx);
    this.nfttx = newtx;
    this.overlay.show(ProvideMetaDataOverlayTemplate(this.app, this.mod, newtx, this.nft));
    this.attachEvents();
  }

  async attachEvents() {
    let this_self = this;

    //
    // buttons
    //
    let header_btn = document.querySelector('.saito-nft-header-btn');
    let edit_title_btn = document.querySelector('.saito-nft-footer-btn.edit-title');
    let edit_description_btn = document.querySelector('.saito-nft-footer-btn.edit-description');
    let confirm_btn = document.querySelector('.saito-nft-footer-btn.send');

    //
    // confirm / create
    //
    if (confirm_btn) {
      confirm_btn.onclick = async (e) => {
        siteMessage('Broadcasting NFT Transaction...', 3000);
        this.overlay.hide();
        this.nfttx.packData();
        await this.nfttx.sign();
        await this.app.network.propagateTransaction(this.nfttx);
        siteMessage('Waiting for Confirmation...', 2000);
      };
    }

    edit_description_btn.onclick = (e) => {
      let new_description = prompt('Provide NFT Description: ');
      if (new_description) {
        this.nfttx.msg.description = new_description;
        document.querySelector('.saito-nft-description').innerHTML = new_description;
      }
    };

    edit_title_btn.onclick = (e) => {
      let new_title = prompt('Provide NFT Title: ');
      if (new_title) {
        this.nfttx.msg.title = new_title;
        document.querySelector('.saito-nft-header-title').innerHTML = new_title;
      }
    };

    //
    // header info toggle
    //
    header_btn.onclick = (e) => {
      let p = document.querySelector('.saito-nft-overlay.panels');

      if (p.classList.contains('saito-nft-mode-info')) {
        p.classList.remove('saito-nft-mode-info');
      } else {
        p.classList.add('saito-nft-mode-info');
      }

      header_btn.classList.toggle('rotate');
    };

    if (document.querySelector('#nft-image-upload')) {
      this.app.browser.addDragAndDropFileUploadToElement(
        'nft-image-upload',
        async (file) => {
          this.image = file;
          if (!this.nfttx.msg.data) {
            this.nfttx.msg.data = {};
          }
          this.nfttx.msg.data.image = file;
          this.addImage(file);
        },
        true
      );
    }
  }

  addImage(data = '') {
    let fileInfo = this.parseFileInfo(data);

    let html = ``;
    if (fileInfo.isImage) {
      html = `<div class="nft-image-preview">
                      <img style="max-height: inherit; max-width: inherit; height: inherit; width: inherit" src="${data}"/>
              </div>`;
    } else {
      html = ` 
                <div class="nft-file-transfer">
                    <div class="file-transfer-progress"></div>
                    <i class="fa-solid fa-file-export"></i>
                    <div class="file-name">${fileInfo.name}</div>
                    <div class="file-size fixed-width">${fileInfo.size / 1024} KB</div>
                </div>
            `;
    }

    this.app.browser.addElementToSelector(
      html,
      '.saito-nft-panel-body.nft-creator .textarea-container'
    );
    document.querySelector('#nft-image-upload').style.display = 'none';
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
}

module.exports = ProvideMetaDataOverlay;
