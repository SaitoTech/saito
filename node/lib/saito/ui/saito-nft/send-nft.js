const NftTemplate  = require('./send-nft.template');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');
const SaitoUser    = require('./../saito-user/saito-user');

class Nft {
  constructor(app, mod, container = '') {
    this.app          = app;
    this.mod          = mod;
    this.overlay      = new SaitoOverlay(this.app, this.mod);

    this.nft_selected = null;
    this.nft_list     = [];

    this.app.connection.on(
      'saito-send-nft-render-request',
      () => { this.render(); }
    );
  }

  async render() {
    this.overlay.show(
      NftTemplate(this.app, this.mod)
    );

    // Update balance if that element exists
    let balance_str = await this.mod.getBalanceString();
    const balEl = document.querySelector(
      ".slip-info .metric.balance h3 .metric-amount"
    );
    if (balEl) {
      balEl.innerHTML = balance_str;
    }

    await this.renderNft();

    setTimeout(() => this.attachEvents(), 0);
  }

  attachEvents() {
    const createLink = document.querySelector('#nft-link');
    if (createLink) {
      createLink.onclick = (e) => {
        e.preventDefault();
        this.overlay.close();
        this.app.connection.emit(
          'saito-create-nft-render-request',
          {}
        );
      };
    }

    const nextBtn      = document.querySelector('#nft-next');
    const mergeBtn     = document.querySelector('#send-nft-merge');
    const divideBtn    = document.querySelector('#send-nft-divide');
    const nextBtnNav   = nextBtn ? nextBtn.parentElement : null;
    const sendNftTitle = document.querySelector("#send-nft-title");

    if (nextBtn) {
      nextBtn.classList.add('disabled');
    }
    if (mergeBtn) {
      mergeBtn.style.display = 'none';
    }
    if (divideBtn) {
      divideBtn.style.display = 'none';
    }

    document.querySelectorAll('.send-nft-row').forEach(row => {
      row.onclick = (e) => {
        document.querySelectorAll('.send-nft-row').forEach(r => {
          r.classList.remove('nft-selected');
          const rRadio = r.querySelector('input[type="radio"].hidden-nft-radio');
          if (rRadio) rRadio.checked = false;
        });
        row.classList.add('nft-selected');

        const hiddenRadio = row.querySelector('input[type="radio"].hidden-nft-radio');
        if (hiddenRadio) {
          hiddenRadio.checked = true;
          this.nft_selected = parseInt(hiddenRadio.value);
        }

        if (mergeBtn)  mergeBtn.style.display = 'inline-block';
        if (divideBtn) divideBtn.style.display = 'inline-block';

        if (nextBtn) nextBtn.classList.remove('disabled');
      };
    });

    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.preventDefault();
        if (nextBtn.classList.contains('disabled')) {
          return;
        }
        const page1 = document.querySelector('#page1');
        const page2 = document.querySelector('#page2');
        if (page1 && page2) {
          page1.style.display      = 'none';
          page2.style.display      = 'flex';
          nextBtnNav.style.display = 'none';
          sendNftTitle.innerText   = 'SEND NFT';
        }
      };
    }

    const backBtn = document.querySelector('#nft-back');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();

        const page1 = document.querySelector('#page1');
        const page2 = document.querySelector('#page2');
        if (page1 && page2) {
          page2.style.display      = 'none';
          page1.style.display      = 'block';
          nextBtnNav.style.display = 'flex';
          sendNftTitle.innerText   = 'SELECT NFT';

          document.querySelectorAll('.send-nft-row').forEach(r => {
            r.classList.remove('nft-selected');
            const rRadio = r.querySelector('input[type="radio"].hidden-nft-radio');
            if (rRadio) rRadio.checked = false;
          });
          this.nft_selected = null;

          if (mergeBtn)  mergeBtn.style.display = 'none';
          if (divideBtn) divideBtn.style.display = 'none';

          if (nextBtn) {
            nextBtn.classList.add('disabled');
          }
        }
      };
    }

    const sendBtn = document.querySelector('#send_nft');
    if (sendBtn) {
      sendBtn.onclick = async (e) => {
        e.preventDefault();

        if (this.nft_selected === null) {
          alert("Please select an NFT first.");
          return;
        }

        const receiverInput = document.querySelector('#nfts-receiver');
        const receiver = receiverInput ? receiverInput.value.trim() : "";
        if (!receiver) {
          alert("Please enter the receiver’s public key.");
          return;
        }

        sendBtn.classList.add('disabled');
        sendBtn.innerText = "Submitting...";

        try {
          const nftItem = this.nft_list[this.nft_selected];
          if (!nftItem) throw new Error("Selected NFT not found.");

          const slip1Key = nftItem.slip1.utxo_key;
          const slip2Key = nftItem.slip2.utxo_key;
          const slip3Key = nftItem.slip3.utxo_key;

          const amt     = BigInt(1);
          const payload = JSON.stringify({ image: "" });
          const newtx   = await this.app.wallet.createSendBoundTransaction(
            amt,
            slip1Key,
            slip2Key,
            slip3Key,
            payload,
            receiver
          );

          await newtx.sign();
          await this.app.network.propagateTransaction(newtx);
          console.log("Bound TX propagated:", newtx);

          setTimeout(async () => {
            try {
              const rawList = await this.app.wallet.getNftList();
              const parsed  = JSON.parse(rawList);
              await this.app.wallet.saveNftList(parsed);
              console.log(
                "Updated wallet NFT list:",
                this.app.options.wallet.nft
              );
              alert("NFT sent successfully!");
            } catch (fetchErr) {
              console.error("Error refreshing NFT list:", fetchErr);
              alert("NFT was sent, but failed to refresh local list.");
            }
          }, 2000);

          this.overlay.close();
        } catch (err) {
          console.error("Error sending NFT:", err);
          alert("Failed to send NFT: " + err.message);

          sendBtn.classList.remove('disabled');
          sendBtn.innerText = "Send NFT";
        }
      };
    }
  }

  async renderNft() {
    let this_self    = this;
    let saito_users  = {};
    this.nft_list    = await this.fetchNFT();
    console.log("Loaded NFT list:", this.nft_list);

    // Build the NFT list container
    let html = `
      <div class="send-nft-list">
    `;

    if (!Array.isArray(this.nft_list) || this.nft_list.length === 0) {
      // If no NFTs, show a message
      html += `
        <div class="send-nft-row empty-send-nft-row">
          <div class="send-nft-row-item">
            You do not have any NFTs in your wallet. 
            If you have just created or been sent one, 
            please wait a few minutes for the network to 
            confirm for your wallet."
          </div>
        </div>
      `;
      
      // Hide Page 2 since there’s nothing to send
      const page2 = document.querySelector('#page2');
      if (page2) page2.style.display = 'none';
    } else {
      // Otherwise, iterate over each NFT
      let x = 0;
      this.nft_list.forEach((nft, i) => {
        const slip1        = nft.slip1;
        const slip2        = nft.slip2;
        const amount       = BigInt(slip1.amount);
        const depositNolan = BigInt(slip2.amount);
        const nftValue     = this.app.wallet.convertNolanToSaito(depositNolan);
        const nftCreator   = slip1.public_key;

        const saitoUser = new SaitoUser(
          this.app,
          this.mod,
          `.saito-user-${nftCreator}-${x}`,
          nftCreator
        );
        saito_users[nftCreator] = saitoUser;

        // Generate an identicon for the NFT ID
        let nftIdenticon = this_self.app.keychain.returnIdenticon(nft.id);

        html += `
            <div class="send-nft-row" nft-index="${i}">
                <!-- Hidden radio to track selection -->
                <input
                  type="radio"
                  name="hidden-nft-radio"
                  class="hidden-nft-radio"
                  value="${i}"
                  style="display: none;"
                />

                <img class="nft-identicon" src="${nftIdenticon}" />

                <div class="send-nft-row-right">
                  <div class="send-nft-id">${nft.id}</div>

                  <div class="send-nft-details">
                    <div class="send-nft-left-row">
                      <div class="send-nft-amount">
                        <span>amount:</span>
                        <span>${amount}</span>
                      </div>
                      <div class="send-nft-deposit">
                        <span>deposit:</span>
                        <span>${nftValue} SAITO</span>
                      </div>
                    </div>

                    <div class="send-nft-right-row">
                      <div class="send-nft-create-by saito-user-${nftCreator}-${x}">
                      </div>
                    </div>
                  </div>
                </div>
            </div>
        `;

        x++;
      });
    }

    html += `</div>`;

    const listContainer = document.querySelector('#nft-list');
    if (listContainer) {
      listContainer.innerHTML = html;
    }

    for (const [publicKey, saito_user] of Object.entries(saito_users)) {
      console.log(saito_user, publicKey);
      saito_user.render();
      saito_user.updateUserline(publicKey);
    }
  }

  async fetchNFT() {
    const data = this.app.options.wallet.nfts || [];
    console.log("fetchNFT →", data);
    return data;
  }
}

module.exports = Nft;
