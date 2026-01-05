const VaultMainTemplate = require('./main.template.js');
const AccessFileOverlay = require('./overlays/access-file.js');
const FileUploadOverlay = require('./overlays/file-upload.js');


class VaultMain {

  constructor(app, mod, container = "") {

    this.app = app;
    this.mod = mod;
    this.container = container;

    //this.list_nfts_overlay = new ListNFTsOverlay(this.app, this.mod);
    this.access_file_overlay = new AccessFileOverlay(this.app, this.mod);
    this.file_upload_overlay = new FileUploadOverlay(this.app, this.mod);

  }

  render(container = "") {

    if (container !== "") {
      this.container = container;
    }

    if (!this.container || this.container.trim() === "") {
      this.container = ".saito-container";
    }

    const html = VaultMainTemplate(this.app, this.mod);

    //
    // if scriptorium doesn't exist, append it
    // otherwise, replace its content (for dynamic refresh)
    //
    if (!document.querySelector(".saito-vault")) {
      this.app.browser.addElementToSelector(html, this.container);
    } else {
      this.app.browser.replaceElementBySelector(html, ".saito-vault");
    }

   
    this.attachEvents();

  }



  attachEvents() {
    try {

      document.querySelector(".vault-access-textlink").onclick = (e) => {
        this.access_file_overlay.render();
      }

      document.querySelector("#vault-secure-btn").onclick = (e) => {
        this.file_upload_overlay.render();
      }

    } catch (err) {
      console.error("Vault main attachEvents error:", err);
    }
  }

}

module.exports = VaultMain;


