const fs = require('fs');
const path = require('path');
const HomePage = require('./index');
const SaitoCalendarEvent = require('./../saito/ui/saito-calendar/saito-calendar-event-link');

const JSON = require('json-bigint');

class ModTemplate {
  constructor(app, mod) {
    this.app = app || {};
    this.description = '';
    this.dirname = '';
    this.appname = '';
    this.name = '';
    this.dbname = ''; // slug by default
    this.slug = '';
    this.link = '';
    this.img = ''; // usually link or base64 image
    this.teaser = false; // teaser module, non-function but displays in arcade/appstore w/ install link
    this.events = []; // events to which i respond
    this.renderIntos = {};
    this.alerts = 0;
    this.categories = '';
    this.sqlcache = {};
    this.sqlcache_enabled = 0;
    this.shortlinks_enabled = 0;
    this.shortlink_cache = {};
    this.services = [];
    this.components = []; // modules or UI objects
    this.request_no_interrupts = false; // if you don't want your module to have other modules insert HTML components, you can request it here.
    this.db_tables = [];
    this.urlpath = [];

    this.version = 1.0;
    this.meta = [];
    this.styles = [];
    this.scripts = [];

    this.includes_attached = 0;

    this.eventListeners = [];

    this.theme_options = {
      dark: 'fa-solid fa-moon'
    };

    this.processedTxs = {};

    this.parameters = {};

    // A module which wishes to be rendered in the client can either define
    // it's own webServer function or simply include it's own web directory
    // which will automatically be served by the Saito Core's server.
    // If neither exist, it will default to a blank page distinct from the 404 not found
    this.default_html = 1;

    // browser active will be set by Saito Client if the module name matches
    // the current path. e.g. when the user is at /chat, chat.js which has
    // this.name = "chat", will have this.browser_active = 1;
    this.browser_active = 0;

    // Some modules are "home pages" and serve as a launching pad for other apps
    // We want to remember the user's preferred home (i.e. Arcade or Redsquare) to return
    // them to when exiting a non-home module
    this.possibleHome = 0;

    this.publicKey = '';
    // this.darkModeToggler = new Toggler(app);
  }

  returnServerOrigin() {
    const endpoint = this.app?.options?.server?.endpoint;

    if (!endpoint?.protocol || !endpoint?.host) {
      return '';
    }

    const protocol = endpoint.protocol.replace(/:$/, '');
    const port = endpoint.port ? `:${endpoint.port}` : '';

    return `${protocol}://${endpoint.host}${port}`;
  }

  resolveSocialUrl(value) {
    if (typeof value !== 'string' || value === '') {
      return value;
    }

    if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
      return value;
    }

    const origin = this.returnServerOrigin();

    if (!origin) {
      return value;
    }

