const DetailsTemplate = require('./details.template');
const SaitoTokenOverlay = require('./saito-acquisition.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoLoader = require('./../../saito-loader/saito-loader');

class Details {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.overlay.class = 'saito-overlay bottom-mobile-overlay';
    this.loader = new SaitoLoader(this.app, this.mod, '#saito-details-loader');

    app.connection.on('saito-crypto-details-render-request', (ticker) => {
      this.ticker = ticker;
      this.mod = this.app.wallet.returnCryptoModuleByTicker(ticker);
      this.render();
    });

    app.connection.on('crypto-activated', (ticker) => {
      if (ticker == this.ticker && this.overlay.visible) {
        this.render();
      }
    });
  }

  render(qrcode_html = '') {
    this.overlay.show(DetailsTemplate(this.app, this.mod));

    // Insert deposit QR code
    if (document.getElementById('qrcode2')) {
      if (qrcode_html) {
        document.querySelector('#qrcode2').innerHTML = qrcode_html;
      } else {
        document.querySelector('#qrcode2').style.visibility = 'hidden';
        document.querySelector('#qrcode2').style.opacity = '0';

        document.querySelector('#qrcode2').innerHTML = '';
        this.app.browser.generateQRCode(this.mod.address, 'qrcode2');
        setTimeout(() => {
          document.querySelector('#qrcode2').removeAttribute('style');
        }, 100);
      }
    }

    this.formatHistory();

    this.loader.remove();
    this.attachEvents();
  }

  formatHistory() {
    if (this.mod.history.length > 0) {
      console.log('Formatting HISTORY: ', this.mod.history);

      let day = new Date().toDateString();

      let history_html = '';
      let running_balance = Number(this.mod.returnBalance());

      // Go backwards in time
      for (let i = this.mod.history.length - 1; i >= 0; i--) {
        let h = this.mod.history[i];
        let ts = new Date(h.timestamp);
        let inner_html = '';
        if (ts.toDateString() !== day) {
          day = ts.toDateString();
          inner_html += `<div class="saitox-table-break">${day}</div>`;
        }

        inner_html += `<div class="crypto-timestamp">${ts.toLocaleTimeString()}</div>
                          <div class="crypto-type">${h.type}</div>
                          <div class="crypto-amount">${h.amount}</div>
                          <div class="crypto-amount">${running_balance}</div>`;

        if (h.counter_party?.publicKey) {
          inner_html += this.app.browser.returnAddressHTML(h.counter_party.publicKey);
        } else if (h.counter_party?.address) {
          inner_html += `<div class="crypto-address">${h.counter_party.address}</div>`;
        } else {
          inner_html += '<div></div>';
        }

        history_html += inner_html;

        running_balance -= Number(h.amount);
      }

      this.app.browser.addElementToSelector(
        history_html,
        '.transaction-history-table.saitox-table'
      );
    } else {
      /*document.querySelectorAll('.pagination-button').forEach(function (btn, key) {
        btn.classList.add('disabled');
      });*/
    }
  }

  attachEvents() {
    if (document.getElementById('activate-now')) {
      document.getElementById('activate-now').onclick = (e) => {
        this.loader.render();
        this.app.wallet.setPreferredCrypto(this.ticker);
      };
    }

    Array.from(document.querySelectorAll('.pubkey-container')).forEach(
      (element) =>
        (element.onclick = async (e) => {
          let public_key = document.getElementById('profile-public-key').dataset.add;

          await navigator.clipboard.writeText(public_key);
          let icon_element = element.querySelector('i.fa-copy');
          icon_element.classList.toggle('fa-copy');
          icon_element.classList.toggle('fa-check');

          setTimeout(() => {
            icon_element.classList.toggle('fa-copy');
            icon_element.classList.toggle('fa-check');
          }, 800);
        })
    );

    if (document.getElementById('send-crypto')) {
      document.getElementById('send-crypto').onclick = (e) => {
        if (Number(this.mod.balance) > 0) {
          this.app.connection.emit('saito-crypto-withdraw-render-request', { ticker: this.ticker });
        }
      };
    }

    if (document.getElementById('get-saito')) {
      document.getElementById('get-saito').onclick = (e) => {
        let overlay = new SaitoOverlay(this.app, this.mod);
        overlay.show(SaitoTokenOverlay());
      };
    }

    if (document.getElementById('check-balance')) {
      document.getElementById('check-balance').onclick = async (e) => {
        e.currentTarget.classList.add('refreshing');
        let balance = await this.mod.checkBalanceUpdate();
        this.render(document.querySelector('#qrcode2')?.innerHTML);
        setTimeout(() => {
          document.getElementById('check-balance').classList.add('refreshed');
          setTimeout(() => {
            if (document.getElementById('check-balance')) {
              document.getElementById('check-balance').classList.remove('refreshed');
            }
          }, 5000);
        }, 5);
      };
    }

    if (document.getElementById('check-history')) {
      document.getElementById('check-history').onclick = (e) => {
        e.currentTarget.classList.add('refreshing');
        this.mod.checkHistory(() => {
          this.render(document.querySelector('#qrcode2')?.innerHTML);
          setTimeout(() => {
            document.getElementById('check-history').classList.add('refreshed');
            setTimeout(() => {
              if (document.getElementById('check-history')) {
                document.getElementById('check-history').classList.remove('refreshed');
              }
            }, 5000);
          }, 5);
        });
      };
    }

    /////////////////////////
    /// Pagination events....
    /////////////////////////
    /*
    const paginationNumbers = document.getElementById('pagination-numbers');
    const listItems = document.querySelectorAll('.mixin-txn-his-container .saito-table-row');
    const nextButton = document.getElementById('next-button');
    const prevButton = document.getElementById('prev-button');

    const paginationLimit = 10;
    const pageCount = Math.ceil(listItems.length / paginationLimit);
    let currentPage = 1;

    if (listItems.length == 0) {
      document.querySelector('.pagination-container').classList.add('disabled');
    }

    const disableButton = (button) => {
      button.classList.add('disabled');
      //button.setAttribute("disabled", true);
    };

    const enableButton = (button) => {
      button.classList.remove('disabled');
      //button.removeAttribute("disabled");
    };

    const handlePageButtonsStatus = () => {
      if (currentPage === 1) {
        disableButton(prevButton);
      } else {
        enableButton(prevButton);
      }

      if (pageCount === currentPage) {
        disableButton(nextButton);
      } else {
        enableButton(nextButton);
      }
    };

    const handleActivePageNumber = () => {
      document.querySelectorAll('.pagination-number').forEach((button) => {
        button.classList.remove('active');
        const pageIndex = Number(button.getAttribute('page-index'));
        if (pageIndex == currentPage) {
          button.classList.add('active');
        }
      });
    };

    const appendPageNumber = (index) => {
      const pageNumber = document.createElement('div');
      pageNumber.className = 'pagination-number';
      pageNumber.innerHTML = index;
      pageNumber.setAttribute('page-index', index);
      pageNumber.setAttribute('aria-label', 'Page ' + index);

      paginationNumbers.appendChild(pageNumber);
    };

    const getPaginationNumbers = () => {
      for (let i = 1; i <= pageCount; i++) {
        appendPageNumber(i);
      }
    };

    const setCurrentPage = (pageNum) => {
      currentPage = pageNum;

      handleActivePageNumber();
      handlePageButtonsStatus();

      const prevRange = (pageNum - 1) * paginationLimit;
      const currRange = pageNum * paginationLimit;

      listItems.forEach((item, index) => {
        item.classList.add('hidden');
        if (index >= prevRange && index < currRange) {
          item.classList.remove('hidden');
        }
      });
    };

    getPaginationNumbers();
    setCurrentPage(1);

    prevButton.addEventListener('click', () => {
      if (currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    });

    nextButton.addEventListener('click', () => {
      if (currentPage < pageCount) {
        setCurrentPage(currentPage + 1);
      }
    });

    document.querySelectorAll('.pagination-number').forEach((button) => {
      const pageIndex = Number(button.getAttribute('page-index'));

      if (pageIndex) {
        button.addEventListener('click', () => {
          setCurrentPage(pageIndex);
        });
      }
    });

    */
  }
}

module.exports = Details;
