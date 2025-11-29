const AccessFileTemplate = require('./access-file.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const LoadNFTs = require('./load-nfts');

class AccessFile {

  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.file = null;
    this.submit_button_active = false;
    this.load_nfts = new LoadNFTs(this.app, this.mod);
  }

  render() {
    //this.overlay.show(AccessFileTemplate(this.app, this.mod, this));
    this.load_nfts.render();
    setTimeout(() => this.attachEvents(), 25);
  }

  attachEvents() {
    try {

      if (document.querySelector('.vault-file-access')) {
        document.querySelector('.vault-file-access').focus();

        document.querySelector('.vault-file-access').addEventListener('input', (e) => {
          let value = e.target.value;
          let btn = document.querySelector(".confirm-button");
          if (value === "") {
            btn.classList.add("disabled");
          } else {
            btn.classList.remove("disabled");
          }
        });

        document.querySelector('.vault-upload-overlay .saito-button-row .confirm-button').onclick = async (e) => {
          this.mod.file_id = document.querySelector(".vault-file-access").value;
          this.mod.sendAccessFileRequest((res) => {});
        };
      }

    } catch (err) {
      console.log("ERROR: " + err);
    }
 }

}

module.exports = AccessFile;

