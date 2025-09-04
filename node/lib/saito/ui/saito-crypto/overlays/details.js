const DetailsTemplate = require('./details.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoLoader = require('./../../saito-loader/saito-loader');

class Details {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
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

  async render() {
    this.overlay.show(DetailsTemplate(this.app, this.mod));

    // Insert deposit QR code
    if (document.getElementById('qrcode2')) {
      document.querySelector('#qrcode2').style.visibility = 'hidden';
      document.querySelector('#qrcode2').style.opacity = '0';

      document.querySelector('#qrcode2').innerHTML = '';
      this.app.browser.generateQRCode(this.mod.address, 'qrcode2');
      setTimeout(() => {
        document.querySelector('#qrcode2').removeAttribute('style');
      }, 100);
    }

    await this.mod.returnHistory(async (html) => {
      if (html != '') {
        document.querySelector('.mixin-txn-his-container .saito-table-body').innerHTML = html;
      } else {
        document.querySelector('.mixin-txn-his-container .saito-table-body').innerHTML =
          `<p class="mixin-no-history">No account history found for ${this.mod.ticker}</p>`;

        document.querySelectorAll('.pagination-button').forEach(function (btn, key) {
          btn.classList.add('disabled');
        });
      }
    });

    this.loader.remove();
    this.attachEvents();
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

    if (this.mod.ticker == 'SAITO') {
      document.querySelector('.pagination-container').style.display = 'none';
    }
  }
}

module.exports = Details;
