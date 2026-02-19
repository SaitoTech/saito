let ProvideMetaDataOverlayTemplate = require('./provide-metadata.template');
let SaitoNFT = require('./../saito-nft');
let SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class ProvideMetaDataOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
  }

  render(newtx) {
    this.nft = new SaitoNFT(this.app, this.mod, newtx);
    this.nfttx = newtx;
    this.overlay.show(
      ProvideMetaDataOverlayTemplate(this.app, this.mod, newtx, this.nft),
      async () => {
        console.debug('Close overlay callback');
        siteMessage('Minting NFT...', 3000);
        await this.nfttx.sign();
        console.debug('nft signed');
        await this.app.network.propagateTransaction(this.nfttx);
        console.debug('nft propagated');
      }
    );
    this.attachEvents();
  }

  async attachEvents() {
    let this_self = this;

    //
    // buttons
    //
    let confirm_btn = document.querySelector('.saito-nft-footer-btn.send');
    let title_element = document.querySelector('.saito-nft-header-title.editable');
    let description_element = document.querySelector(
      '.saito-nft-description-box-metadata.editable'
    );

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

        this.overlay.close();
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
  }
}

module.exports = ProvideMetaDataOverlay;
