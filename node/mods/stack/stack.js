const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const SaitoOverlay = require('../../lib/saito/ui/saito-overlay/saito-overlay');
const Transaction = require('../../lib/saito/transaction').default;
const JSON = require('json-bigint');
const path = require('path');
const HomePage = require('./index');
const StackTemplate = require('./lib/stack.template');

//
// Stack - Permissioned Blogging Platform
//
// An open-source alternative to Substack that allows creators to publish
// subscription-based content on the Saito network. Supports:
// - Free and paid subscriptions
// - Permissioned content access
// - Creator monetization
// - Subscriber management
//
class Stack extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Stack';
    this.slug = 'stack';
    this.description = 'Permissioned blogging platform - an open-source alternative to Substack';
    this.categories = 'Social Media Blogging Publishing';
    this.icon_fa = 'fa-solid fa-newspaper';

    this.social = {
      twitter: '@SaitoOfficial',
      title: 'Stack - Permissioned Blogging',
      url: 'https://saito.io/stack',
      description: 'Open-source subscription-based blogging platform',
      image: 'https://saito.tech/wp-content/uploads/2022/04/saito_card.png'
    };

    // Cache for posts and subscriptions
    this.postsCache = {
      byAuthor: new Map(),
      bySubscription: new Map(),
      allPosts: [],
      lastFetch: 0
    };

    this.overlay = new SaitoOverlay(app, this);
    this.header = null;

    this.styles = ['/saito/saito.css', '/stack/style.css'];
    this.scripts = [];

  }

  ////////////////////////////
  // Initialization        //
  ////////////////////////////
  async initialize(app) {
    await super.initialize(app);
    this.publicKey = await this.app.wallet.getPublicKey();
  }

  ////////////////////////////
  // Rendering             //
  ////////////////////////////
  async render(app) {

    if (!this.browser_active) {
      return;
    }

    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);
    this.addComponent(this.header);

    await super.render(this.app, this);

    // Render the splash page
    this.renderSplashPage();

  }

  renderSplashPage() {
    const html = StackTemplate(this.app, this);
    
    const container = document.querySelector('.saito-container');
    if (container) {
      container.classList.add('stack-splash-container');
      this.app.browser.replaceElementBySelector(html, '.saito-container');
      
      setTimeout(() => {
        this.attachSplashEvents();
      }, 50);
    }
  }

  attachSplashEvents() {
    const createBtn = document.querySelector('#stack-create-post-btn');
    if (createBtn) {
      createBtn.onclick = (e) => {
        e.preventDefault();
        console.log('Create Post clicked (placeholder)');
      };
    }

    const getStartedBtn = document.querySelector('#stack-get-started-btn');
    if (getStartedBtn) {
      getStartedBtn.onclick = (e) => {
        e.preventDefault();
        console.log('Get Started clicked (placeholder)');
      };
    }

    const exploreBtn = document.querySelector('#stack-explore-btn');
    if (exploreBtn) {
      exploreBtn.onclick = (e) => {
        e.preventDefault();
        console.log('Explore Available Posts clicked (placeholder)');
        this.showExplorePostsOverlay();
      };
    }

    const toggleSidebarBtn = document.querySelector('#stack-subscriptions-toggle');
    if (toggleSidebarBtn) {
      toggleSidebarBtn.onclick = (e) => {
        e.preventDefault();
        this.toggleSubscriptionsSidebar();
      };
    }
  }

  toggleSubscriptionsSidebar() {
    // Placeholder - will implement sidebar later
    console.log('Toggle subscriptions sidebar (placeholder)');
  }

  showExplorePostsOverlay() {
    // Placeholder - will implement overlay later
    console.log('Show explore posts overlay (placeholder)');
  }


  ////////////////////////////
  // Inter-module Communication //
  ////////////////////////////
  respondTo(type = '', obj) {
    if (type === 'saito-header') {
      let x = [];
      if (!this.browser_active) {
        x.push({
          text: 'Stack',
          icon: this.icon_fa,
          rank: 100,
          type: 'navigation',
          callback: function (app, id) {
            navigateWindow('/stack');
          }
        });
      }
      return x;
    }

    return super.respondTo(type, obj);
  }

  ////////////////////////////
  // Transaction Handling  //
  ////////////////////////////
  async onConfirmation(blk, tx, conf) {

    if (!tx.isTo(this.publicKey) && !tx.isFrom(this.publicKey)) {
      return;
    }

    const txmsg = tx.returnMessage();
    if (txmsg.module !== this.name) {
      return;
    }

  }

  ////////////////////////////
  // Web Server            //
  ////////////////////////////
  webServer(app, expressapp, express, alternative_slug = null) {
    const mod_self = this;
    const webdir = path.resolve(__dirname, '../../mods', this.dirname, 'web');
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    
    // Main Application Route - Serves the HTML Shell generated by index.js
    expressapp.get(uri, async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';
      let updatedSocial = Object.assign({}, mod_self.social);
      updatedSocial.url = reqBaseURL + encodeURI(mod_self.returnSlug());

      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(HomePage(app, mod_self, app.build_number, updatedSocial, []));
    });

    // Serve static files (CSS, JS, images, etc.)
    // Use path.resolve to ensure absolute path for Express static middleware
    expressapp.use(uri, express.static(webdir));
  }
}

module.exports = Stack;

