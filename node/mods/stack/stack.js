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
const { getAccessScriptForIntent } = require('./lib/access/access-scripts');

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

    this.pending_author_load = null;
    this.pending_post_sig = null;
    this.pending_post_pk = null;
    this.pending_post_loaded = null;

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

    // Transaction loading middleware
    // Track peers offering Stack service
    this.peers = {};
    // In-memory cache for fetched transactions, keyed by signature
    this.transactionCache = {};

    // In-memory draft state (single source of truth)
    // Ordered by last-modified DESC (most recent first)
    this.drafts = [];

    // ========================================================================
    // INVARIANT 1: SYSTEM IDENTITY - Canonical identity constants
    // ========================================================================
    // "Saito Official" is a hardcoded system identity that must never be inferred
    // All references to "Saito Official" must use this constant
    // TODO: Replace with actual Saito Official public key when available
    this.STACK_OFFICIAL_PUBLICKEY = 'k73CaRGwgNbqq1prNngSstb9NrfkaJVQwq8onf1oabBz';

    this.overlay = new SaitoOverlay(app, this);
    this.exploreOverlay = new ExploreOverlay(app, this);
    this.main = new StackMain(app, this, '.saito-container');
    this.create_post_ui = new CreatePost(app, this, '.saito-container');
    this.chooseDraftOverlay = null; // Lazy-loaded when needed
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

    // Load persistent local UX state
    this.load();

    // Demo posts generation removed - posts now load from archive
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

    // Discover local drafts (non-blocking, in-memory state)
    this.discoverDrafts().catch((err) => {
      console.error('Stack: Error discovering drafts:', err);
    });

    // ========================================================================
    // URL ROUTING: Parse pathname and route to appropriate view
    // ========================================================================
    const pathname = window.location.pathname;
    const slug = '/' + this.slug;

    // Check if pathname starts with /stack
    if (pathname.startsWith(slug)) {
      // Extract path segments after /stack
      const pathAfterSlug = pathname.substring(slug.length);
      const segments = pathAfterSlug.split('/').filter((seg) => seg.length > 0);

      if (segments.length === 1) {
        // /stack/<publicKey> - Show creator's posts in Explorer
        const publicKey = segments[0];
        this.main.render();
        setTimeout(async () => {
          await this.handleCreatorView(publicKey);
        }, 0);
        return;
      } else if (segments.length === 2) {
        // /stack/<publicKey>/<transactionSignature> - Show specific blog post
        const publicKey = segments[0];
        const transactionSignature = segments[1];
        await this.handlePostView(publicKey, transactionSignature);
        return;
      } else if (segments.length > 2) {
        // Invalid URL - too many segments
        this.handleInvalidURL();
        return;
      }
      // segments.length === 0 means /stack (no additional path) - fall through to default
    }

    // Default: Render the main component (splash page)
    this.main.render();
  }

  ////////////////////////////
  // URL Routing Handlers  //
  ////////////////////////////
  /**
   * Handle creator view: /stack/<publicKey>
   * Shows Explorer overlay with posts from that creator
   */
  async handleCreatorView(publicKey) {
    if (!publicKey) {
      this.handleInvalidURL();
      return;
    }

    // Initialize ExploreOverlay if needed
    if (!this.exploreOverlay) {
      this.exploreOverlay = new ExploreOverlay(this.app, this);
    }

    // Show overlay immediately with loading state
    this.exploreOverlay.isLoading = true;
    this.exploreOverlay.posts = [];
    this.exploreOverlay.currentFilter = 'creator';
    this.exploreOverlay.targetPublicKey = publicKey;
    this.exploreOverlay.render();

    // Load posts for this creator using loadPostsForAuthor
    try {
      const posts = await this.loadPostsForAuthor(publicKey, { forceRemote: true });

      // Update overlay with loaded posts
      this.exploreOverlay.posts = posts;
      this.exploreOverlay.isLoading = false;
      this.exploreOverlay.updatePostsGrid(publicKey);
    } catch (error) {
      console.error('Stack: Error loading creator posts:', error);
      // Show error state
      this.exploreOverlay.isLoading = false;
      this.exploreOverlay.posts = [];
      this.exploreOverlay.updatePostsGrid(publicKey);
    }
  }

  /**
   * Handle blog post view: /stack/<publicKey>/<transactionSignature>
   * Shows ViewPost for the specific transaction
   */
  async handlePostView(publicKey = '', transactionSignature) {
    if (!transactionSignature) {
      this.handleInvalidURL();
      return;
    }

    // Initialize ViewPost if needed (cache for reuse)
    if (!this.viewPostComponent) {
      const ViewPost = require('./lib/ui/view-post');
      this.viewPostComponent = new ViewPost(this.app, this, '.saito-container');
    }

    // Show loading state immediately
    const container = document.querySelector('.saito-container');
    if (container) {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; padding: 4rem 2rem;">
          <i class="fa-solid fa-spinner fa-spin" style="font-size: 3rem; color: var(--saito-font-color-light); margin-bottom: 1rem;"></i>
          <p style="color: var(--saito-font-color-light); font-size: 1.6rem;">Loading blog post for you…</p>
        </div>
      `;
    }

    // Load the transaction by signature
    try {
      const tx = await this.loadPost(transactionSignature, {}, null);

      if (!tx) {
        if (container) {
          if (this.pending_post_sig != '' && this.pending_post_loaded != true) {
            container.innerHTML = `
    <div
      class="stack-post-loading"
      style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.2rem;
        pointer-events: none;
        z-index: 10;
      "
    >
      <div
        class="saito_spinner"
        style="width:8rem;height:8rem;"
      ></div>

      <div
        style="
          font-size: 2.5rem;
          color: var(--saito-font-color-light);
          text-align: center;
        "
      >
        Loading Post from Saito Network
      </div>
    </div>
  `;
          } else {
            container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; padding: 4rem 2rem; text-align: center;">
              <i class="fa-solid fa-exclamation-triangle" style="font-size: 3rem; color: var(--saito-font-color-light); margin-bottom: 1rem;"></i>
              <h3 style="font-size: 2rem; font-weight: 600; color: var(--saito-font-color); margin: 0 0 1rem 0;">Unable to load this blog post</h3>
              <p style="font-size: 1.6rem; color: var(--saito-font-color-light); margin: 0; max-width: 500px; line-height: 1.6;">
                The blog post you're looking for could not be found. It may have been deleted, or you may not have permission to view it.
              </p>
            </div>
            `;
          }
        }
        return;
      }

      // Render the post
      this.viewPostComponent.render(tx);
      this.pending_post_loaded = true;
    } catch (error) {
      console.error('Stack: Error loading blog post:', error);
      // Show error state
      if (container) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; padding: 4rem 2rem; text-align: center;">
            <i class="fa-solid fa-exclamation-triangle" style="font-size: 3rem; color: var(--saito-font-color-light); margin-bottom: 1rem;"></i>
            <h3 style="font-size: 2rem; font-weight: 600; color: var(--saito-font-color); margin: 0 0 1rem 0;">Unable to load this blog post</h3>
            <p style="font-size: 1.6rem; color: var(--saito-font-color-light); margin: 0; max-width: 500px; line-height: 1.6;">
              An error occurred while loading the blog post. Please try again later.
            </p>
          </div>
        `;
      }
    }
  }

  /**
   * Handle invalid URL - show error state
   */
  handleInvalidURL() {
    const container = document.querySelector('.saito-container');
    if (container) {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; padding: 4rem 2rem; text-align: center;">
          <i class="fa-solid fa-exclamation-triangle" style="font-size: 3rem; color: var(--saito-font-color-light); margin-bottom: 1rem;"></i>
          <h3 style="font-size: 2rem; font-weight: 600; color: var(--saito-font-color); margin: 0 0 1rem 0;">Invalid URL</h3>
          <p style="font-size: 1.6rem; color: var(--saito-font-color-light); margin: 0; max-width: 500px; line-height: 1.6;">
            The URL you requested is not valid. Please check the URL and try again.
          </p>
        </div>
      `;
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
  // Service Declaration    //
  ////////////////////////////
  /**
   * Declares Stack service to peers, following RedSquare pattern.
   * Allows peers to advertise Stack capability.
   */
  returnServices() {
    let services = [];
    if (!this.app.BROWSER || this.offerService) {
      services.push(this.app.network.createPeerService(null, 'stack', 'Stack Post Archive'));
    }
    return services;
  }

  ////////////////////////////
  // Peer Management       //
  ////////////////////////////
  /**
   * Called when a peer connects with Stack service capability.
   * Tracks peers that advertise Stack service for future use.
   *
   * @param {Object} app - Saito application instance
   * @param {Object} peer - Peer object
   * @param {Object} service - Service object with service name
   */
  async onPeerServiceUp(app, peer, service = {}) {
    if (service.service === 'stack' || service.service === 'archive') {
      const peerKey = peer?.publicKey || 'unknown';
      this.peers[peerKey] = {
        peer: peer,
        publicKey: peerKey,
        connected: true
      };
    }

    //
    // Archives
    //
    if (service.service === 'archive') {
      if (this.pending_post_sig) {
        let sig = this.pending_post_sig;
        let pk = this.pending_post_pk;
        await this.handlePostView(pk, sig);
        this.pending_post_sig = '';
        this.pending_post_pk = '';
      }
      if (this.pending_author_load) {
        let pk = this.pending_author_load;
        this.pending_author_load = null;
        await this.handleCreatorView(pk);
      }
    }
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

    if (type === 'saito-create-nft') {
      let this_mod = this;

      return {
        title: 'Stack Access NFT',
        class: ['stack'], // This becomes the nft_type parameter for createMintNFTTransaction
        text: 'Stack Access Key',
        createData: async (modfile) => {
          // 100 years by default
          // duration: 3155760000000;
          // duration: 300000; // 5 minutes
          return {
            module: 'Stack',
            duration: 300000
          };
        }
      };
    }

    if (type === 'saito-nft-transfer') {
      let this_mod = this;
      return {
        class: ['stack'],
        onTransfer: async (nft = null, tx = null, receiver = '', data = {}) => {
          console.log('***');
          console.log('***');
          console.log('***');
          console.log('***');
          console.log('***');
          console.log('***');
          console.log('adding routing path to Stack NFT...');

          if (!tx.msg) {
            tx.msg = {};
          }
          if (!tx.msg.data) {
            tx.msg.data = {};
          }

          if (!Array.isArray(tx.msg.data.path)) {
            tx.msg.data.path = [];
          }

          if (!nft?.id) {
            return tx;
          }

          //
          // if we are the creator and this is a subscription, we should
          // sign for the duration of the subscription so that access
          // scripts can reconstruct our signature and import the duration
          // variable used to regulate access.
          //
          if (nft != null && tx.msg.data.path.length == 0) {
            if (nft.returnCreator() == this.publicKey) {
              if (tx.msg.data.duration && !tx.msg.data.duration_sig) {
                let duration = tx.msg.data.duration;
                let binding_hash = nft.id;
                let canonical_string = `${duration}|${binding_hash}`;
                let digest = this.app.crypto.hash(canonical_string);
                let privatekey = await this.app.wallet.getPrivateKey();
                console.log('SIGNING DURATION SIG FOR: ' + digest);
                console.log('SIGNING DURATION SIG W/ BH: ' + binding_hash);
                tx.msg.data.duration_sig = this.app.crypto.signMessage(digest, privatekey);
              }
            }
          }

          let value_obj = {
            timestamp: Date.now(),
            delegate: false
          };

          if (data.delegate == true) {
            value_obj.delegate = true;
          }

          const value_json = JSON.stringify(value_obj);
          const value_b64 = Buffer.from(value_json).toString('base64');

          const canonical_string = `${receiver}|${value_b64}|${nft.id}`;
          const hash_digest = this_mod.app.crypto.hash(canonical_string);
          const privatekey = await this_mod.app.wallet.getPrivateKey();
          const sig = this_mod.app.crypto.signMessage(hash_digest, privatekey);

          tx.msg.data.path.push({
            to: receiver,
            value: value_b64,
            sig: sig
          });

          return tx;
        }
      };
    }

    return super.respondTo(type, obj);
  }

  ////////////////////////////
  // Transaction Handling  //
  ////////////////////////////
  async onConfirmation(blk, tx, conf) {
    const txmsg = tx.returnMessage();

    // Check if transaction is relevant to Stack module
    if (txmsg.module !== this.name) {
      return;
    }

    // Only process initial confirmations (conf == 0)
    if (Number(conf) == 0) {
      if (txmsg.request === 'create stack post request') {
        console.log('Stack onConfirmation: createStackPost');

        // Archive management - SINGLE place managing Stack archive writes
        await this.onReceiveBlogPost(tx, blk);

        // Cache and UI updates
        await this.receiveStackPostTransaction(tx, blk);

        // Clean up pending drafts after successful confirmation (only for user's own posts)
        if (tx.isFrom(this.publicKey)) {
          await this.cleanupPendingDrafts();
        }
      }
      // Add other request types here as needed (update, delete, etc.)
    }
  }

  ////////////////////////////
  // Access Script Pipeline
  ////////////////////////////
  /**
   * Get access script for a publish intent
   *
   * Maps a normalized publish intent to a canonical access script template.
   * Returns null for public posts (no access gate).
   *
   * @param {Object} intent - Publish intent object
   * @param {string} intent.visibility - "public" | "private"
   * @param {string|null} intent.access_mode - null | "transferable" | "non-transferable"
   * @param {Object|null} intent.time_limit - null | { seconds: number }
   * @param {string} intent.author - Public key of the post author
   * @returns {Object|null} Access script object, or null for public posts
   */
  getAccessScriptForPublishIntent(intent) {
    try {
      return getAccessScriptForIntent(intent);
    } catch (error) {
      console.error('Stack: Error getting access script for intent:', error);
      throw error;
    }
  }

  /**
   * Hash an access script using canonicalization
   *
   * Canonicalizes the script JSON to ensure deterministic hashing.
   * Same script object will always produce the same hash.
   *
   * @param {Object|null} script - Access script object, or null
   * @returns {string} Access hash (empty string if script is null)
   */
  hashAccessScript(script) {
    if (script === null || script === undefined) {
      return '';
    }

    const scripting_mod = this.app.modules.returnModule('Scripting');
    if (!scripting_mod) {
      console.warn('Stack: Scripting module not available - cannot hash access script');
      return '';
    }

    // Canonicalize the script to ensure deterministic hashing
    const canonical_script = scripting_mod.canonicalize(script);

    // Hash the canonicalized script
    const access_hash = scripting_mod.hash(canonical_script);

    return access_hash;
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
      images: [],
      imageUrl: '',
      tags: [],
      timestamp: Date.now(),
      subscriptionTier: 'free',
      excerpt: '',
      accessLevel: 'public' // 'public' or 'private'
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
        images: Array.isArray(post.images) ? post.images : [], // Embedded content images array
        tags: Array.isArray(post.tags) ? post.tags : [],
        image: post.image || '', // Teaser/header image (singular, separate)
        imageUrl: post.imageUrl || '',
        timestamp: post.timestamp || Date.now(),
        subscriptionTier: post.subscriptionTier || 'free',
        excerpt: post.excerpt || ''
      };

      // --------------------------------------------------------------------
      // IMAGE INVARIANT ENFORCEMENT
      // Published posts MUST NOT contain raw data:image URLs in markdown.
      // All inline images must be converted to stack:image:<id> references
      // during serialization (editor → markdown).
      // --------------------------------------------------------------------
      if (/!\[[^\]]*\]\(data:image\/[a-zA-Z+]+;base64,/i.test(data.content)) {
        throw new Error(
          'Publish aborted: raw data:image URL found in post content. ' +
            'Images must be published using stack:image:<id> references.'
        );
      }

      // PART 2 — TRANSACTION CREATION CHANGE: Include parent_id if editing
      // If parent_id is provided, this is an edit of an existing post
      if (post.parent_id) {
        data.parent_id = post.parent_id;
      }

      // ------------------------------------------------------------
      // AUTHORITATIVE ACCESS INTENT NORMALIZATION (SUBSCRIPTIONS)
      // ------------------------------------------------------------
      // This MUST run before publishIntent is constructed
      if (post.accessLevel === 'subscription') {
        post.publishIntent = {
          visibility: 'subscription',
          access_mode: post.access_mode || 'transferable',
          time_limit: null,
          author: this.publicKey
        };
      }

      // ========================================================================
      // ACCESS SCRIPT GENERATION: Deterministic pipeline from intent to hash
      // ========================================================================
      // 1. Generate normalized publish intent from post data
      // 2. Map intent to canonical access script template
      // 3. Canonicalize and hash the script
      // 4. Attach access_hash to transaction
      // ========================================================================

      // Generate publish intent (backward compatible with accessLevel string)
      let publishIntent;
      if (post.publishIntent && typeof post.publishIntent === 'object') {
        // New format: normalized intent object
        publishIntent = post.publishIntent;
        // Ensure author is set
        if (!publishIntent.author) {
          publishIntent.author = this.publicKey;
        }
      } else {
        // Legacy format: convert accessLevel string to intent
        const accessLevel = post.accessLevel || 'public';
        publishIntent = {
          visibility: accessLevel,
          access_mode: accessLevel === 'subscription' ? post.access_mode || 'transferable' : null,
          time_limit: null,
          author: this.publicKey
        };
      }

      console.log('PUBLISH INTENT:', publishIntent);

      // Get access script for intent
      let access_script = null;
      let access_hash = '';

      try {
        access_script = this.getAccessScriptForPublishIntent(publishIntent);

        // Initialize msg object if needed
        if (!newtx.msg) {
          newtx.msg = {};
        }

        if (access_script !== null) {
          // Private post: Hash the script and attach access_hash
          access_hash = this.hashAccessScript(access_script);

          if (access_hash) {
            // Canonicalize script for optional local storage (debugging only)
            const scripting_mod = this.app.modules.returnModule('Scripting');
            if (scripting_mod) {
              const canonical_script = scripting_mod.canonicalize(access_script);
              // Store canonicalized script locally for debugging (not required for access)
              newtx.msg.access_script = canonical_script;
            }
            newtx.msg.access_hash = access_hash;
          }
        } else {
          // Public post: access_hash must be ABSENT, not null
          // Explicitly delete if it exists (e.g., switching from private to public)
          if (newtx.msg.access_hash !== undefined) {
            delete newtx.msg.access_hash;
          }
          // Also remove access_script if present
          if (newtx.msg.access_script !== undefined) {
            delete newtx.msg.access_script;
          }
        }
      } catch (error) {
        console.error('Stack: Error generating access script:', error);
        // Fail safely: for public posts, ensure access_hash is absent
        if (!newtx.msg) {
          newtx.msg = {};
        }
        // If visibility is public, ensure access_hash is deleted
        if (publishIntent.visibility === 'public') {
          if (newtx.msg.access_hash !== undefined) {
            delete newtx.msg.access_hash;
          }
        }
      }

      // Set the transaction message
      newtx.msg = {
        ...newtx.msg,
        module: this.name,
        request: 'create stack post request',
        data: data
      };

      await newtx.sign();

      siteMessage('Publishing...', 3000);
      await this.app.network.propagateTransaction(newtx);

      if (callback) {
        this.callbackAfterPost = callback;
      }

      return newtx;
    } catch (error) {
      console.error('Error creating stack post transaction:', error);
      siteMessage('Unable to create post transaction', 3000);
      throw error;
    }
  }

  ////////////////////////////
  // Logical Post Identity Helper
  ////////////////////////////
  /**
   * Returns the canonical logical post ID for a transaction.
   *
   * A Stack post is a LOGICAL OBJECT WITH REVISIONS, not a single transaction.
   * Multiple transactions can represent the same logical post:
   * - Root post: signature = sigA, parent_id = null → logical ID = sigA
   * - Edited post: signature = sigAA, parent_id = sigA → logical ID = sigA
   *
   * This is the AUTHORITATIVE definition of logical post identity.
   * Do NOT re-derive this logic elsewhere.
   *
   * @param {Transaction} tx - The transaction to get logical post ID for
   * @returns {string} The logical post ID (parent_id for revisions, signature for roots)
   */
  getLogicalPostId(tx) {
    if (!tx) {
      throw new Error('getLogicalPostId: tx is required');
    }

    try {
      const txmsg = tx.returnMessage();
      const parent_id = txmsg?.data?.parent_id || null;

      // Logical post identity = parent_id || signature
      // For revisions: use parent_id (the root post signature)
      // For root posts: use their own signature
      return parent_id || tx.signature;
    } catch (error) {
      // Fallback to signature if message parsing fails
      console.warn('Stack: Error computing logical post ID, falling back to signature:', error);
      return tx.signature || '';
    }
  }

  /**
   * Returns the canonical logical post ID for a cached post object.
   *
   * Cached post objects have { sig, parent_id, ... } structure.
   * This uses the same logical post identity rule as getLogicalPostId(tx).
   *
   * @param {Object} post - The cached post object with sig and parent_id fields
   * @returns {string} The logical post ID (parent_id for revisions, sig for roots)
   */
  getLogicalPostIdFromPost(post) {
    if (!post) {
      throw new Error('getLogicalPostIdFromPost: post is required');
    }

    // Logical post identity = parent_id || sig
    // For revisions: use parent_id (the root post signature)
    // For root posts: use their own signature
    return post.parent_id || post.sig || '';
  }

  ////////////////////////////
  // Receive Stack Post Transaction
  ////////////////////////////
  ////////////////////////////
  // Archive Handler for Blog Posts
  ////////////////////////////
  /**
   * Handles archive management for Stack blog posts.
   * This is the SINGLE place managing Stack archive writes.
   *
   * For revisions (parent_id exists):
   * - Deletes older revisions with same (author, parent_id)
   * - Saves latest revision with preserve = 1
   *
   * For root posts (parent_id is null):
   * - Saves with preserve = 1
   *
   * @param {Transaction} tx - The confirmed transaction
   * @param {Block} blk - The block containing the transaction
   */
  async onReceiveBlogPost(tx, blk) {
    // PART 4 — SAFETY CHECKS
    // Fail silently if tx is malformed
    if (!tx || !tx.msg || !tx.from || !tx.from[0]) {
      return;
    }

    const txmsg = tx.returnMessage();

    // Never touch non-Stack transactions
    if (txmsg.module !== this.name || txmsg.request !== 'create stack post request') {
      return;
    }

    // Never delete drafts or pending posts (only handle confirmed posts)
    // This function is only called from onConfirmation, so we're safe here
    // But we check field4 to ensure we only handle 'stack:post' status
    if (txmsg.data?.type !== 'stack_post') {
      return;
    }

    // Extract required data
    const author = tx.from[0].publicKey;
    const signature = tx.signature;
    const parent_id = txmsg.data?.parent_id || null;

    // Prepare archive metadata
    const archiveData = {
      field1: 'Stack', // Explicitly set (though may be auto-set)
      field2: author,
      field4: 'stack:post',
      field5: parent_id || '', // Empty string for root posts, parent_id for revisions
      preserve: 1
    };

    // Set owner field for private posts (required for access_hash enforcement)
    // If access_hash exists, this is a private post and needs owner set
    // Check both txmsg.access_hash (from returnMessage) and tx.msg.access_hash (direct)
    const access_hash = txmsg.access_hash || tx.msg?.access_hash;
    if (access_hash) {
      archiveData.owner = access_hash;
    }

    // If parent_id EXISTS: delete older revisions
    if (parent_id) {
      // Query local archive for existing Stack posts where:
      // - field2 = author
      // - field5 = parent_id
      // Never delete transactions from non-local peers
      const olderRevisions = await new Promise((resolve) => {
        this.app.storage.loadTransactions(
          {
            field1: 'Stack',
            field2: author,
            field4: 'stack:post',
            field5: parent_id
          },
          (txs) => {
            resolve(txs || []);
          },
          'localhost' // CRITICAL: Only query localhost, never remote peers
        );
      });

      // Delete ALL matches (these are older revisions)
      for (const oldTx of olderRevisions) {
        // Don't delete the current transaction if it's already in archive
        if (oldTx.signature !== signature) {
          try {
            // Never delete transactions from non-local peers
            await this.app.storage.deleteTransaction(oldTx, null, 'localhost');
          } catch (error) {
            console.warn('Stack: Error deleting older revision:', error);
            // Fail silently - continue with save
          }
        }
      }
    }

    // Save the new transaction to the local archive
    // Do NOT save multiple revisions locally
    // Do NOT retain history locally
    try {
      await this.app.storage.saveTransaction(tx, archiveData, 'localhost', blk);
    } catch (error) {
      console.warn('Stack: Error saving blog post to archive:', error);
      // Fail silently
    }
  }

  ////////////////////////////
  // Receive Stack Post Transaction
  ////////////////////////////
  /**
   * Handles receiving and processing a stack post transaction.
   * Called automatically when a stack post transaction is confirmed on the network.
   * Handles caching and UI updates only - archive management is in onReceiveBlogPost().
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

    // Extract parent_id from transaction data (source of truth)
    const parent_id = txmsg.data?.parent_id || null;

    let post = {
      ...txmsg.data,
      sig: tx.signature,
      publicKey: tx.from[0].publicKey,
      timestamp: txmsg.data.timestamp || tx.timestamp,
      lastEdited: txmsg.data.timestamp || tx.timestamp
    };

    // Add to transactionCache
    if (tx.signature) {
      this.transactionCache[tx.signature] = tx;
    }

    // ISSUE 2 — DUPLICATE POSTS AFTER EDITING: Remove old versions before adding new one
    // Compute logical post ID for this transaction
    const incomingLogicalPostId = this.getLogicalPostId(tx);

    // Remove older versions of the same logical post from cache
    // Filter out any cached posts that belong to the same logical post
    this.postsCache.allPosts = this.postsCache.allPosts.filter(
      (p) => this.getLogicalPostIdFromPost(p) !== incomingLogicalPostId
    );

    // Remove from byAuthor cache
    if (this.postsCache.byAuthor.has(from)) {
      const authorPosts = this.postsCache.byAuthor.get(from);
      const filteredAuthorPosts = authorPosts.filter(
        (p) => this.getLogicalPostIdFromPost(p) !== incomingLogicalPostId
      );
      this.postsCache.byAuthor.set(from, filteredAuthorPosts);
    }

    // Add to cache (check for duplicates to avoid adding the same post twice)
    // This can happen if post was added optimistically during publish
    const existingInAllPosts = this.postsCache.allPosts.findIndex((p) => p.sig === tx.signature);
    if (existingInAllPosts < 0) {
      // Add parent_id to post object for future deduplication
      post.parent_id = parent_id;
      this.postsCache.allPosts.push(post);
    } else {
      // Update existing entry in case data changed
      this.postsCache.allPosts[existingInAllPosts] = post;
      this.postsCache.allPosts[existingInAllPosts].parent_id = parent_id;
    }

    // Also cache by author (check for duplicates)
    if (!this.postsCache.byAuthor.has(from)) {
      this.postsCache.byAuthor.set(from, []);
    }
    const authorPosts = this.postsCache.byAuthor.get(from);
    const existingInAuthorPosts = authorPosts.findIndex((p) => p.sig === tx.signature);
    if (existingInAuthorPosts < 0) {
      // Add parent_id to post object for future deduplication
      post.parent_id = parent_id;
      authorPosts.push(post);
    } else {
      // Update existing entry in case data changed
      authorPosts[existingInAuthorPosts] = post;
      authorPosts[existingInAuthorPosts].parent_id = parent_id;
    }

    // ========================================================================
    // Save lightweight reference to app.options.stack.posts (only for user's own posts)
    // INVARIANT: app.options.stack is lightweight - no post bodies, images, or heavy data
    // ========================================================================
    if (tx.isFrom(this.publicKey)) {
      this.load();
      if (!this.app.options.stack.posts) {
        this.app.options.stack.posts = [];
      }

      // Extract parent_id for revision tracking
      const parent_id = txmsg.data?.parent_id || null;

      // Store only lightweight reference (sig, publicKey, timestamp, status, parent_id)
      // Full content must be loaded from archive when needed
      const lightweightPost = {
        sig: tx.signature,
        publicKey: tx.from[0].publicKey,
        timestamp: txmsg.data.timestamp || tx.timestamp,
        lastEdited: txmsg.data.timestamp || tx.timestamp,
        status: 'published', // Can be 'published', 'unpublished', etc.
        parent_id: parent_id || null // null for root posts, parent signature for revisions
      };

      // Find existing entry for this logical post using canonical helper
      const incomingLogicalPostId = this.getLogicalPostId(tx);
      const postIndex = this.app.options.stack.posts.findIndex(
        (p) => this.getLogicalPostIdFromPost(p) === incomingLogicalPostId
      );

      if (postIndex >= 0) {
        // Update existing post entry with latest revision info
        this.app.options.stack.posts[postIndex] = lightweightPost;
      } else {
        // Post not in list yet - add this revision
        this.app.options.stack.posts.push(lightweightPost);
      }

      this.save();
    }

    if (this.app.BROWSER) {
      if (tx.isFrom(this.publicKey)) {
        // Check if this is an update (has parent_id) or new post
        const txmsg = tx.returnMessage();
        const parent_id = txmsg.data?.parent_id || null;
        if (parent_id) {
          siteMessage('Post updated', 1500);
        } else {
          siteMessage('Stack post published', 1500);
        }

        // Browser-only confirmation alert for testing
        if (this.browser_active) {
          siteMessage('Your blog post has been received from the network.');
        }
      } else {
        siteMessage(`New stack post by ${this.app.keychain.returnUsername(from)}`, 3000);
      }
    }

    // Archive management is now handled by onReceiveBlogPost() in onConfirmation()
    // This function only handles caching and UI updates

    if (this.callbackAfterPost) {
      this.callbackAfterPost();
      delete this.callbackAfterPost;
    }
  }

  /**
   * Clean up pending drafts after a post is confirmed
   * Deletes all transactions with field4 = "stack:pending" owned by this user from localhost archive
   */
  async cleanupPendingDrafts() {
    try {
      return new Promise((resolve) => {
        this.app.storage.loadTransactions(
          {
            field1: 'Stack',
            field2: this.publicKey, // Only clean up this user's pending drafts
            field4: 'stack:pending'
          },
          async (txs) => {
            if (!txs || txs.length === 0) {
              resolve();
              return;
            }

            // Delete all pending draft transactions
            for (const pendingTx of txs) {
              try {
                await this.app.storage.deleteTransaction(pendingTx, null, 'localhost');
              } catch (error) {
                console.error('Error deleting pending draft:', error);
              }
            }

            resolve();
          },
          'localhost'
        );
      });
    } catch (error) {
      console.error('Error cleaning up pending drafts:', error);
    }
  }

  ////////////////////////////
  // Local State Management //
  ////////////////////////////
  /**
   * Load persistent local UX state from app.options
   * Initializes app.options.stack if it doesn't exist
   * This is CLIENT-SIDE STATE ONLY - not authoritative
   *
   * Structure:
   * app.options.stack = {
   *   posts: [ { sig, publicKey, timestamp, lastEdited, status } ],  // Lightweight references only
   *   subscriptions: [ { publicKey, addedAt } ]  // List of subscribed creator publicKeys
   * }
   */
  load() {
    if (!this.app.options.stack) {
      this.app.options.stack = {};
    }
    if (!this.app.options.stack.posts) {
      this.app.options.stack.posts = [];
    }
    if (!this.app.options.stack.subscriptions) {
      this.app.options.stack.subscriptions = [];
    }
    // Note: app.options.stack is lightweight - no post bodies, images, or heavy data
    // Full post content must be loaded from archive transactions when needed

    return this.app.options.stack;
  }

  ////////////////////////////
  // Subscription Management //
  ////////////////////////////
  /**
   * Add a subscription to a creator by publicKey
   * @param {string} publicKey - The creator's publicKey
   * @returns {boolean} - True if added, false if already subscribed
   */
  addSubscription(publicKey) {
    if (!publicKey || !this.app.wallet.isValidPublicKey(publicKey)) {
      return false;
    }

    this.load();
    const subscriptions = this.app.options.stack.subscriptions || [];

    // Check if already subscribed
    if (subscriptions.some((sub) => sub.publicKey === publicKey)) {
      return false;
    }

    // Add subscription
    subscriptions.push({
      publicKey: publicKey,
      addedAt: Date.now()
    });

    this.app.options.stack.subscriptions = subscriptions;
    this.save();
    return true;
  }

  /**
   * Check if a publicKey is subscribed
   * @param {string} publicKey - The creator's publicKey
   * @returns {boolean}
   */
  isSubscribed(publicKey) {
    if (!publicKey) return false;
    this.load();
    const subscriptions = this.app.options.stack.subscriptions || [];
    return subscriptions.some((sub) => sub.publicKey === publicKey);
  }

  /**
   * Get all subscribed publicKeys
   * @returns {Array<string>}
   */
  getSubscriptions() {
    this.load();
    const subscriptions = this.app.options.stack.subscriptions || [];
    return subscriptions.map((sub) => sub.publicKey);
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
  // Draft & Publish State  //
  ////////////////////////////
  /**
   * Check if the user has ever published a blog post
   * Uses postsCache.byAuthor to determine if user's publicKey appears as a publisher
   * @returns {boolean} True if user has published at least one post
   */
  hasPublished() {
    if (!this.publicKey) {
      return false;
    }
    return (
      this.postsCache.byAuthor.has(this.publicKey) &&
      this.postsCache.byAuthor.get(this.publicKey).length > 0
    );
  }

  /**
   * Discover all local draft transactions from the archive
   * Stores pruned representation in-memory (this.drafts)
   * Ordered by last-modified DESC (most recent first)
   * Non-blocking, can be called on render/activation
   */
  async discoverDrafts() {
    // ========================================================================
    // DIAGNOSTIC: Log entry into discoverDrafts()
    // ========================================================================
    console.log('[DIAG] discoverDrafts() ENTRY');

    if (!this.app.storage) {
      console.log('[DIAG] discoverDrafts() EARLY RETURN: this.app.storage is not available');
      return;
    }

    // ========================================================================
    // DIAGNOSTIC: Log query parameters
    // ========================================================================
    const queryParams = { field1: 'Stack', field4: 'stack:draft' };
    console.log('[DIAG] discoverDrafts() Query parameters:', JSON.stringify(queryParams, null, 2));
    console.log('[DIAG] discoverDrafts() Query peer: localhost');
    console.log(
      '[DIAG] discoverDrafts() Expected match: field1="Stack" AND field4="stack:draft" AND peer="localhost"'
    );

    return new Promise((resolve) => {
      this.app.storage.loadTransactions(
        queryParams,
        (txs) => {
          // ========================================================================
          // DIAGNOSTIC: Log raw results count
          // ========================================================================
          const rawCount = txs ? txs.length : 0;
          console.log('[DIAG] discoverDrafts() Raw results count:', rawCount);

          // ========================================================================
          // DIAGNOSTIC: Log field values of returned transactions for comparison
          // ========================================================================
          if (txs && txs.length > 0) {
            console.log(
              '[DIAG] discoverDrafts() Returned transactions have the following field values:'
            );
            txs.forEach((tx, idx) => {
              console.log(`[DIAG]   Transaction ${idx + 1}:`);
              console.log(`[DIAG]     - field1: "${tx.field1 || 'N/A'}"`);
              console.log(`[DIAG]     - field2: "${tx.field2 || 'N/A'}"`);
              console.log(`[DIAG]     - field4: "${tx.field4 || 'N/A'}"`);
              console.log(`[DIAG]     - signature: ${tx.signature || 'N/A'}`);
            });
          } else {
            console.log(
              '[DIAG] discoverDrafts() No transactions returned - checking if ANY drafts exist with different field values...'
            );

            // ========================================================================
            // DIAGNOSTIC: Try querying with just field4 to see if drafts exist with different field1
            // ========================================================================
            this.app.storage.loadTransactions(
              { field4: 'stack:draft' },
              (allDrafts) => {
                const allDraftsCount = allDrafts ? allDrafts.length : 0;
                console.log(
                  '[DIAG] discoverDrafts() Query with ONLY field4="stack:draft" found',
                  allDraftsCount,
                  'transactions'
                );
                if (allDrafts && allDraftsCount > 0) {
                  console.log(
                    '[DIAG] discoverDrafts() These drafts have the following field values:'
                  );
                  allDrafts.forEach((tx, idx) => {
                    console.log(`[DIAG]   Draft ${idx + 1}:`);
                    console.log(
                      `[DIAG]     - field1: "${tx.field1 || 'N/A'}" (query expected "Stack")`
                    );
                    console.log(`[DIAG]     - field2: "${tx.field2 || 'N/A'}"`);
                    console.log(`[DIAG]     - field4: "${tx.field4 || 'N/A'}" (matches)`);
                    console.log(`[DIAG]     - signature: ${tx.signature || 'N/A'}`);
                  });
                }
              },
              'localhost'
            );
          }

          if (!txs || txs.length === 0) {
            this.drafts = [];

            // Log draftCount after discovery (downgraded from diagnostic)
            console.debug('Stack: discoverDrafts() completed. draftCount = 0');
            console.log('[DIAG] discoverDrafts() EXIT: No drafts found');

            resolve();
            return;
          }

          // Extract pruned draft representation
          const draftList = txs.map((tx) => {
            let title = 'Untitled draft';
            let lastModified = tx.timestamp || 0;

            try {
              const msg = tx.returnMessage();
              if (msg && msg.data) {
                title = msg.data.title || title;
                // Use optional.updated_at if available, otherwise timestamp
                lastModified = tx.optional?.updated_at || tx.timestamp || 0;
              }
            } catch (err) {
              // If transaction can't be parsed, use defaults
              console.warn('Stack: Error parsing draft transaction:', err);
            }

            return {
              id: tx.signature || tx.hash || null, // Transaction identifier
              title: title,
              lastModified: lastModified
            };
          });

          // Sort by lastModified DESC (most recent first)
          draftList.sort((a, b) => b.lastModified - a.lastModified);

          this.drafts = draftList;

          // ========================================================================
          // DIAGNOSTIC: Log parsed drafts added to this.mod.drafts
          // ========================================================================
          console.log(
            '[DIAG] discoverDrafts() Parsed drafts added to this.mod.drafts:',
            JSON.stringify(draftList, null, 2)
          );

          // Log draftCount after discovery (downgraded from diagnostic)
          console.debug(`Stack: discoverDrafts() completed. draftCount = ${draftList.length}`);
          console.log('[DIAG] discoverDrafts() EXIT: Drafts found and parsed');

          resolve();
        },
        'localhost'
      );
    });
  }

  /**
   * Get the list of drafts (read-only)
   * @returns {Array} Array of draft objects with {id, title, lastModified}, ordered by recency
   */
  getDrafts() {
    return this.drafts.slice(); // Return a copy to prevent mutation
  }

  /**
   * Check if there are any valid drafts available
   *
   * INVARIANT: Centralized function for determining draft existence
   * Filters drafts defensively to exclude:
   * - null/undefined entries
   * - malformed entries without valid IDs
   * - published drafts (checked against postsCache)
   *
   * All UI and editor logic must rely on this function.
   * No other draft-count logic is allowed.
   *
   * @returns {boolean} True if at least one valid draft exists, false otherwise
   */
  hasValidDrafts() {
    // ========================================================================
    // [DRAFT-CHECK] Log entry
    // ========================================================================
    console.log('[DRAFT-CHECK] hasValidDrafts() called');
    const draftsBeforeFilter = this.drafts ? this.drafts.length : 0;
    console.log('[DRAFT-CHECK] drafts_before_filter =', draftsBeforeFilter);

    // Defensive check: if drafts array is null/undefined/empty, return false
    if (!this.drafts || this.drafts.length === 0) {
      console.log('[DRAFT-CHECK] drafts_after_filter = 0 (array empty or null)');
      console.log('[DRAFT-CHECK] hasValidDrafts() returning false');
      return false;
    }

    // Filter drafts defensively
    const validDrafts = this.drafts.filter((draft) => {
      // Exclude null/undefined entries
      if (!draft) {
        console.log('[DRAFT-CHECK] Filtering out null/undefined draft entry');
        return false;
      }

      // Exclude entries without valid IDs
      if (!draft.id || typeof draft.id !== 'string' || draft.id.trim() === '') {
        console.log('[DRAFT-CHECK] Filtering out draft without valid ID:', draft);
        return false;
      }

      // Check if draft has been published (exists in postsCache)
      // Published drafts should not appear in draft chooser
      if (this.postsCache && this.postsCache.allPosts) {
        const isPublished = this.postsCache.allPosts.some((post) => post.sig === draft.id);
        if (isPublished) {
          console.log('[DRAFT-CHECK] Filtering out published draft:', draft.id);
          return false;
        }
      }

      // Draft is valid
      return true;
    });

    const draftsAfterFilter = validDrafts.length;
    console.log('[DRAFT-CHECK] drafts_after_filter =', draftsAfterFilter);
    console.log('[DRAFT-CHECK] hasValidDrafts() returning', draftsAfterFilter > 0);

    return draftsAfterFilter > 0;
  }

  /**
   * Refresh draft list from archive
   * Call this after draft save/delete/publish operations
   */
  async refreshDrafts() {
    await this.discoverDrafts();
  }

  /**
   * Delete a draft transaction by ID (signature or hash)
   * Updates both local archive and in-memory draft list
   * @param {string} draftId - Transaction signature or hash
   * @returns {Promise<boolean>} True if draft was deleted, false otherwise
   */
  async deleteDraft(draftId) {
    if (!draftId) {
      return false;
    }

    try {
      // [DRAFT-CHECK] Log draft deletion
      console.log('[DRAFT-CHECK] deleteDraft() called for draftId:', draftId);

      // Load the draft transaction to delete
      const tx = await this.loadDraftTransactionById(draftId);
      if (!tx) {
        console.warn('[DRAFT-CHECK] Draft transaction not found for deletion:', draftId);
        return false;
      }

      // Delete from archive
      await this.app.storage.deleteTransaction(tx, null, 'localhost');
      console.log('[DRAFT-CHECK] Draft deleted from archive');

      // Refresh in-memory draft list (this removes it from this.drafts)
      await this.refreshDrafts();
      console.log('[DRAFT-CHECK] In-memory draft list refreshed - draft removed');

      // Verify draft is gone
      const stillExists = this.drafts.some((d) => d.id === draftId);
      if (stillExists) {
        console.warn('[DRAFT-CHECK] WARNING: Draft still exists in memory after deletion!');
      } else {
        console.log('[DRAFT-CHECK] Draft successfully removed from memory');
      }

      return true;
    } catch (error) {
      console.error('[DRAFT-CHECK] Error deleting draft:', error);
      return false;
    }
  }

  /**
   * Load a draft transaction by ID (signature or hash)
   * Internal helper for draft operations
   */
  async loadDraftTransactionById(draftId) {
    return new Promise((resolve) => {
      this.app.storage.loadTransactions(
        { field1: 'Stack', field4: 'stack:draft' },
        (txs) => {
          if (!txs || txs.length === 0) {
            resolve(null);
            return;
          }

          // Find transaction by signature or hash
          const tx = txs.find((t) => t.signature === draftId || t.hash === draftId);

          resolve(tx || null);
        },
        'localhost'
      );
    });
  }

  ////////////////////////////
  // Peer Service Handling //
  ////////////////////////////
  /**
   * Handles incoming Stack service requests from peers.
   * Serves cached posts to requesting peers.
   * Follows RedSquare pattern for service request handling.
   *
   * @param {Object} app - Saito application instance
   * @param {Transaction} tx - Request transaction from peer
   * @param {Object} peer - Peer object making the request
   * @param {Function} mycallback - Callback to send response
   * @returns {number} 1 if handled, 0 if not handled
   */
  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null || !mycallback) {
      return 0;
    }

    const txmsg = tx.returnMessage();
    if (!txmsg || !txmsg.request) {
      return 0;
    }

    // Handle request for a single post by signature
    if (txmsg.request === 'load stack post') {
      const signature = txmsg.data?.signature;

      if (!signature || typeof signature !== 'string') {
        // Invalid request - respond with empty array
        mycallback([]);
        return 1;
      }

      // Check local cache first
      if (this.transactionCache[signature]) {
        const cachedTx = this.transactionCache[signature];
        // Serialize transaction for network transmission
        const serialized = cachedTx.serialize_to_web(app);
        mycallback([serialized]);
        return 1;
      }

      // Not in cache - try local archive as fallback
      // This allows servers to serve posts they've recently loaded
      this.app.storage.loadTransactions(
        { field1: 'Stack', signature: signature },
        (txs) => {
          if (Array.isArray(txs) && txs.length > 0) {
            const foundTx = txs.find((t) => t.signature === signature);
            if (foundTx) {
              // Cache it for future requests
              this.transactionCache[signature] = foundTx;
              const serialized = foundTx.serialize_to_web(app);
              mycallback([serialized]);
              return;
            }
          }
          // Not found - respond with empty array (normal, not an error)
          mycallback([]);
        },
        'localhost'
      );

      return 1;
    }

    // Handle receiving a post transaction from a peer
    // This happens when a peer sends us a post they have cached
    if (txmsg.request === 'stack post transaction') {
      const serializedTx = txmsg.data?.transaction;

      if (!serializedTx) {
        return 0; // Not a valid Stack post transaction
      }

      try {
        // Deserialize and validate the transaction
        const receivedTx = new Transaction();
        receivedTx.deserialize_from_web(app, serializedTx);

        // Basic validation - ensure it's a Stack post
        const receivedMsg = receivedTx.returnMessage();
        if (receivedMsg.module !== 'Stack' || receivedMsg.data?.type !== 'stack_post') {
          return 0; // Not a Stack post, don't handle
        }

        // Cache the received transaction
        const sig = receivedTx.signature;
        if (sig) {
          this.transactionCache[sig] = receivedTx;
          console.debug(`Stack: Cached post ${sig} received from peer`);
        }

        // Do NOT re-broadcast automatically
        // Do NOT render - this is middleware only
        return 1;
      } catch (error) {
        // Invalid transaction - silently ignore (normal)
        console.debug(`Stack: Failed to deserialize peer transaction`, error);
        return 0;
      }
    }

    // Not a Stack service request
    return 0;
  }

  ////////////////////////////
  // NFT Access Resolution //
  ////////////////////////////
  /**
   * Resolves Stack NFT access data from wallet for Archive queries.
   * Mirrors Vault's pattern: discovers Stack NFTs, loads transactions, extracts slips.
   *
   * @returns {Object|null} Access data object with access_hash, access_script, access_witness, or null if no NFT found
   */
  async resolveStackAccessData() {
    try {
      // Update NFT list to ensure wallet cache is fresh
      await this.app.wallet.updateNFTList();

      const nftList = this.app.options.wallet.nfts || [];
      if (!nftList || nftList.length === 0) {
        return null;
      }

      // Find first Stack NFT (type === "stack")
      let stackNFT = null;
      for (const rec of nftList) {
        const nftType = this.app.wallet.extractNFTType(rec.slip3?.utxo_key || '');
        if (nftType === 'stack') {
          stackNFT = rec;
          break;
        }
      }

      if (!stackNFT) {
        return null;
      }

      // Create SaitoNFT object and load transaction to get full slip data
      const SaitoNFT = require('../../lib/saito/ui/saito-nft/saito-nft');
      const nft = new SaitoNFT(this.app, this, null, stackNFT, null);
      await nft.fetchTransaction();

      // Extract slip utxo_keys (required for witness)
      const slip1_utxokey = nft.slip1?.utxo_key || '';
      const slip2_utxokey = nft.slip2?.utxo_key || '';
      const slip3_utxokey = nft.slip3?.utxo_key || '';
      let slips = [];
      slips.push(slip1_utxokey);
      slips.push(slip2_utxokey);
      slips.push(slip3_utxokey);

      if (!slip1_utxokey || !slip2_utxokey || !slip3_utxokey) {
        console.warn('Stack: NFT missing required slip utxo_keys');
        return null;
      }

      // 2. Extract routing path from NFT transaction if present
      let path = [];
      try {
        const nft_txmsg = nft.tx?.returnMessage?.();
        if (Array.isArray(nft_txmsg?.data?.path)) {
          path = nft_txmsg.data.path;
        }
      } catch (err) {
        // Fail silently — absence of path is normal
      }

      // Construct witness data in CHECKOWNNFTWHERE format: { slips: [utxokey1, utxokey2, utxokey3] }
      let access_witness_obj = [
        {
          utxokey1: slip1_utxokey,
          utxokey2: slip2_utxokey,
          utxokey3: slip3_utxokey
        }
      ];
      if (Array.isArray(path) && path.length > 0) {
        access_witness_obj.push({
          hops: path
        });
      }
      try {
        let nft_txmsg = nft.tx?.returnMessage?.();
        if (nft_txmsg.data.duration) {
          access_witness_obj.push({
            duration: nft_txmsg.data.duration,
            signature: nft_txmsg.data.duration_sig
          });
        }
      } catch (err) {
        console.log('ERROR attaching duration and sig to witness...');
      }
      const access_witness = JSON.stringify(access_witness_obj);

      // Note: access_hash and access_script come from the POST transaction, not the NFT
      // We return witness data here, and the caller will attach it along with post's access_hash/access_script
      return {
        access_witness: access_witness,
        nft_creator: nft.creator || nft.slip1?.public_key || ''
      };
    } catch (error) {
      console.warn('Stack: Error resolving NFT access data:', error);
      return null;
    }
  }

  ////////////////////////////
  // Transaction Loading   //
  ////////////////////////////
  /**
   * Loads a single transaction by signature.
   * Checks cache first, then queries peers, then falls back to archive.
   * Supports both callback and Promise/await usage.
   *
   * @param {string} signature - Transaction signature to load
   * @param {Object} options - Optional parameters. Can include `peer` (object or "localhost")
   * @param {Function} callback - Optional callback function(tx)
   * @returns {Transaction|null} Transaction object if no callback, null if not found
   */
  async loadPost(signature, options = {}, callback = null) {
    // Extract peer from options if provided
    const peer = options?.peer || null;

    // Build access context once per request
    let access_script = null;
    let access_hash = null;
    let access_witness = null;

    const accessData = await this.resolveStackAccessData();
    if (accessData?.access_witness) {
      access_witness = accessData.access_witness;
    }

    // Validate signature
    if (!signature || typeof signature !== 'string') {
      if (callback) {
        callback(null);
        return;
      }
      return null;
    }

    // Step 1: Check cache first
    if (this.transactionCache[signature]) {
      const cachedTx = this.transactionCache[signature];
      if (callback) {
        callback(cachedTx);
        return;
      }
      return cachedTx;
    }

    // Step 3: Check localhost archive (if no peer specified)
    // This checks our own local archive before making network requests
    // For loadPost(), we don't know the author ahead of time, so we can't construct access_hash
    // Try loading without access first (works for public posts)
    const localQuery = { field1: 'Stack', signature: signature, access_witness: access_witness };

    // Step 2: If peer is provided, use it directly (skip localhost check and peer queries)
    if (peer) {
      // Determine peer string for loadTransactions
      // Can be "localhost" string or a peer object (we'll use its identifier)
      let peerString = peer;
      if (typeof peer === 'object' && peer !== null) {
        // If it's a peer object, extract identifier (publicKey, address, or use object itself)
        // loadTransactions may accept the object directly, but we'll try to get a string identifier
        peerString = peer.publicKey || peer.address || peer;
      }

      return new Promise((resolve) => {
        this.app.storage.loadTransactions(
          localQuery,
          (txs) => {
            let tx = null;

            // Find matching transaction
            if (Array.isArray(txs) && txs.length > 0) {
              tx = txs.find((t) => t.signature === signature);
            }

            // Cache if found
            if (tx) {
              this.transactionCache[signature] = tx;
            }

            // Handle callback or Promise
            if (callback) {
              callback(tx);
              resolve(tx);
            } else {
              resolve(tx);
            }
          },
          peerString // Use provided peer (can be "localhost" or peer identifier)
        );
      });
    }

    // For now, try without access data first (public posts)
    // TODO: Enhance to support private posts by signature (would need author lookup)
    const localTx = await new Promise((resolve) => {
      this.app.storage.loadTransactions(
        localQuery,
        (txs) => {
          let tx = null;

          // Find matching transaction
          if (Array.isArray(txs) && txs.length > 0) {
            tx = txs.find((t) => t.signature === signature);
          }

          // Cache if found
          if (tx) {
            this.transactionCache[signature] = tx;
          }

          resolve(tx);
        },
        'localhost' // Specify localhost as peer to check local archive
      );
    });

    // If found in local archive, return it
    if (localTx) {
      if (callback) {
        callback(localTx);
        return;
      }
      return localTx;
    }

    //
    // Step 4: Query connected Stack peers (if localhost didn't have it)
    // Simple sequential query - try first available peer
    // No racing, no retries, no timeouts (as per requirements)
    //
    let peers = await this.app.network.getPeers();
    if (peers.length === 0) {
      this.pending_post_sig = signature;
      this.pending_post_pk = null;
      return null;
    }

    const peerKeys = Object.keys(this.peers);
    if (peerKeys.length > 0) {
      const firstPeerKey = peerKeys[0];
      const peerObj = this.peers[firstPeerKey]?.peer;

      if (peerObj && peerObj.peerIndex !== undefined) {
        try {
          const peerTx = await new Promise((resolve) => {
            // Query peer for the post
            this.app.network.sendRequestAsTransaction(
              'load stack post',
              { signature: signature, access_witness: access_witness },
              (response) => {
                // Response is array of serialized transactions
                if (Array.isArray(response) && response.length > 0) {
                  try {
                    const tx = new Transaction();
                    tx.deserialize_from_web(this.app, response[0]);

                    // Validate it's the transaction we requested
                    if (tx.signature === signature) {
                      // Cache it
                      this.transactionCache[signature] = tx;
                      resolve(tx);
                      return;
                    }
                  } catch (error) {
                    console.debug(`Stack.loadPost: Failed to deserialize peer response`, error);
                  }
                }
                // Peer didn't have it or returned invalid data - resolve null
                resolve(null);
              },
              peerObj.peerIndex
            );
          });

          // If peer returned valid transaction, return it
          if (peerTx) {
            if (callback) {
              callback(peerTx);
              return;
            }
            return peerTx;
          }
          // If peer returned null, return null (no further fallback)
        } catch (error) {
          // Peer query failed - silently return null (normal)
          console.debug(`Stack.loadPost: Peer query failed`, error);
        }
      }
    }

    // Not found in cache, localhost, or peers - return null
    if (callback) {
      callback(null);
      return;
    }
    return null;
  }

  /**
   * Loads posts for a specific author from local and optionally remote archives.
   *
   * @param {string} publicKey - The author's public key
   * @param {Object} options - Options object
   * @param {boolean} options.forceRemote - If true, also query remote peers (default: true)
   * @returns {Promise<Array<Transaction>>} Array of Transaction objects, deduplicated by signature
   */
  async loadPostsForAuthor(publicKey, { forceRemote = true } = {}) {
    if (!publicKey || !this.app.wallet.isValidPublicKey(publicKey)) {
      return [];
    }

    const seenSignatures = new Set();
    const posts = [];
    let access_witness = null;

    // PART 1: Resolve Stack NFT access data (mirrors Vault pattern)
    // This provides witness data that can be attached to Archive queries
    const accessData = await this.resolveStackAccessData();
    if (accessData?.access_witness) {
      access_witness = accessData.access_witness;
    }

    if (accessData && accessData.access_witness) {
      // Construct the access script for this author (transferable private posts)
      // This matches the script used when creating private posts
      const { getAccessScriptForIntent } = require('./lib/access/access-scripts');
      const publishIntent = {
        visibility: 'private',
        access_mode: 'transferable',
        time_limit: null,
        author: publicKey
      };
    }

    // PART 2.1: Query local archive first
    // Build query object - attach access data if NFT exists
    const localQuery = {
      field1: 'Stack',
      field2: publicKey,
      field4: 'stack:post'
    };
    if (access_witness) {
      localQuery.access_witness = access_witness;
    }

    const localPosts = await new Promise((resolve) => {
      this.app.storage.loadTransactions(
        localQuery,
        (txs) => {
          resolve(txs || []);
        },
        'localhost'
      );
    });

    // PART 2.2: Collect and deduplicate local results
    for (const tx of localPosts) {
      if (tx && tx.signature && !seenSignatures.has(tx.signature)) {
        seenSignatures.add(tx.signature);
        posts.push(tx);
      }
    }

    // PART 2.3: If forceRemote, query remote peers
    if (forceRemote) {
      // Build remote query with same access data pattern
      let remoteQuery = {
        field1: 'Stack',
        field2: publicKey,
        field4: 'stack:post'
      };
      if (access_witness) {
        remoteQuery.access_witness = access_witness;
      }

      let peers = await this.app.network.getPeers();
      if (peers.length === 0) {
        // Defer until peers are available
        this.pending_author_load = publicKey;
        return posts;
      }

      const remotePosts = await new Promise((resolve) => {
        this.app.storage.loadTransactions(
          remoteQuery,
          (txs) => {
            resolve(txs || []);
          },
          null // null = remote peers
        );
      });

      for (const tx of remotePosts) {
        seenSignatures.add(tx.signature);
        posts.push(tx);
      }

      // PART 2.4: For each remotely discovered post, append if unseen and save to localhost
      /***
      for (const tx of remotePosts) {
        if (tx && tx.signature && !seenSignatures.has(tx.signature)) {
          seenSignatures.add(tx.signature);
          posts.push(tx);

          // PART 2.5: Immediately save to localhost archive with proper revision handling
          try {
            const txmsg = tx.returnMessage();
            const parent_id = txmsg?.data?.parent_id || null;
            const from = tx?.from[0]?.publicKey;
            
            // For revisions: delete older revisions with same (author, parent_id)
            if (parent_id && from) {
              const olderRevisions = await new Promise((resolve) => {
                this.app.storage.loadTransactions(
                  {
                    field1: 'Stack',
                    field2: from,
                    field4: 'stack:post',
                    field5: parent_id
                  },
                  (txs) => {
                    resolve(txs || []);
                  },
                  'localhost'
                );
              });
              
              // Delete all older revisions
              for (const oldTx of olderRevisions) {
                if (oldTx.signature !== tx.signature) {
                  try {
                    await this.app.storage.deleteTransaction(oldTx, null, 'localhost');
                  } catch (error) {
                    console.warn('Stack: Error deleting older revision when saving remote post:', error);
                  }
                }
              }
            }
            
            // Save with field5 = parent_id (or empty for root posts)
            await this.app.storage.saveTransaction(
              tx,
              { 
                field4: 'stack:post', 
                field5: parent_id || '',
                preserve: 1 
              },
              'localhost'
            );
          } catch (error) {
            console.warn('Stack: Failed to save remote post to local archive:', error);
          }
        }
      }
***/
    }

    // ========================================================================
    // COLLAPSE REVISIONS: Group by logical post identity, keep latest only
    // ========================================================================
    // A "post" is a LOGICAL OBJECT WITH REVISIONS, not a single transaction.
    // We MUST show only ONE entry per logical post (the latest revision).
    // This handles:
    // - Race conditions during archive deletion
    // - Remote peers returning stale data
    // - Partial deletions
    // - Reorgs
    const postGroups = new Map(); // key: logicalPostId, value: Transaction

    for (const tx of posts) {
      try {
        // Use canonical helper to compute logical post identity
        const logicalPostId = this.getLogicalPostId(tx);

        // Get current best revision for this logical post
        const existingTx = postGroups.get(logicalPostId);

        if (!existingTx) {
          // First occurrence of this logical post
          postGroups.set(logicalPostId, tx);
        } else {
          // Compare timestamps - keep the newer one
          const existingTime = existingTx.timestamp || 0;
          const currentTime = tx.timestamp || 0;
          if (currentTime > existingTime) {
            postGroups.set(logicalPostId, tx);
          }
        }
      } catch (error) {
        // Skip malformed transactions, but log for debugging
        console.warn('Stack: Error processing transaction in loadPostsForAuthor:', error);
      }
    }

    // Create new array with collapsed versions (one per logical post)
    // Do NOT reassign posts (it is const) - create new variable instead
    const collapsedPosts = Array.from(postGroups.values());

    // Sort by timestamp DESC (most recent first)
    collapsedPosts.sort((a, b) => {
      const aTime = a.timestamp || 0;
      const bTime = b.timestamp || 0;
      return bTime - aTime;
    });

    return collapsedPosts;
  }

  /**
   * Loads multiple transactions by their signatures.
   * Iterates through keys starting at index, preserving order.
   * Skips null results (missing transactions are normal).
   * Supports both callback and Promise/await usage.
   *
   * @param {Array<string>} keys - Array of transaction signatures
   * @param {number} index - Starting index in keys array (default: 0)
   * @param {Object} options - Optional parameters (reserved for future use)
   * @param {Function} callback - Optional callback function(array)
   * @returns {Array<Transaction>} Array of Transaction objects (no nulls)
   */
  async loadPosts(keys, index = 0, options = {}, callback = null) {
    // Validate inputs
    if (!Array.isArray(keys) || keys.length === 0) {
      if (callback) {
        callback([]);
        return;
      }
      return [];
    }

    // Ensure index is valid
    if (index < 0) index = 0;
    if (index >= keys.length) {
      if (callback) {
        callback([]);
        return;
      }
      return [];
    }

    // Collect results, preserving order
    const results = [];
    const signaturesToLoad = keys.slice(index);

    // Load each transaction sequentially to preserve order
    for (const signature of signaturesToLoad) {
      try {
        const tx = await this.loadPost(signature, options);
        if (tx) {
          results.push(tx);
        }
        // Skip nulls silently - missing transactions are normal
      } catch (error) {
        // Silently skip errors - permission failures are normal
        console.debug(`Stack.loadPosts: Failed to load ${signature}`, error);
      }
    }

    // Handle callback or return
    if (callback) {
      callback(results);
      return results;
    }

    return results;
  }

  ////////////////////////////
  // Web Server            //
  ////////////////////////////
  ///////////////
  // webserver //
  ///////////////
  webServer(app, expressapp, express, alternative_slug = null) {
    const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    const stack_self = this;

    //
    // 1. STATIC FILES — ALWAYS FIRST
    //
    // This ensures /stack/js, /stack/css, etc. resolve correctly
    //
    expressapp.use(uri, express.static(webdir));

    //
    // 2. STACK APP BOOTSTRAP
    //
    // Explicitly handle:
    //   /stack
    //   /stack/<publickey>
    //   /stack/<publickey>/<txsig>
    //
    // In ALL cases, we just return the Stack home HTML.
    // Stack (browser-side) will inspect window.location.pathname
    // and decide whether to call:
    //   - loadPostsForAuthor()
    //   - loadPost()
    //   - explore logic
    //
    let html = HomePage(app, stack_self, app.build_number);

    expressapp.get(`${uri}`, (req, res) => {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });

    expressapp.get(`${uri}/:publickey`, (req, res) => {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });

    expressapp.get(`${uri}/:publickey/:txsig`, (req, res) => {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });
  }

  ////////////////////////////
  // DEVELOPMENT ONLY: Demo Transactions
  ////////////////////////////
  /**
   * Generates synthetic blog post transactions for development/testing.
   * These transactions exist only in memory and are not persisted to disk.
   *
   * TODO: Remove this function and its call in initialize() when ready for production.
   *
   * This function:
   * - Creates 3 Transaction objects with realistic blog content
   * - Inserts them into transactionCache and postsCache
   * - Makes them discoverable by loadPost/loadPosts
   */
  async generateDemoStackTransactions() {
    if (!this.publicKey) {
      console.debug('Stack: Cannot generate demo posts without publicKey');
      return;
    }

    const demoPosts = [
      {
        title: 'On Shared Dreaming',
        subtitle: 'Exploring the architecture of collective consciousness',
        text: `# On Shared Dreaming

The idea of shared dreaming has haunted human imagination for as long as we have told stories. What happens when we build worlds together, not just in our minds, but in spaces we can enter together? The question touches on something fundamental about how we construct reality and trust one another within it.

## The Architecture of Collective Consciousness

When we dream alone, the rules are simple: everything we encounter is a product of our own mind. The physics, the logic, the people—all of it exists because we believe it does. But what if someone else could enter that space? What if the dream had to accommodate not just one consciousness, but two, or many?

The first challenge is coordination. In a private dream, you can change the rules on a whim. A door that was locked can suddenly be open because you willed it. But in a shared space, such changes require consensus, or at least acknowledgment. The shared dream becomes a negotiation, a collaborative construction where each participant brings their own expectations and limitations.

This negotiation is not just about what is possible, but about what is real. In your own dream, you know—or at least believe—that everything you see is a projection. But when another person enters, their presence introduces a fundamental uncertainty: are they real, or are they another projection? The question of authenticity becomes central, and trust becomes the currency of the shared space.

## Trust and Coordination Inside a Dream

Trust in a shared dream operates differently than trust in waking life. In the physical world, we have external referents—we can touch, measure, verify. But in a dream, verification is circular. If I ask you to prove you're real, and you respond, how do I know your response isn't just my mind creating what I expect to hear?

The answer, perhaps, is that trust in a shared dream is not about verification, but about surrender. To enter someone else's dream is to accept, at least provisionally, that their reality is as valid as your own. It is to agree to play by rules you did not create, to see things you did not imagine, to experience perspectives that are genuinely other.

This surrender is not passive. It requires active participation in the construction of the shared space. You must contribute your own elements, your own rules, your own understanding. The dream becomes a collaborative work, constantly being rewritten by all participants.

## The Difference Between Private and Collective Experience

A private dream is a monologue. A shared dream is a dialogue, or perhaps a polyphonic composition where multiple voices speak simultaneously, sometimes in harmony, sometimes in tension.

In a private dream, you are both the author and the audience. You know the plot because you wrote it, even if you don't remember writing it. But in a shared dream, you are only one of the authors, and you are constantly surprised by what the others create. The experience becomes genuinely collaborative, genuinely unpredictable.

This unpredictability is both the risk and the reward. In a private dream, you can control everything, but you can also be trapped by your own limitations. In a shared dream, you lose control, but you gain access to perspectives and possibilities you could never have imagined alone.

## The Boundaries of Shared Space

The question of boundaries becomes crucial. Where does one person's dream end and another's begin? If we are truly sharing a space, then the boundaries must be permeable, or perhaps non-existent. But if there are no boundaries, how do we maintain our individual identity? How do we know where we end and the other begins?

Perhaps the answer is that in a truly shared dream, identity itself becomes fluid. You are not just yourself, but also part of the collective construction. Your thoughts influence the space, and the space influences your thoughts. The distinction between self and other, between internal and external, begins to blur.

This blurring is not necessarily a loss. It can be an expansion, a way of experiencing consciousness that transcends individual boundaries. But it also requires a kind of courage—the willingness to let go of the certainty that comes with being the sole author of your reality.

## The Ethics of Shared Dreaming

If we can truly share dreams, then we must consider the ethics of such sharing. What are the responsibilities of the dream architect? What are the rights of the dream participant? Can someone be harmed in a shared dream? Can they be healed?

These questions are not just theoretical. They touch on fundamental issues of consent, agency, and the nature of experience itself. If a shared dream feels real, does that make it real? And if it is real, what obligations do we have to those who share it with us?

The answer may be that shared dreaming, like any form of shared experience, requires mutual respect and care. We must enter each other's spaces with intention, with awareness of the power we have to shape the experience, and with respect for the autonomy of others.

## Conclusion: The Promise of Shared Spaces

Shared dreaming, whether literal or metaphorical, represents a profound possibility: that we can construct realities together, that we can experience consciousness not just individually but collectively. This possibility challenges our assumptions about the boundaries of self and other, about what is real and what is imagined.

In the end, perhaps the question is not whether shared dreaming is possible, but whether we are willing to take the risk of entering spaces we did not create, of trusting others with the architecture of our experience, of surrendering control in exchange for the possibility of genuine collaboration.

The shared dream, then, becomes a metaphor for all forms of collective construction—for art, for community, for the ways we build worlds together in waking life. And in that sense, we are all already shared dreamers, architects of spaces we enter together, constantly negotiating the rules, the boundaries, and the meaning of what we create.`,
        imageUrl: '/saito/img/dreamscape.png',
        timestamp: Date.now() - 86400000 * 3, // 3 days ago
        url: window.location.href + '#post/shared-dreaming'
      },
      {
        title: 'Getting Started with Saito Stack',
        subtitle:
          'Learn how to create your first post, set up subscriptions, and build your audience on the decentralized web.',
        text: `# Getting Started with Saito Stack

Welcome to Saito Stack, a permissioned blogging platform built on the decentralized Saito network. This guide will help you create your first post and understand the core concepts.

## Creating Your First Post

To create a post, click the "Start Writing" button in the main interface. You'll be taken to the editor where you can:

- Write your content using Markdown
- Add a feature image
- Set a title and subtitle
- Configure subscription tiers

## Understanding Subscriptions

Saito Stack supports both free and paid subscriptions. You can:

- Offer free content to build your audience
- Create premium content behind a paywall
- Manage subscriber access and permissions

## Building Your Audience

The Explore feature lets readers discover your content. Make sure to:

- Write engaging titles and subtitles
- Use clear, readable formatting
- Add compelling feature images
- Publish regularly to keep readers engaged

## Next Steps

Once you've published your first post, you can:

- Share it with your network
- Build on existing posts (fork functionality)
- Engage with your readers
- Monetize your content through subscriptions

Happy writing!`,
        imageUrl: '/saito/img/dreamscape.png',
        timestamp: Date.now() - 86400000 * 2, // 2 days ago
        url: window.location.href + '#post/demo-getting-started'
      },
      {
        title: 'Understanding Peer-to-Peer Publishing',
        subtitle:
          'Unlike traditional blogging platforms, Saito Stack runs on a peer-to-peer network.',
        text: `# Understanding Peer-to-Peer Publishing

Unlike traditional blogging platforms, Saito Stack runs on a peer-to-peer network. Your posts are stored across the network, giving you true ownership and control over your content.

## The Decentralized Advantage

Traditional platforms store your content on centralized servers. This means:

- You don't own your content
- Platforms can censor or remove posts
- You're dependent on a single service
- Your data is vulnerable to breaches

With Saito Stack, your content is:

- Stored across the network
- Truly owned by you
- Resistant to censorship
- Accessible from any peer

## How It Works

When you publish a post:

1. Your transaction is created and signed
2. It's propagated across the Saito network
3. Peers cache and serve your content
4. Readers can access it from any peer

## Network Resilience

The peer-to-peer architecture means:

- No single point of failure
- Content remains available even if some peers go offline
- Fast access through local caching
- True decentralization

## Your Content, Your Control

With Saito Stack, you maintain full control over your content. No platform can:

- Delete your posts
- Modify your content
- Restrict your access
- Take ownership of your work

This is the future of publishing.`,
        imageUrl: '/saito/img/dreamscape.png',
        timestamp: Date.now() - 86400000 * 5, // 5 days ago
        url: window.location.href + '#post/demo-peer-to-peer'
      },
      {
        title: 'Advanced Monetization Strategies',
        subtitle:
          'This premium content explores advanced techniques for monetizing your writing through NFT subscriptions.',
        text: `# Advanced Monetization Strategies

This premium content explores advanced techniques for monetizing your writing through NFT subscriptions, custom access rules, and building sustainable revenue streams.

## Subscription Tiers

Saito Stack supports multiple subscription models:

### Free Tier
- Build your audience
- Establish credibility
- Create a content library
- Attract subscribers

### Paid Tier
- Generate revenue
- Offer exclusive content
- Reward loyal readers
- Build a sustainable business

## Setting Up Subscriptions

To monetize your content:

1. Define your subscription tiers
2. Set pricing for each tier
3. Create premium content
4. Market to your audience

## Access Control

Control who can access your content:

- Free posts: Available to everyone
- Subscriber-only: Requires active subscription
- Premium: Higher-tier subscribers only
- Custom: Define your own access rules

## Building Revenue

Successful monetization requires:

- Consistent, high-quality content
- Clear value proposition
- Engaged community
- Strategic pricing

## Best Practices

- Start with free content to build trust
- Gradually introduce paid tiers
- Offer exclusive benefits to subscribers
- Engage with your community regularly

Remember: The best monetization strategy is one that provides genuine value to your readers.`,
        imageUrl: '/saito/img/dreamscape.png',
        timestamp: Date.now() - 86400000 * 7, // 7 days ago
        url: window.location.href + '#post/demo-monetization'
      }
    ];

    // Create and cache each demo transaction
    // Use for...of loop to properly handle async operations
    for (let index = 0; index < demoPosts.length; index++) {
      const postData = demoPosts[index];
      try {
        // Create a new transaction
        const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);

        // Set transaction message with blog post data
        tx.msg = {
          module: this.name,
          request: 'create stack post request',
          data: {
            type: 'stack_post',
            title: postData.title,
            subtitle: postData.subtitle || '',
            text: postData.text, // Use 'text' field for body content
            content: postData.text, // Also set content for compatibility
            image: '',
            imageUrl: postData.imageUrl || '',
            images: [],
            url: postData.url || '',
            tags: [],
            timestamp: postData.timestamp || Date.now(),
            subscriptionTier: 'free',
            excerpt: postData.subtitle || ''
          }
        };

        // Sign the transaction
        await tx.sign();

        // Add to transactionCache (keyed by signature)
        const signature = tx.signature;
        if (signature) {
          this.transactionCache[signature] = tx;
        }

        // Add to postsCache (for Explorer discovery)
        const from = tx.from && tx.from.length > 0 ? tx.from[0].publicKey : this.publicKey;
        const txmsg = tx.returnMessage();
        const post = {
          ...txmsg.data,
          sig: signature,
          publicKey: from,
          timestamp: txmsg.data.timestamp || tx.timestamp,
          lastEdited: txmsg.data.timestamp || tx.timestamp
        };

        // Add to allPosts
        this.postsCache.allPosts.push(post);

        // Add to byAuthor cache
        if (!this.postsCache.byAuthor.has(from)) {
          this.postsCache.byAuthor.set(from, []);
        }
        this.postsCache.byAuthor.get(from).push(post);

        console.debug(
          `Stack: Generated demo post "${postData.title}" (${signature.substring(0, 16)}...)`
        );
      } catch (error) {
        console.error(`Stack: Failed to generate demo post ${index + 1}:`, error);
      }
    }
  }
}

module.exports = Stack;
