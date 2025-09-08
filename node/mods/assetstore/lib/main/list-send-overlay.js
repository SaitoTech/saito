const BaseSend = require('./../../../../lib/saito/ui/saito-nft/send-overlay');

class ListSendOverlay extends BaseSend {
  async render(nft) {
    super.render(nft); 
    this.attachEvents();
  }

  async attachEvents() {
    await super.attachEvents();

    // hide split/merge areas
    this.mergeSplitCont && (this.mergeSplitCont.style.display = 'none');
    this.mergeCont && (this.mergeCont.style.display = 'none');
    this.splitCont && (this.splitCont.style.display = 'none');

    // tweak header + placeholder
    const header = this._overlayRoot?.querySelector('.nft-details-send h4');
    if (header) header.textContent = 'LIST ON ASSETSTORE🧾';
    if (this.receiver_input) {
      this.receiver_input.placeholder = 'Assetstore public key';
    }

    // override Send button behavior
    if (this.sendBtn) {

      this.sendBtn.innerText = "List"

      this.sendBtn.onclick = async (e) => {
        e.preventDefault();

        const node_publicKey = (this.receiver_input?.value || '').trim();
        const pc = this.app.wallet.returnPreferredCrypto();
        if (!pc.validateAddress(node_publicKey)) {
          salert('Node public key is not valid');
          return;
        }

        const prev = this.sendBtn.innerText;
        this.sendBtn.classList.add('disabled');
        this.sendBtn.setAttribute('disabled', 'disabled');
        this.sendBtn.innerText = 'Submitting...';

        try {
          const listTx = await this.mod.createListAssetTransaction(this.nft.tx, node_publicKey);
          await this.app.network.propagateTransaction(listTx);

          this.overlay.close();
          this.app.connection.emit('assetstore-close-list-overlay-request');

          salert('Listing submitted');
        } catch (err) {
          salert('Failed to list: ' + (err?.message || err));
        } finally {
          this.sendBtn.classList.remove('disabled');
          this.sendBtn.removeAttribute('disabled');
          this.sendBtn.innerText = prev;
        }
      };
    }
  }
}

module.exports = ListSendOverlay;
