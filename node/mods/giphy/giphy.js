/*

This module requires a gifphy API key to be set as an environmental variable:
GIPHY_KEY

Modules must provide an input id to attach the gif selector to.

Modules can also provide a callback to determine how the image (url) is processed.

*/
const SaitoOverlay = require('./../../lib/saito/ui/saito-overlay/saito-overlay');
const saitoGifTemplate = require('./lib/giphy.template');
const SaitoLoader = require('./../../lib/saito/ui/saito-loader/saito-loader');
const ModTemplate = require('../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;

class Giphy extends ModTemplate {
  constructor(app, mod, input_id, parent_callback = null) {
    super(app);
    this.app = app;
    this.mod = mod;
    this.name = 'Giphy';
    this.slug = 'giphy';
    this.input_id = input_id;
    this.parent_callback = parent_callback;
    this.overlay = new SaitoOverlay(app, mod);
    this.loader = new SaitoLoader(app, mod);
    this.auth = null;

    this.gf = null;

    this.styles = ['/giphy/style.css'];
  }

  async initialize(app) {
    await super.initialize(app);
  }

  async render() {
    const giphyFetchPkg = require('@giphy/js-fetch-api');
    const GiphyFetch =
      giphyFetchPkg?.GiphyFetch || giphyFetchPkg?.default?.GiphyFetch || giphyFetchPkg?.default;

    let giphy_self = this;

    //
    //Calculate reasonable sizing of results
    //
    this.selectorWidth = window.innerWidth;
    if (this.container) {
      let container = document.querySelector(this.container);
      if (container) {
        this.selectorWidth = container.getBoundingClientRect().width;
      }
    }

    this.selectorColumns = 3;

    if (this.selectorWidth > 525) {
      this.selectorWidth = 500 + (this.selectorWidth - 500) / 2;
    }
    if (this.selectorWidth > 750) {
      this.selectorWidth = 750;
    }
    this.selectorColumns = Math.floor(this.selectorWidth / 150);

    //
    // Initiate the Giphy search service
    //
    if (!this.auth) {
      console.warn('Giphy auth key not loaded yet');
      return;
    }

    if (!GiphyFetch) {
      console.error('Giphy library import failed: GiphyFetch export not found');
      return;
    }

    if (!this.gf || this.gf.apiKey === null) {
      this.gf = new GiphyFetch(this.auth);
    }

    if (this.container) {
      if (!document.querySelector('.saito-gif-container')) {
        this.app.browser.addElementToSelector(saitoGifTemplate(this.app, this.mod), this.container);
      }
    } else {
      this.overlay.show(saitoGifTemplate(this.app, this.mod));
    }

    //this.loader.render(this.app, this.mod, "saito-gif-content");
    this.attachEvents();
  }

  returnServices() {
    let services = [];
    if (this.app.BROWSER == 0) {
      services.push(new PeerService(null, 'giphy'));
    }

    return services;
  }

  onPeerServiceUp(app, peer, service = {}) {
    if (this.app.BROWSER == 1) {
      let gif_self = this;

      if (service.service === 'giphy') {
        app.network.sendRequestAsTransaction(
          'get giphy auth',
          {},
          function (res) {
            gif_self.auth = res;
            // If UI is already opened, render once auth arrives.
            if (gif_self.container || document.querySelector('.saito-gif-container')) {
              gif_self.render();
            }
          },
          peer.publicKey
        );
      }
    }
  }

  respondTo(type, obj = null) {
    let giphy_self = this;
    if (type === 'giphy') {
      this.attachStyleSheets();
      return {
        renderInto: (container, callback) => {
          giphy_self.container = container;
          giphy_self.parent_callback = callback;
          giphy_self.render();
        }
      };
    }

    return super.respondTo(type, obj);
  }

  toDataURL = (url) =>
    fetch(url)
      .then((response) => response.blob())
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      )
      .catch((err) => {
        console.error('Error fetching content: ' + err);
        return '';
      });

  attachEvents(auth) {
    let giphy_self = this;
    let gif_search_icon = document.querySelector('.saito-gif-search i');
    let gif_input_search = document.querySelector('.saito-gif-search input');
    let gif_content = document.querySelector('.saito-gif-content');

    if (!gif_content) {
      return;
    }

    const onGifClick = (gif) => {
      if (this.parent_callback) {
        this.parent_callback(gif.images.original.url);
      }
      this.overlay.remove();
    };

    const searchGif = async (value) => {
      gif_content.classList.remove('results');
      gif_content.innerHTML = '<div class="giphy-loader">Loading...</div>';

      try {
        const res = await this.gf.search(value || 'inception', { limit: 24, offset: 0 });
        const gifs = res?.data || [];

        if (!gifs.length) {
          gif_content.innerHTML = '<div class="giphy-loader">No GIFs found</div>';
          return;
        }

        gif_content.innerHTML = '';
        gif_content.classList.add('results');
        gif_content.style.gridTemplateColumns = `repeat(${Math.max(1, giphy_self.selectorColumns)}, minmax(120px, 1fr))`;

        gifs.forEach((gif) => {
          const img = document.createElement('img');
          img.src =
            gif?.images?.fixed_width_small?.url ||
            gif?.images?.fixed_width?.url ||
            gif?.images?.original?.url;
          img.alt = gif?.title || 'gif';
          img.loading = 'lazy';
          img.onclick = () => onGifClick(gif);
          gif_content.appendChild(img);
        });
      } catch (err) {
        console.error('Giphy search failed', err);
        gif_content.innerHTML = '<div class="giphy-loader">Failed to load GIFs</div>';
      }
    };

    if (gif_search_icon) {
      gif_search_icon.onclick = () => {
        const value = gif_input_search?.value || '';
        searchGif(value);
      };
    }

    //add focus to search bar
    if (gif_input_search) {
      gif_input_search.oninput = (e) => {
        let value = gif_input_search.value;
        console.log(gif_input_search.value, 'giphy search value');
        searchGif(value);
      };

      gif_input_search.onclick = (e) => {
        e.currentTarget.select();
      };

      if (!this.app.browser.isMobileBrowser()) {
        gif_input_search.focus({ focusVisible: true });
      }
    }

    searchGif('inception');
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return 0;
    }
    let message = tx.returnMessage();
    if (message?.request === 'get giphy auth') {
      let api_key = '';
      try {
        api_key = process.env.GIPHY_KEY;
        if (mycallback) {
          mycallback(api_key);
          return 1;
        }
      } catch (err) {
        console.log('Failed to find key with error: ' + err);
      }
    }
    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }
}

module.exports = Giphy;
