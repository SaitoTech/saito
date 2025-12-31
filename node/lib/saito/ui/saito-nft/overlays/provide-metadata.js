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
    let confirm_btn = document.querySelector('.saito-nft-footer-btn.send');
    let title_element = document.querySelector('.saito-nft-header-title.editable');
    let description_element = document.querySelector('.saito-nft-description-box-metadata.editable');

    //
    // confirm / create
    //
    if (confirm_btn) {
      confirm_btn.onclick = async (e) => {
        // Only set title/description if they were modified (not default values)
        let titleEl = document.querySelector('.saito-nft-header-title.editable');
        let descEl = document.querySelector('.saito-nft-description-box-metadata.editable');
        
        if (titleEl) {
          let currentTitle = titleEl.innerText.trim();
          let defaultTitle = titleEl.getAttribute('data-default-title');
          if (currentTitle && currentTitle !== defaultTitle) {
            this.nfttx.msg.title = currentTitle;
          }
        }
        
        if (descEl) {
          let descTextEl = descEl.querySelector('.saito-nft-description-text-metadata') || descEl;
          let currentDesc = descTextEl.innerText.trim();
          let defaultDesc = descEl.getAttribute('data-default-description');
          // Only set description if it was changed AND is not empty
          if (currentDesc && currentDesc !== defaultDesc && currentDesc.trim() !== '') {
            this.nfttx.msg.description = currentDesc.trim();
          }
        }
        
        siteMessage('Broadcasting NFT Transaction...', 3000);
        this.overlay.close();
        this.nfttx.packData();
        await this.nfttx.sign();
        await this.app.network.propagateTransaction(this.nfttx);
        siteMessage('Waiting for Confirmation...', 2000);
      };
    }

    //
    // Title editing
    //
    let editTitle = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!title_element) return;
      
      let currentTitle = title_element.innerText.trim();
      let defaultTitle = title_element.getAttribute('data-default-title');
      let promptText = currentTitle === defaultTitle ? '' : currentTitle;
      let new_title = await sprompt('Provide NFT Title:', promptText);
      
      if (new_title !== null) {
        if (new_title.trim()) {
          title_element.innerText = new_title.trim();
        } else {
          // Reset to default if empty
          title_element.innerText = defaultTitle;
        }
      }
    };
    
    if (title_element) {
      title_element.style.cursor = 'pointer';
      title_element.onclick = editTitle;
    }
    
    // Also make the pencil icon clickable
    let title_icon = document.querySelector('.saito-nft-edit-title-icon-metadata');
    if (title_icon) {
      title_icon.style.cursor = 'pointer';
      title_icon.onclick = editTitle;
      }

    //
    // Description editing
    //
    if (description_element) {
      description_element.style.cursor = 'pointer';
      description_element.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        let descBox = e.currentTarget.closest('.saito-nft-description-box-metadata');
        if (!descBox) {
          descBox = description_element;
        }
        
        let descText = descBox.querySelector('.saito-nft-description-text-metadata') || descBox;
        let currentDesc = descText.innerText.trim();
        let defaultDesc = descBox.getAttribute('data-default-description');
        let promptText = currentDesc === defaultDesc ? '' : currentDesc;
        let new_description = await sprompt('Provide NFT Description:', promptText);
        
        if (new_description !== null) {
          if (new_description.trim()) {
            descText.innerText = new_description.trim();
          } else {
            // Reset to default if empty
            descText.innerText = defaultDesc;
          }
        }
      };
    }

    //
    // header info toggle (removed for provide-metadata overlay)
    //

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
