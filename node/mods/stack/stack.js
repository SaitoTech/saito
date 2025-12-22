const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const SaitoOverlay = require('../../lib/saito/ui/saito-overlay/saito-overlay');
const Transaction = require('../../lib/saito/transaction').default;
const JSON = require('json-bigint');
const path = require('path');
const HomePage = require('./index');
const StackMain = require('./lib/ui/main');
const ExploreOverlay = require('./lib/ui/overlay/explore');
const CreatePost = require('./lib/ui/create-post');

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
    this.exploreOverlay = new ExploreOverlay(app, this);
    this.main = new StackMain(app, this, '.saito-container');
    this.create_post_ui = new CreatePost(app, this, '.saito-container');
    this.header = null;

    // Callback for after post creation
    this.callbackAfterPost = null;

    this.styles = ['/saito/saito.css', '/stack/style.css'];
    this.scripts = [];

  }

  ////////////////////////////
  // Initialization        //
  ////////////////////////////
  async initialize(app) {
    await super.initialize(app);
    this.publicKey = await this.app.wallet.getPublicKey();
    
    // Load persistent local UX state
    this.load();
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

    // Render the main component (splash page)
    this.main.render();

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
    const txmsg = tx.returnMessage();
    
    if (txmsg.module !== this.name) {
      return;
    }

    if (Number(conf) == 0) {
      if (txmsg.request === 'create stack post request') {
        console.log('Stack onConfirmation: createStackPost');
        await this.receiveStackPostTransaction(tx, blk);
      }
      // Add other request types here as needed (update, delete, etc.)
    }
  }

  ////////////////////////////
  // Create Stack Post Transaction
  ////////////////////////////
  /**
   * Creates a new stack post transaction and propagates it to the network.
   * 
   * @param {Object} post - The post data object
   * @param {string} post.title - The title of the post (required)
   * @param {string} post.content - The content/body of the post in Markdown format (required)
   * @param {string} post.image - Base64 encoded image data (optional)
   * @param {string} post.imageUrl - URL to an external image (optional)
   * @param {Array<string>} post.tags - Array of tag strings (optional, defaults to empty array)
   * @param {number} post.timestamp - Unix timestamp in milliseconds (optional, defaults to Date.now())
   * @param {string} post.subscriptionTier - Subscription tier: 'free' or 'paid' (optional, defaults to 'free')
   * @param {string} post.excerpt - Short excerpt/summary of the post (optional)
   * @param {Function} callback - Optional callback function to execute after post is confirmed
   * 
   * @returns {Promise<Transaction>} The signed transaction object
   * 
   * Transaction message (tx.msg) structure:
   * {
   *   module: 'Stack',
   *   request: 'create stack post request',
   *   data: {
   *     type: 'stack_post',
   *     title: string,           // Post title
   *     content: string,         // Markdown content
   *     image: string,           // Base64 image data (optional)
   *     images: array,           // JSON of (Base64 image data (optional))
   *     imageUrl: string,        // External image URL (optional)
   *     tags: Array<string>,     // Array of tags
   *     timestamp: number,       // Unix timestamp
   *     subscriptionTier: string, // 'free' or 'paid'
   *     excerpt: string          // Post excerpt (optional)
   *   }
   * }
   */
  async createStackPostTransaction(
    post = {
      title: '',
      content: '',
      image: '',
      images: [] ,
      imageUrl: '',
      tags: [],
      timestamp: Date.now(),
      subscriptionTier: 'free',
      excerpt: ''
    },
    callback
  ) {
    try {
      // Create new transaction
      let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);

      // Validate and sanitize the post data
      const data = {
        type: 'stack_post',
        title: post.title || 'Untitled',
        content: typeof post.content === 'string' ? post.content : JSON.stringify(post.content),
        tags: Array.isArray(post.tags) ? post.tags : [],
        image: post.image || '',
        imageUrl: post.imageUrl || '',
        timestamp: post.timestamp || Date.now(),
        subscriptionTier: post.subscriptionTier || 'free',
        excerpt: post.excerpt || ''
      };

      // Set the transaction message
      newtx.msg = {
        module: this.name,
        request: 'create stack post request',
        data: data
      };

      await newtx.sign();

      await this.app.network.propagateTransaction(newtx);
      if (callback) {
        this.callbackAfterPost = callback;
      }

      return newtx;
    } catch (error) {
      console.error('Error creating stack post transaction:', error);
      this.app.connection.emit('saito-header-update-message', {
        msg: 'Error creating stack post',
        timeout: 2000
      });
      throw error;
    }
  }

  ////////////////////////////
  // Receive Stack Post Transaction
  ////////////////////////////
  /**
   * Handles receiving and processing a stack post transaction.
   * Called automatically when a stack post transaction is confirmed on the network.
   * 
   * @param {Transaction} tx - The confirmed transaction
   * @param {Block} blk - The block containing the transaction
   */
  async receiveStackPostTransaction(tx, blk) {
    let from = tx?.from[0]?.publicKey;
    if (!from) {
      console.error('Stack: Invalid TX');
      return;
    }

    let txmsg = tx.returnMessage();

    let post = { 
      ...txmsg.data, 
      sig: tx.signature, 
      publicKey: tx.from[0].publicKey,
      timestamp: txmsg.data.timestamp || tx.timestamp,
      lastEdited: txmsg.data.timestamp || tx.timestamp
    };

    // Add to cache
    this.postsCache.allPosts.push(post);
    
    // Also cache by author
    if (!this.postsCache.byAuthor.has(from)) {
      this.postsCache.byAuthor.set(from, []);
    }
    this.postsCache.byAuthor.get(from).push(post);

    // Save to app.options.stack.posts for local UX state (only for user's own posts)
    if (tx.isFrom(this.publicKey)) {
      this.load();
      if (!this.app.options.stack.posts) {
        this.app.options.stack.posts = [];
      }
      
      // Check if post already exists (update) or add new
      const existingIndex = this.app.options.stack.posts.findIndex(p => p.sig === post.sig);
      if (existingIndex >= 0) {
        // Update existing post
        this.app.options.stack.posts[existingIndex] = post;
      } else {
        // Add new post
        this.app.options.stack.posts.push(post);
      }
      
      this.save();
    }

    if (this.app.BROWSER) {
      if (tx.isFrom(this.publicKey)) {
        this.app.connection.emit('saito-header-update-message', { msg: '' });
        siteMessage('Stack post published', 1500);
      } else {
        siteMessage(`New stack post by ${this.app.keychain.returnUsername(from)}`, 3000);
      }
    }

    //
    // Save into archives
    //
    await this.app.storage.saveTransaction(tx, { preserve: 1 }, 'localhost', blk);

    if (this.callbackAfterPost) {
      this.callbackAfterPost();
      delete this.callbackAfterPost;
    }
  }

  ////////////////////////////
  // Local State Management //
  ////////////////////////////
  /**
   * Load persistent local UX state from app.options
   * Initializes app.options.stack if it doesn't exist
   * This is CLIENT-SIDE STATE ONLY - not authoritative
   */
  load() {
    if (!this.app.options.stack) {
      this.app.options.stack = {};
    }
    if (!this.app.options.stack.posts) {
      this.app.options.stack.posts = [];
    }
    // Add other default state properties here as needed
    
    return this.app.options.stack;
  }

  /**
   * Save persistent local UX state to app.options
   * Persists app.options.stack using app.storage.saveOptions()
   * This is CLIENT-SIDE STATE ONLY - not authoritative
   */
  save() {
    if (!this.app.options.stack) {
      this.app.options.stack = {};
    }
    this.app.storage.saveOptions();
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