    try {
      return new URL(value, `${origin}/`).href;
    } catch {
      return value;
    }
  }

  buildSocial(social = {}) {
    const resolved = { ...social };

    if (Object.prototype.hasOwnProperty.call(resolved, 'url')) {
      resolved.url = this.resolveSocialUrl(resolved.url);
    }

    if (Object.prototype.hasOwnProperty.call(resolved, 'image')) {
      resolved.image = this.resolveSocialUrl(resolved.image);
    }

    return resolved;
  }

  ////////////////////////////
  // Extend these Functions //
  ////////////////////////////
  //
  // INSTALL MODULE
  //
  // this callback is run the first time the module is loaded. You
  // can override this callback in your module if you would like,
  // but should be a bit careful to include this line at the top:
  //
  //   await super.installModule(app);
  //
  // ... if you want to keep the default functionality of auto-
  // creating a database with the necessary tables on install
  // if it does not exist.
  //
  async installModule(app) {
    if (this.app.BROWSER === 1) {
      return;
    }

    //
    // does this require database installation
    //
    let sqldir = `${__dirname}/../../mods/${this.dirname}/sql`;

    let fs = app.storage.returnFileSystem();
    let dbname = encodeURI(this.returnSlug());
    if (this.dbname) {
      dbname = this.dbname;
    }

    if (fs != null) {
      if (fs.existsSync(path.normalize(sqldir))) {
        //
        // get all files in directory
        //
        let sql_files = fs.readdirSync(sqldir).sort();

        for (let i = 0; i < sql_files.length; i++) {
          try {
            let filename = path.join(sqldir, sql_files[i]);
            let data = fs.readFileSync(filename, 'utf8');
            await app.storage.executeDatabase(data, dbname);
          } catch (err) {
            // console.error('installModule Error: ', err);
          }
        }
      }
    }

    await this.installShortlinkDatabase(app);
  }

  async installShortlinkDatabase(app) {
    if (app.BROWSER === 1 || !this.shortlinks_enabled) {
      return;
    }

    const fs = app.storage.returnFileSystem();
    const template_sql = `${__dirname}/sql/shortlinks1.sql`;
    const dbname = this.dbname || encodeURI(this.returnSlug());

    if (fs?.existsSync(template_sql)) {
      try {
        const data = fs.readFileSync(template_sql, 'utf8');
        await app.storage.executeDatabase(data, dbname);
      } catch (err) {
        console.error(`Error installing ${this.returnName()} shortlinks table:`, err);
      }
    }
  }

  static importFunctions() {
    let cls = this.prototype;
    let mixin;
    for (let arg = 0; arg < arguments.length; arg++) {
      mixin = arguments[arg].prototype;
      if (typeof mixin != 'undefined') {
        Object.getOwnPropertyNames(mixin).forEach((prop) => {
          if (prop == 'constructor') return;
          if (Object.getOwnPropertyNames(cls).includes(prop)) {
            console.warn('Module already includes ' + prop);
            return;
          }
          cls[prop] = mixin[prop];
        });
      }
    }
  }

  //
  // INITIALIZE
  //
  // this callback is run every time the module is initialized. It
  // takes care of the events to which we want to listen by default
  // so if you over-write it, be careful to include this line at
  // the top:
  //
  //    await super.initialize(app);
  //
  // that will ensure default behavior appies to inherited modules
  // and the sendEvent and receiveEvent functions will still work
  //
  async initialize(app) {
    this.publicKey = await this.app.wallet.getPublicKey();

    for (let i = 0; i < this.events.length; i++) {
      app.connection.on(this.events[i], (data) => {
        this.receiveEvent(this.events[i], data);
      });
    }

    //
    // Modules can list their dependencies
    // This checks and shows an error that if the dependent module is missing
    // the module may not operate correctly
    //
    if (this.dependencies?.length) {
      for (let om of this.dependencies) {
        if (!this.app.modules.returnModule(om)) {
          console.error(
            `WARNING/ERROR : ${this.name} may not function correctly because ${om} not installed!!!`
          );
        } else {
          //console.info(`${om} successfully installed for ${this.name}`);
        }
      }
    }

    //
    //
    //
    if (app.BROWSER === 1) {
      if (this.browser_active) {
        if (app.browser.returnURLParameter('debug')) {
          console.debug('Dynamically set debug flag true in ' + this.name);
          this.debug = true;
        }
        if (app.options.settings?.debug) {
          console.debug('Set debug flag true from options file ' + this.name);
          this.debug = true;
        }
      }

      //what is this?
      const current_url = window.location.toString();
      const myurl = new URL(current_url);
      const myurlpath = myurl.pathname.split('/');
      this.urlpath = myurlpath;

      //
      // browsers should not handle db tables
      //
      return;
    }

    //
    // create list of tables for auto-db response
    //
    let sqldir = `${__dirname}/../../mods/${this.dirname}/sql`;
    let fs = app?.storage?.returnFileSystem();
    if (fs != null) {
      if (fs.existsSync(path.normalize(sqldir))) {
        //
        // get all files in directory
        //
        let sql_files = fs.readdirSync(sqldir);

        for (let i = 0; i < sql_files.length; i++) {
          //
          // adding table to database
          //
          let tablename = sql_files[i].slice(0, -4);

          //
          // remove digits from end, used as we sometimes
          // use numbers at end of sql file to order indexes
          // or run post-processing on table create and need
          // guaranteed order
          //
          tablename = tablename.replace(/\d+$/, '');

          this.db_tables.push(tablename);
        }
      }
      if (this.enable_shortlinks) {
        this.db_tables.push('shortlinks');
      }
    }

    if (this.appname === '') {
      this.appname = this.name;
    }
  }

  //
  // RENDER
  //
  // adds elements to the DOM and then attaches events to them as needed.
  // this replaces initializeHTML and attachEvents with a single function
  //
  async render() {
    if (this.browser_active && this.possibleHome) {
      this.app.options.homeModule = this.returnName();
      this.app.storage.saveOptions();
    }

    if (this.includes_attached === 0) {
      if (this.meta) {
        this.attachMeta();
      }
      if (this.styles?.length > 0) {
        this.attachStyleSheets();
      }
      if (this.scripts?.length > 0) {
        console.debug('attachScripts in ' + this.name, this.scripts);
        this.attachScripts();
      }
      if (this.postScripts?.length > 0) {
        this.attachPostScripts();
      }

      this.includes_attached = 1;
    }

    for (let i = 0; i < this.components.length; i++) {
      await this.components[i].render();
    }

    if (this.app.browser.returnURLParameter('event')) {
      let event = JSON.parse(
        this.app.crypto.base64ToString(this.app.browser.returnURLParameter('event'))
      );
      if (!this?.eventOverlay) {
        this.eventOverlay = new SaitoCalendarEvent(this.app, this, event);
        this.eventOverlay.render();
      }
    }
  }

  returnName() {
    if (this.appname) {
      return this.appname;
    }
    if (this.gamename) {
      return this.gamename;
    }
    if (this.name) {
      return this.name;
    }
    return 'Unknown Module';
  }

  returnTitle() {
    if (this.title) {
      return this.title;
    }
    return this.returnName();
  }

  returnImage() {
    if (this.img != '') {
      return this.img;
    }
    return `/saito/img/dreamscape.png`;
  }

  returnBanner() {
    return `/saito/img/dreamscape.png`;
  }

  hasSettings() {
    return false;
  }

  loadSettings() {}

  //
  // INITIALIZE HTML (deprecated by render(app))
  //
  async initializeHTML(app) {}

  //
  // ATTACH EVENTS (deprecated by render(app))
  //
  // this callback attaches the javascript interactive bindings to the
  // DOM, allowing us to incorporate the web applications to our own
  // internal functions and send and receive transactions natively.
  //
  attachEvents(app) {}

  //
  // RECEIVE NFT
  //
  // this callback is run whenever a module receives an NFT that indicates it is owned
  // or controlled by the module in question. Override this to implement custom-code
  // that examines the NFT and determines how-and-if it should be used.
  //
  receiveNFT(nft = null) {}

  //
  // ON CONFIRMATION
  //
  // this callback is run every time a block receives a confirmation.
  // this is where the most important code in your module should go,
  // listening to requests that come in over the blockchain and replying.
  //
  // By convention Saito Core will fire the onConfirmation for any modules
  // whose name matches tx.msg.module. Other modules which are also interested
  // in those transcations can also subscribe to those confirmations by
  // by using shouldAffixCallbackToModule.
  //
  async onConfirmation(blk, tx, confnum) {}

  //
  // some UI elements may provide special display options for modules which
  // have pending actions that require user review or action, such as Redsquare
  // with Tweets, or Games with pending game moves from the player.
  //
  returnNumberOfNotifications() {
    return 0;
  }

  //
  //
  // ON NEW BLOCK
  //
  // this callback is run every time a block is added to the longest_chain
  // it differs from the onConfirmation function in that it is not linked to
  // individual transactions -- i.e. it will only be run once per block, while
  // the onConfirmation function is run by every TRANSACTION tagged as
  // this is where the most important code in your module should go,
  // listening to requests that come in over the blockchain and replying.
  //
  onNewBlock(blk, lc) {}

  //
  //
  //
  // ON CHAIN REORGANIZATION
  //
  // this callback is run everytime the chain is reorganized, for every block
  // with a status that is changed. so it is invoked first to notify us when
  // longest_chain is set to ZERO as we unmark the previously dominant chain
  // and then it is run a second time setting the LC to 1 for all of the
  // blocks that are moved (back?) into the longest_chain
  //
  onChainReorganization(block_id, block_hash, lc) {}

  //
  //
  //
  // ON (WALLET) UPGRADE
  //
  // this function runs if the wallet is upgraded or reset
  //
  async onUpgrade(type = '', privatekey = '', walletfile = null) {
    this.publicKey = await this.app.wallet.getPublicKey();
  }

  //
  //
  //
  // ON PEER HANDSHAKE COMPLETE -- deprecated
  //
  // this function runs when a node completes its handshake with another peer
  onPeerHandshakeComplete(app, peer = null) {}

  //
  // ON PEER SERVICE UP
  //
  // this is intended as an initialization function.
  //
  // when a peer connects and completes its handshake, this fires so modules can
  // fetch service-level data like DNS information instead of having to blindly
  // guess or manually examine their peers.
  //
  async onPeerServiceUp(app, peer, service) {}

  //
  //
  // ON CONNECTION STABLE
  //
  // this function runs "connect" event
  onConnectionStable(app, peer) {}

  //
  //
  // ON CONNECTION UNSTABLE
  //
  // this function runs "disconnect" event
  onConnectionUnstable(app, publicKey) {}

  // fires when a stun peer has been disconnected
  onStunPeerDisconnected(app, peer_index = null, public_key) {}

  //
  // SHOULD AFFIX CALLBACK TO MODULE
  //
  // sometimes modules want to run the onConfirmation function for transactions
  // that belong to OTHER modules. onConfirmation will be fired automatically
  // for any module whose name matches tx.msg.module. Other modules who are
  // interested in those transactions can use this method to subscribe to those
  // onConfirmation events. See onConfirmation for more details.
  //
  // An example is a server that wants to monitor
  // AUTH messages, or a module that needs to parse third-party email messages
  // for custom data processing.
  //
  shouldAffixCallbackToModule(modname, tx = null) {
    if (modname === this.name) {
      return 1;
    }
    return 0;
  }

  //
  // SERVER
  //
  // this callback allows the module to serve pages through the main application
  // server, by listening to specific route-requests and serving data from its own
  // separate web directory.
  //
  // This can be overridden to provide advanced interfaces, for example you may
  // want to create a module which serves JSON objects as an RESTFUL API. See
  // Express.js for details.
  //
  webServer(app, expressapp, express) {
    //
    // if a web directory exists, we make it broswable if server
    // functionality exists on this machine. the contents of the
    // web directory will be in a subfolder under the client name
    //
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let fs = app?.storage?.returnFileSystem();

    if (fs?.existsSync(webdir)) {
      expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
    } else if (this.default_html) {
      // We don't have a static web directory to serve, but we can generate a basic blank html page

      const mod_self = this;

      expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
        let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

        let html = HomePage(app, mod_self, app.build_number);

        if (!res.finished) {
          res.setHeader('Content-type', 'text/html');
          res.charset = 'UTF-8';
          return res.send(html);
        }
        return;
      });
    }
  }
  registerShortLinkRoutes(app, expressapp, express) {
    if (!this.shortlinks_enabled) {
      return;
    }

    expressapp.get('/' + this.returnSlug() + '/s/:code', async (req, res) => {
      const user_agent = (req.headers['user-agent'] || '').toLowerCase();
      const is_bot =
        /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|linkedinbot|telegrambot|whatsapp/i.test(
          user_agent
        );
      const dbname = this.dbname || this.returnSlug();
      const rows = await this.app.storage.queryDatabase(
        `SELECT * FROM shortlinks WHERE shortlink = $code LIMIT 1`,
        {
          $code: req.params.code
        },
        dbname
      );

      if (!rows || rows.length === 0) {
        res.status(404).sendFile(path.join(__dirname, '../../web/404.html'));
        return;
      }

      const row = rows[0];
      const now = Date.now();

      //
      // bots get Open Graph
      //
      if (is_bot) {
        let social = this.social || {};

        try {
          const resolvedSocial = await this.returnShortLinkSocial(row, req);

          if (resolvedSocial) {
            social = { ...social, ...resolvedSocial };
          }
        } catch (err) {
          console.error(`${this.returnName()} shortlink metadata lookup failed:`, err);
        }

        const title = row.title || social.title || this.returnName();

        const description = social.description || '';

        const image = social.image || '';

        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

        const escapeHTML = (value) => this.app.browser.escapeHTML(String(value || ''));
        const escapedTitle = escapeHTML(title);
        const escapedDescription = escapeHTML(description);
        const escapedImage = escapeHTML(image);
        const escapedUrl = escapeHTML(url);

        res.send(`
		<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>${escapedTitle}</title>

				<meta property="og:title" content="${escapedTitle}">
				<meta property="og:description" content="${escapedDescription}">
				<meta property="og:image" content="${escapedImage}">
				<meta property="og:url" content="${escapedUrl}">
				<meta property="og:type" content="website">

				<meta name="twitter:card" content="summary_large_image">
				<meta name="twitter:title" content="${escapedTitle}">
				<meta name="twitter:description" content="${escapedDescription}">
				<meta name="twitter:image" content="${escapedImage}">

			</head>

			<body>
				${escapedTitle}
			</body>

		</html>
	  `);

        return;
      }

      if (row.expires_at > 0 && row.expires_at < now) {
        res.status(404).send('Shortlink expired');
        return;
      }

      if (row.max_uses > 0 && row.uses >= row.max_uses) {
        res.status(404).send('Shortlink has expired');
        return;
      }

      await this.app.storage.runDatabase(
        `UPDATE shortlinks SET uses = uses + 1 WHERE shortlink = $code`,
        {
          $code: row.shortlink
        },
        dbname
      );

      try {
        const target = new URL(row.link, `${req.protocol}://${req.get('host')}`);
        if (target.hostname !== req.hostname) {
          res.status(400).send('Invalid shortlink target');
          return;
        }
        res.redirect(302, target.href);
      } catch (err) {
        res.status(400).send('Invalid shortlink target');
      }
    });
  }

  // Modules with content-specific links may override the default social card.
  async returnShortLinkSocial(row, req) {
    return null;
  }

  //
  // createShortLink
  //
  // Requests a shortlink from the server that served this page.
  // Returns the shortened URL on success or the original URL on failure.
  //
  async createShortLink(longUrl) {
    if (!this.shortlinks_enabled || !this.app.BROWSER) {
      return longUrl;
    }

    if (this.shortlink_cache[longUrl]) {
      return this.shortlink_cache[longUrl];
    }

    if (!longUrl || typeof longUrl !== 'string') {
      return longUrl;
    }

    let serving_peer = null;

    try {
      let page_host = window.location.hostname.toLowerCase();
      let page_port = window.location.port;
      if (!page_port) {
        page_port = window.location.protocol === 'https:' ? '443' : '80';
      }
      const peers = await this.app.network.getPeers();
      for (let i = 0; i < peers.length; i++) {
        const p = peers[i];
        const peer_host = String(p.host || '').toLowerCase();
        let peer_port = String(p.port || '');
        if (!peer_port || peer_port === '0') {
          peer_port = p.protocol === 'https' ? '443' : '80';
        }
        const host_match =
          peer_host === page_host ||
          ((peer_host === 'localhost' || peer_host === '127.0.0.1') &&
            (page_host === 'localhost' || page_host === '127.0.0.1'));
        if (host_match && peer_port === String(page_port)) {
          serving_peer = p;
          break;
        }
      }
    } catch (err) {
      serving_peer = null;
    }

    if (!serving_peer) {
      return longUrl;
    }

    const request = this.name.toLowerCase() + ' create shortlink';

    return await Promise.race([
      new Promise((resolve) => {
        this.app.network.sendRequestAsTransaction(
          request,

          {
            link: longUrl,
            title: '',
            expires_at: 0,
            max_uses: 0,
            uses: 0
          },

          (res) => {
            if (!res || res.err || !res.shortlink || !res.shortlink.startsWith('/')) {
              resolve(longUrl);
              return;
            }
            this.shortlink_cache[longUrl] = window.location.origin + res.shortlink;
            resolve(window.location.origin + res.shortlink);
          },
          serving_peer.publicKey
        );
      }),

      new Promise((resolve) => {
        setTimeout(() => resolve(longUrl), 8000);
      })
    ]);
  }
  async pruneShortLinks() {
    if (!this.shortlinks_enabled) {
      return;
    }

    const dbname = this.dbname || this.returnSlug();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await this.app.storage.runDatabase(
      `
        DELETE FROM shortlinks
        WHERE created_at < $cutoff
      `,
      {
        $cutoff: cutoff
      },
      dbname
    );
  }

  //
  // UPDATE BLOCKCHAIN SYNC
  //
  // this callback is run to notify applications of the state of
  // blockchain syncing. It will be triggered on startup and with
  // every additional block added.
  //
  updateBlockchainSync(app, current, target) {}

  /////////////////////////
  // MODULE INTERACTIONS //
  /////////////////////////
  //
  // these functions allow your module to communicate and interact with
  // other modules. They automate issuing and listening to events and
  // allow modules to respond to requests from other modules by returning
  // data objects that can be used to update the DOMS managed by other
  // modules.
  //

  //
  // modules may ask other modules to respond to "request_types". The
  // response that they get may or may not be suitable, but if suitable
  // can be used by the requesting module to format data or update
  // its DOM as needed. This is a basic method of providing inter-app
  // interactivity and extensibility.
  //
  addScript(s) {
    for (let i = 0; i < this.scripts.length; i++) {
      if (this.scripts[i] === s) {
        return;
      }
    }
    this.scripts.push(s);
  }

  addStyle(s) {
    for (let i = 0; i < this.styles.length; i++) {
      if (this.styles[i] === s) {
        return;
      }
    }
    this.styles.push(s);
  }

  addComponent(obj) {
    for (let i = 0; i < this.components.length; i++) {
      if (this.components[i] === obj) {
        return;
      }
    }
    this.components.push(obj);
  }

  removeComponent(obj) {
    for (let i = this.components.length; i >= 0; i--) {
      if (this.components[i] === obj) {
        this.components.splice(i, 1);
      }
    }
  }

  //
  //
  // a convenient function that lets other modules know you can or
  // cannot render into them on request. this is used to generate a
  // list of modules for creation of things like menu components where
  // the actual rendering happens post content selection.
  //
  canRenderInto(querySelector = '') {
    return false;
  }

  //
  //
  // modules may ask other modules if they want to insert any components
  // into a UI element like "appspace". This provides a simple way for
  // modules to respond. the expectation is that any UI Components are
  // created by the receiving module and the querySelector is provided
  // to them as a container so they render properly into the right
  // component.
  //
  // modules should cache components in this.renderIntos and render()
  // existing components rather than new ones to avoid the creation of
  // multiple components with parallel event-listeners, etc.
  //
  async renderInto(querySelector = '') {
    return null;
  }

  //
  //
  // modules may ask other modules to respond to "request_types". The
  // response that they get may or may not be suitable, but if suitable
  // can be used by the requesting module to format data or update
  // its DOM as needed. This is a basic method of providing inter-app
  // interactivity and extensibility.
  //
  respondTo(request_type = '', obj) {
    return null;
  }

  //
  // DEPRECATED -- port to app.connection.on('event', function...
  //
  // when an event to which modules are listening triggers, we push the
  // data out into this function, which can be overridden as needed in
  // order to
  //
  receiveEvent(eventname, data) {}

  //
  // DEPRECATED -- port to app.connection.emit('event', {});
  //
  // you probably don't want to over-write this, it is basicaly just
  // simplifying the event-emitting and receiving functionality in the
  // connection class, so that developers can use this without worrying
  // about their own events.
  //
  sendEvent(eventname, data) {
    this.app.connection.emit(eventname, data);
  }

  //
  // HANDLE PEER TRANSACTION
  //
  // if your web application defines a lower-level massage format, it can
  // send and receive data WITHOUT the need for that data to be confirmed
  // in the blockchain. See our search module for an example of this in
  // action. This is useful for applications that are happy to pass data
  // directly between peers, but still want to use the blockchain for peer
  // discovery (i.e. "what is your IP address" requests)
  //
  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }
    let txmsg;
    try {
      txmsg = tx.returnMessage();
    } catch (err) {
      //
      // see error message below, we have run into odd webpack issues
      // here so are leaving a visible and obvious error indicator here
      // to catch any problems.
      //
      // console.log(
      //   '!!@@!@#!#!@#!@#\n!!@@!@#!#!@#!@#\n!!@@!@#!#!@#!@#\n',
      //   JSON.parse(JSON.stringify(tx))
      // );
      // console.error('ModTemplate [HPT] ERROR: ', err);

      return 0;
    }

    //
    // load (legacy modules)
    //
    for (let i = 0; i < this.db_tables.length; i++) {
      let expected_request = this.name.toLowerCase() + ' load ' + this.db_tables[i];
      if (txmsg?.request === expected_request) {
        console.trace('expected_request : ' + expected_request);
        let select = txmsg.data?.select;
        let dbname = txmsg.data?.dbname;
        let tablename = txmsg.data?.tablename;
        let where = txmsg.data?.where;

        if (!/^[a-z"`'=_*()\.\n\t\r ,0-9A-Z]+$/.test(select)) {
          return;
        }
        if (!/^[a-z"`'=_()\. ,0-9A-Z]+$/.test(dbname)) {
          return;
        }
        if (!/^[a-z"`'=_()\. ,0-9A-Z]+$/.test(tablename)) {
          return;
        }

        let sql = `SELECT ${select}
                   FROM ${tablename}`;
        if (where !== '') {
          sql += ` WHERE ${where}`;
        }
        let params = {};
        let rows = await this.app.storage.queryDatabase(sql, params, dbname);

        let res = {};
        res.err = '';
        res.rows = rows;

        if (mycallback) {
          mycallback(res);
          return 1;
        }

        return 0;
      }
    }

    //
    // odd error previously if referencing txmsg.request directly
    // webpack seems to struggle for some reason. suggest extracting
    // value and then running a string comparison this way.
    //
    let txreq = txmsg.request;
    if (txreq === 'rawSQL') {
      if (txmsg?.data?.module === this.name) {
        let sql = txmsg?.data?.sql;
        let dbname = txmsg?.data?.dbname;
        let params = {};
        let rows;

        if (this.sqlcache[sql] && this.sqlcache_enabled === 1) {
          rows = this.sqlcache[sql];
        } else {
          rows = await this.app.storage.queryDatabase(sql, params, dbname);
          if (this.sqlcache_enabled) {
            this.sqlcache[sql] = rows;
          }
        }

        let res = {};
        res.err = '';
        res.rows = rows;

        if (mycallback) {
          mycallback(res);
          return 1;
        }

        return 0;
      }
    }

    //
    // shortlinks — create
    //
    if (this.shortlinks_enabled) {
      const expected_request = this.name.toLowerCase() + ' create shortlink';

      if (txmsg?.request === expected_request) {
        console.log('### SHORTLINK REGISTRATION ####');
        console.log('### SHORTLINK REGISTRATION ####');
        console.log('### SHORTLINK REGISTRATION ####');

        if (!mycallback) {
          return 0;
        }

        const data = txmsg.data || {};

        if (!data.link || typeof data.link !== 'string') {
          mycallback({
            err: 'invalid_link',
            shortlink: '',
            code: '',
            expires_at: 0
          });
          return 1;
        }

        const dbname = this.dbname || this.returnSlug();
        console.log('dbname: ');

        const response = {
          err: 'insert_failed',
          shortlink: '',
          code: '',
          expires_at: Number(data.expires_at) || 0
        };

        for (let attempt = 0; attempt < 5; attempt++) {
          console.log('ATTEMPT !!!!!');
          const code = Math.random().toString(36).substring(2, 10);
          try {
            await this.app.storage.runDatabase(
              `INSERT INTO shortlinks (
                id,
                shortlink,
                link,
                title,
                creator,
                created_at,
                expires_at,
                max_uses,
                uses
              ) VALUES (
                $id,
                $shortlink,
                $link,
                $title,
                $creator,
                $created_at,
                $expires_at,
                $max_uses,
                $uses
              )`,
              {
                $id: code,
                $shortlink: code,
                $link: data.link,
                $title: data.title || '',
                $creator: peer?.publicKey || '',
                $created_at: Date.now(),
                $expires_at: response.expires_at,
                $max_uses: Number(data.max_uses) || 0,
                $uses: Number(data.uses) || 0
              },

              dbname
            );

            response.err = '';
            response.code = code;
            response.shortlink = '/' + this.returnSlug() + '/s/' + code;

            console.log('break!');
            break;
          } catch (err) {
            // collision or insert failure, retry
            console.log('collusion or insert failure!!!!!');
          }
        }

        mycallback(response);

        this.shortlink_prune_counter++;

        if (this.shortlink_prune_counter >= 100) {
          this.shortlink_prune_counter = 0;
          this.pruneShortLinks().catch((err) => {
            console.error(err);
          });
        }

        return 1;
      }
    }

    return 0;
  }

  returnServices() {
    return this.services;
  }

  //
  // PEER DATABASE CHECK
  //
  // this piggybacks on handlePeerRequest to provide automated database
  // row-retrieval for clients who are connected to servers that run the
  // data silos.
  //
  async sendPeerDatabaseRequest(
    dbname,
    tablename,
    select = '',
    where = '',
    peer = null,
    mycallback = null
  ) {
    const message = {};
    message.request = dbname + ' load ' + tablename;
    message.data = {};
    message.data.dbname = dbname;
    message.data.tablename = tablename;
    message.data.select = select;
    message.data.where = where;

    if (peer == null) {
      return this.app.network.sendRequestAsTransaction(
        message.request,
        message.data,
        function (res) {
          return mycallback(res);
        }
      );
    } else {
      return this.app.network.sendRequestAsTransaction(
        message.request,
        message.data,
        function (res) {
          return mycallback(res);
        },
        peer.publicKey
      );
    }
  }

  async sendPeerDatabaseRequestWithFilter(
    modname = '',
    sql = '',
    success_callback = null,
    peerfilter = null
  ) {
    if (sql === '') {
      return;
    }
    if (modname === '') {
      return;
    }
    if (!this.app.modules.returnModule(modname)) {
      console.error(modname + ' not found!');
      return;
    }
    let msg = {};

    msg.request = 'rawSQL';
    msg.data = {};
    msg.data.sql = sql;
    msg.data.module = modname;
    msg.data.dbname = this.app.modules.returnModule(modname).returnSlug();

    this.sendPeerRequestWithFilter(
      () => {
        return msg;
      },
      success_callback,
      peerfilter
    );
  }

  async sendPeerRequestWithServiceFilter(servicename, msg, success_callback = (res) => {}) {
    this.sendPeerRequestWithFilter(
      () => {
        return msg;
      },
      success_callback,
      (peer) => {
        if (peer.services) {
          for (let z = 0; z < peer.services.length; z++) {
            if (peer.services[z].service === servicename) {
              return 1;
            }
          }
        }
      }
    );
  }

  async sendPeerRequestWithFilter(msg_callback = null, success_callback = null, peerfilter = null) {
    let message = msg_callback();

    if (message === null) {
      return;
    }

    let p = await this.app.network.getPeers();
    let peers = [];

    for (let i = 0; i < p.length; i++) {
      if (!peerfilter || peerfilter(p[i])) {
        peers.push(p[i]);
      }
    }

    if (peers.length === 0) {
      console.warn('sendPeerRequestWithFilter found no peers');
      return;
    }

    for (const peer of peers) {
      this.app.network.sendRequestAsTransaction(
        message.request,
        message.data,
        function (res) {
          if (success_callback != null) {
            success_callback(res);
          }
        },
        peer.publicKey
      );
    }
  }

  async sendPeerDatabaseRequestRaw(db, sql, mycallback = null) {
    const message = {};

    message.request = 'rawSQL';
    message.data = {};
    message.data.sql = sql;
    message.data.dbname = db;
    message.data.module = this.name;

    return this.app.network.sendRequestAsTransaction(message.request, message.data, function (res) {
      //JSON.stringify("callback data1: " + JSON.stringify(res));
      return mycallback(res);
    });
  }

  activateModule() {
    if (!this.app.BROWSER) {
      console.error('Attempting to set browser_active on a non-browser node!');
      return;
    }
    this.browser_active = 1;
    this.alerts = 0;
  }

  isSlug(slug) {
    return slug == this.returnSlug();
  }

  returnSlug() {
    if (this.slug !== '') {
      return this.slug;
    } else {
      if (this.appname) {
        this.slug = this.appname.toLowerCase();
      } else {
        this.slug = this.name.toLowerCase();
      }
      this.slug = this.slug.replace(/\t/g, '_').replace(/\ /g, '');
      return this.slug;
    }
  }

  returnLink() {
    if (this.link !== '') {
      return this.link;
    } else {
      this.link = '/' + this.returnSlug();
      return this.link;
    }
  }

  showAlert() {
    this.alerts++;
    try {
      let qs = '#' + this.returnSlug() + ' > .redicon';
      document.querySelector(qs).style.display = 'block';
    } catch (err) {}
  }

  attachMeta() {}

  attachStyleSheets() {
    if (this.stylesheetAdded === true) return;
    this.styles.forEach((stylesheet) => {
      let should_attach_sheet = true;
      document.querySelectorAll('link').forEach((el) => {
        try {
          if (el?.rel === 'stylesheet' && el.attributes.href.nodeValue.includes(stylesheet)) {
            should_attach_sheet = false;
          }
        } catch (err) {}
      });

      if (should_attach_sheet) {
        const s = document.createElement('link');
        s.rel = 'stylesheet';
        s.type = 'text/css';
        s.href = stylesheet + '?v=' + this.app.build_number;
        document.querySelector('head').appendChild(s);
      }
    });
    this.stylesheetAdded = true;
  }

  attachScripts() {
    if (this.scriptsAdded === true) {
      return;
    }
    this.scriptsAdded = true;

    let scriptCount = 0;
    for (let script of this.scripts) {
      let script_attached = false;

      document.querySelectorAll('script').forEach((el) => {
        try {
          if (el.attributes.src.nodeValue === script) {
            script_attached = true;
          }
        } catch (err) {}
      });
      scriptCount++;
      if (!script_attached) {
        this.attachScript(script);
      }
    }
  }

  attachScript(script) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = script + '?v=' + this.app.build_number;

      s.addEventListener('load', () => {
        console.info('Script loaded dynamically');
        resolve();
      });
      s.addEventListener('error', () => {
        console.error('Error loading script');
        reject();
      });
      document.querySelector('head').appendChild(s);
    });
  }

  attachPostScripts() {
    if (this.postScriptsAdded === true) {
      return;
    }
    this.postScripts.forEach((script) => {
      let script_attached = false;
      document.querySelectorAll('script').forEach((el) => {
        try {
          if (el.attributes.src.nodeValue === script) {
            script_attached = true;
          }
        } catch (err) {}
      });
      if (!script_attached) {
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.src = script;
        s.type = 'module';
        document.querySelector('body').appendChild(s);
      }
    });
    this.postScriptsAdded = true;
  }

  removeScripts() {
    this.scripts.forEach((script) => {
      console.info('removing script', script);
      // $(`script[src*="${script}"]`).remove();
    });
    this.scriptsAdded = false;
  }

  attachMeta(app) {}

  removeStyleSheets(app) {
    this.stylesheets.forEach((stylesheet) => {
      console.info('removing stylesheet ', stylesheet);
      // $(`link[rel=stylesheet][href~="${stylesheet}"`).remove();
    });

    this.stylesheetAdded = false;
  }

  removeMeta() {}

  removeEvents() {
    this.eventListeners.forEach((eventListener) => {
      document.removeEventListener(eventListener.type, eventListener.listener);
    });
  }

  destroy(app) {
    console.trace('destroying');
    // this.removeMeta();
    // this.removeStyleSheets();
    // this.removeHTML();
    // this.removeScripts();
    // this.removeEvents();
    // this.stylesheets = null;
    // this.stylesheetAdded = false;
    // this.scriptsAdded = false;
    // this.browser_active = 0;
  }

  displayModal(modalHeaderText, modalBodyText = '') {
    //salert is not async!
    salert(`${modalHeaderText}${modalBodyText ? ': <br>' : ''}${modalBodyText}`);
  }

  displayWarning(warningTitle, warningText = '', time = 4000) {
    let html = `<div class="game_warning_overlay">
                  <div class="game_warning_header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="game_warning_timer" >Auto close in <span id="clock_number">${Math.ceil(
                      time / 1000
                    )}</span>s</div> 
                  </div>
                  <h2>${warningTitle}</h2>
                  <p ${
                    warningText.length == 0 ? "style='flex:1;'" : "style='flex:2;'"
                  }>${warningText}</p>
                </div>`;

    let overlay_self = this.overlay;
    let timeouthash = null,
      intervalHash = null;
    if (time > 0) {
      timeouthash = setTimeout(() => {
        overlay_self.hide();
        clearInterval(intervalHash);
      }, time);
      intervalHash = setInterval(() => {
        time -= 250;
        try {
          document.getElementById('clock_number').innerHTML = Math.ceil(time / 1000);
        } catch (err) {}
      }, 250);
    }

    this.overlay.show(html, () => {
      if (timeouthash) {
        clearTimeout(timeouthash);
      }
      if (intervalHash) {
        clearInterval(intervalHash);
      }
    });
  }

  hasSeenTransaction(tx, blk = null) {
    let blk_id = 0;
    if (blk && blk.id !== undefined && blk.id !== null) {
      blk_id = Number(blk.id);
    }

    let hashed_data = this.name + tx.signature;
    if (this.processedTxs[hashed_data] !== undefined) {
      if (this.processedTxs[hashed_data]) {
        console.debug(
          'prevent processing duplicated on chain transaction : ',
          tx.from[0]?.publicKey,
          tx.returnMessage(),
          this.processedTxs[hashed_data],
          blk_id
        );
      }

      this.processedTxs[hashed_data] = blk_id;
      return true;
    }
    this.processedTxs[hashed_data] = blk_id;

    return false;
  }

  getWebsocketPath() {
    return '';
  }

  onWebSocketServer(wss) {
    // wss.on('connection', (socket, request) => {
    //  socket.on('message', (msg) => {
    //  });
    //  socket.on('close', () => {});
    //  socket.on('error', (err) => {});
    // });
  }
}

module.exports = ModTemplate;
