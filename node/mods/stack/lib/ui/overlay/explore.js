const ExploreTemplate = require('./explore.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ViewPost = require('../view-post');
const SaitoUser = require('../../../../../lib/saito/ui/saito-user/saito-user');
const PostTeaser = require('../post-teaser');

class ExploreOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.posts = [];
    this.isLoading = false;
    this.currentFilter = 'all';
    this.subscriptions = [];
    this.targetPublicKey = null; // For URL-based routing: publicKey to show posts for
  }

  async render() {
    // ========================================================================
    // INVARIANT 4: Unmount before navigating to explore (navigation path: editor → explore)
    // ========================================================================
    if (this.mod.create_post_ui && typeof this.mod.create_post_ui.onEditorUnmount === 'function') {
      this.mod.create_post_ui.onEditorUnmount();
    }

    // Show loading state initially
    this.isLoading = true;
    this.posts = [];
    
    this.subscriptions = this.calculateSubscriptions();

    const html = ExploreTemplate(this.app, this.mod, this.posts, this.isLoading, this.subscriptions);
    this.overlay.show(html);
    
    setTimeout(() => {
      this.attachEvents();
      this.updateHelpNoteVisibility();
      // Load posts after attaching events (skip if URL-based routing already loaded posts)
      if (!(this.targetPublicKey && this.currentFilter === 'creator')) {
        this.loadPostsForFilter(this.currentFilter);
      }
    }, 25);
  }

  calculateSubscriptions() {

    let subscriptions = [];

    // 1. URL-driven single-user view
    if (this.targetPublicKey) {
      subscriptions = [{
        publickey: this.targetPublicKey,
	icon : "fa-solid fa-user",
        label : this.app.keychain.returnUsername(this.targetPublicKey),
        source: "url"
      }];
    }

    
    subscriptions.push({ icon : "fa-solid fa-user", label : "SaitoOfficial" , publickey: this.mod.STACK_OFFICIAL_PUBLICKEY, source: "default" });
    subscriptions.push({ icon : "fa-solid fa-user", label : "My Posts" , publickey: 'my-posts', source: "default" });

    if (
      this.app.options?.stack?.subscriptions &&
      Array.isArray(this.app.options.stack.subscriptions) &&
      this.app.options.stack.subscriptions.length > 0
    ) {
      for (let pk in this.app.options.stack.subscriptions) {
        subscriptions.push({
          publickey: pk,
	  icon : "fa-solid fa-user",
          label : this.app.keychain.returnUsername(pk),
	  source: "subscription"
        });
      }
    }

    return subscriptions;
  }

  updateHelpNoteVisibility() {
    // Count subscription items
    const subscriptionItems = document.querySelectorAll('.stack-explore-subscription-item');
    const helpNote = document.querySelector('.stack-explore-help-note');
    
    if (helpNote && subscriptionItems.length > 2) {
      // Hide help note if more than 2 subscriptions
      helpNote.classList.add('hide-help');
    } else if (helpNote) {
      // Show help note if 2 or fewer subscriptions
      helpNote.classList.remove('hide-help');
    }
  }

  updateAuthorHeader() {
    const authorHeader = document.querySelector('#stack-explore-author-header');
    if (!authorHeader) return;

    // ========================================================================
    // INVARIANT 1: User identity MUST NEVER disappear
    // ========================================================================
    // Always render the CURRENT user's identity in the header, regardless of filter.
    // "My Posts" is a filter, not a different header mode.
    const currentUserPublicKey = this.mod.publicKey || '';
    if (!currentUserPublicKey) {
      // If no user key available, cannot render - but this should never happen
      console.warn('Stack: No current user public key available for header');
      return;
    }

    // URL-based routing: if targetPublicKey is set, show that user's posts
    if (this.targetPublicKey) {
      // Clear header
      authorHeader.innerHTML = '';

      // Create container for author identity (viewing another user)
      const authorIdentityContainer = document.createElement('div');
      authorIdentityContainer.id = 'stack-explore-author-identity';
      authorHeader.appendChild(authorIdentityContainer);

      // Render the target user's identity
      const saitoUser = new SaitoUser(
        this.app,
        this.mod,
        '#stack-explore-author-identity',
        this.targetPublicKey,
        'Posts by this author', // Use notice parameter for description
        '' // fourthelem
      );
      saitoUser.render();

      // Show/hide subscribe button based on subscription status
      // Hide action buttons when Subscribe button is shown (mutually exclusive)
      const isSubscribed = this.mod.isSubscribed(this.targetPublicKey);
      const subscribeBtnContainer = document.querySelector('#stack-explore-subscribe-button-container');
      const actionBtnContainer = document.querySelector('.stack-explore-action-button-container');
      if (subscribeBtnContainer) {
        subscribeBtnContainer.style.display = isSubscribed ? 'none' : 'block';
      }
      if (actionBtnContainer) {
        actionBtnContainer.style.display = isSubscribed ? 'flex' : 'none';
      }
      return;
    }

    // ========================================================================
    // NON-URL ROUTING: Always show current user's identity
    // ========================================================================
    // Clear existing content (but preserve structure - SaitoUser will replace the placeholder)
    // Keep subscribe button container if it exists
    const subscribeContainer = authorHeader.querySelector('#stack-explore-subscribe-button-container');
    authorHeader.innerHTML = '';
    if (subscribeContainer) {
      authorHeader.appendChild(subscribeContainer);
    }

    // Find the currently active subscription item
    const activeItem = document.querySelector('.stack-explore-subscription-item.active');
    if (!activeItem) {
      // No active item - still show current user with default description
      const saitoUser = new SaitoUser(
        this.app,
        this.mod,
        '#stack-explore-author-header',
        currentUserPublicKey,
        'Explore',
        ''
      );
      saitoUser.render();
      return;
    }

    const filter = activeItem.getAttribute('data-filter');
    let description = 'Explore';

    if (filter === 'my-posts') {
      description = 'Your Posts';
    } else if (filter === 'all') {
      description = 'Explore';
    }

    // ========================================================================
    // INVARIANT 1: ALWAYS render current user's identity
    // ========================================================================
    const saitoUser = new SaitoUser(
      this.app,
      this.mod,
      '#stack-explore-author-header',
      currentUserPublicKey, // ALWAYS current user, regardless of filter
      description,
      ''
    );
    saitoUser.render();

    // ========================================================================
    // INVARIANT 3: Update action buttons based on filter
    // ========================================================================
    const addUserBtn = document.querySelector('#stack-explore-add-subscription-btn');
    const settingsBtn = document.querySelector('#stack-explore-settings-btn');
    
    if (filter === 'my-posts') {
      if (addUserBtn) addUserBtn.style.display = 'none';
      if (settingsBtn) settingsBtn.style.display = '';
    } else {
      // Show Add User button for general feeds (all, etc.)
      if (addUserBtn) addUserBtn.style.display = '';
      if (settingsBtn) settingsBtn.style.display = 'none';
    }
  }

  /**
   * Loads posts for the given filter using loadPostsForAuthor().
   * Shows loading state, then populated or empty state.
   */
  async loadPostsForFilter(filter) {

    this.isLoading = true;
 
  console.log("loadPostsForFilter:", filter);

    this.isLoading = true;
    this.posts = [];
    this.targetPublicKey = null;
    let author = null;

    // Resolve UI filter → concrete author
    if (filter === "my-posts") {
      author = this.app.wallet.publicKey;
    } else {
      author = filter;
    }

    this.updatePostsGrid(author);

    if (!author) {
      console.warn("No author resolved for filter:", filter);
      return;
    }

    // Delegate ALL loading to the author loader
    this.posts = await this.mod.loadPostsForAuthor(author, { forceRemote: true });
    this.isLoading = false;
    this.updatePostsGrid(author);

  }
   
  /**
   * Updates the posts grid with current state (loading, empty, or populated).
   */
  updatePostsGrid(author="") {

    const grid = document.querySelector('#stack-explore-posts-grid');
    if (!grid) { return; }

    this.pruneEditedPosts();

    if (this.isLoading) {
      // PART 5: Show loading spinner with "Fetching latest posts…" message
      grid.innerHTML = `
        <div class="stack-explore-loading" style="display: flex; justify-content: center; align-items: center; min-height: 200px; padding: 4rem 2rem;">
          <div style="text-align: center;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 3rem; color: var(--saito-font-color-light); margin-bottom: 1rem;"></i>
            <p style="color: var(--saito-font-color-light); font-size: 1.6rem;">Fetching latest posts…</p>
          </div>
        </div>
      `;
    } else if (this.posts.length > 0) {

for (let z = 0; z < this.posts.length; z++) {
console.log("z: " + this.posts[z].from[0].publicKey);
console.log("tx sig: " + this.posts[z].signature);
console.log("txmsg: " + JSON.stringify(this.posts[z].returnMessage()));
}

      const teaserHtml = this.posts.map(transaction => {
        const teaser = new PostTeaser(this.app, this.mod, '', transaction);
        return teaser.render(); // Returns HTML string for batch rendering
      }).join('');
      
      grid.innerHTML = teaserHtml;
      // Re-attach click handlers for new posts
      this.attachPostClickHandlers();
    } else {
      // Show empty state
      grid.innerHTML = `
        <div class="stack-explore-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; padding: 4rem 2rem; text-align: center;">
          <i class="fa-solid fa-newspaper" style="font-size: 4rem; color: var(--saito-font-color-light); opacity: 0.5; margin-bottom: 2rem;"></i>
          <h3 style="font-size: 2rem; font-weight: 600; color: var(--saito-font-color); margin: 0 0 1rem 0;">No posts available</h3>
          <p style="font-size: 1.6rem; color: var(--saito-font-color-light); margin: 0; max-width: 500px; line-height: 1.6;">
            No posts are visible at this time. This may be because no posts have been published yet, or you may need to subscribe to see content from this creator.
          </p>
        </div>
      `;
    }
  }


  pruneEditedPosts() {

    if (!Array.isArray(this.posts)) { return; }
    let hasChildren = new Set();

    // First pass: record all parents that have edits
    for (const tx of this.posts) {
      if (!tx?.signature) { continue; }
      let msg = tx.returnMessage?.();
      if (msg?.data?.parent_id) {
        hasChildren.add(msg?.data?.parent_id);
      }
    }

    // Second pass: keep only latest leaf nodes
    this.posts = this.posts.filter(tx => {
      if (!tx?.signature) { return false; }

      const msg = tx.returnMessage?.();
      const ts  = msg?.data?.timestamp ?? 0;

      // Rule 1: remove anything that has been edited
      if (hasChildren.has(tx.signature)) { return false; }

      // Rule 2: among siblings, keep only newest
      if (msg?.data?.parent_id) {
        return !this.posts.some(other => {
          if (!other?.signature) { return false; }
          const om = other.returnMessage?.();
          return (
            om?.data?.parent_id === msg?.data?.parent_id &&
            (om?.data?.timestamp ?? 0) > ts
          );
        });
      }

      return true;
    });

  }


  /**
   * Attaches click handlers to post teasers.
   * Each teaser should load ViewPost with its transaction.
   * Resolves transactions from cache using signature.
   */
  attachPostClickHandlers() {
    const teasers = document.querySelectorAll('.stack-post-teaser');
    teasers.forEach(teaser => {
      // Get transaction signature from DOM (preferred) or fallback to post-id
      const txSignature = teaser.getAttribute('data-tx-signature') || teaser.getAttribute('data-post-id');
      if (!txSignature) return;

      // Remove existing click handlers to avoid duplicates
      const newTeaser = teaser.cloneNode(true);
      teaser.parentNode.replaceChild(newTeaser, teaser);

      // Attach click handler
      newTeaser.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Close the explore overlay
        this.overlay.hide();
        
        // Resolve transaction from cache
        // First try this.posts (already loaded)
        let tx = this.posts.find(p => p.signature === txSignature) || null;
        
        // If not found, try Stack module cache
        if (!tx && this.mod.transactionCache && this.mod.transactionCache[txSignature]) {
          tx = this.mod.transactionCache[txSignature];
        }
        
        // If still not found, try loading via middleware (cache → localhost → peers)
        if (!tx && this.mod.loadPost) {
          try {
            tx = await this.mod.loadPost(txSignature, {}, null);
          } catch (error) {
            console.debug('Stack: Failed to load transaction:', error);
          }
        }
        
        // Load ViewPost with transaction (or show error if not found)
        this.loadViewPost(tx, txSignature);
      };
    });
  }

  /**
   * Loads ViewPost into the main saito-container.
   * Handles missing transactions gracefully with error message.
   * 
   * @param {Transaction|null} tx - The transaction to render, or null if not found
   * @param {string} txSignature - The transaction signature (for error messages)
   */
  loadViewPost(tx = null, txSignature = null) {
    // ========================================================================
    // INVARIANT 4: Unmount before navigating to viewer (navigation path: explore → viewer)
    // ========================================================================
    if (this.mod.create_post_ui && typeof this.mod.create_post_ui.onEditorUnmount === 'function') {
      this.mod.create_post_ui.onEditorUnmount();
    }

    const container = document.querySelector('.saito-container');
    if (!container) return;

    // Reset scroll position immediately
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (container.scrollTop !== undefined) {
      container.scrollTop = 0;
    }

    // Store current opacity if already set
    const currentOpacity = container.style.opacity || '1';

    // Fade out existing content
    container.style.transition = 'opacity 200ms ease-out';
    container.style.opacity = '0';

    // After fade out, replace content and fade in
    setTimeout(() => {
      // Clear container
      container.innerHTML = '';

      // If transaction is missing, show error message
      if (!tx) {
        const errorHtml = `
          <div class="stack-view-post-error" style="padding: 4rem 2rem; text-align: center; max-width: 600px; margin: 0 auto;">
            <i class="fa-solid fa-exclamation-circle" style="font-size: 4rem; color: var(--saito-font-color-light); opacity: 0.5; margin-bottom: 2rem;"></i>
            <h2 style="font-size: 2.4rem; font-weight: 600; color: var(--saito-font-color); margin: 0 0 1.5rem 0;">Post Not Available</h2>
            <p style="font-size: 1.8rem; color: var(--saito-font-color-light); margin: 0; line-height: 1.6;">
              This post could not be loaded or is no longer available.
            </p>
            ${txSignature ? `
              <p style="font-size: 1.4rem; color: var(--saito-font-color-light); margin: 1.5rem 0 0 0; opacity: 0.7; font-family: monospace; word-break: break-all;">
                ${txSignature.substring(0, 32)}...
              </p>
            ` : ''}
          </div>
        `;
        container.innerHTML = errorHtml;
      } else {
        // Create and render ViewPost with the transaction
        // ViewPost renders solely from the provided Transaction
        const viewPost = new ViewPost(this.app, this.mod, '.saito-container', tx);
        viewPost.render(tx);
      }

      // Fade in new content
      requestAnimationFrame(() => {
        container.style.transition = 'opacity 200ms ease-in';
        container.style.opacity = '0';

        // Trigger reflow, then fade in
        void container.offsetHeight;

        requestAnimationFrame(() => {
          container.style.opacity = '1';

          // Reset scroll position after content is visible
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            if (container.scrollTop !== undefined) {
              container.scrollTop = 0;
            }
            // Clean up inline styles after transition completes
            setTimeout(() => {
              container.style.transition = '';
              container.style.opacity = '';
            }, 200);
          }, 50);
        });
      });
    }, 200);
  }

  attachEvents() {
    try {
      // Update author header on initial load
      this.updateAuthorHeader();
      
      // Add subscription button (in main panel header, right-aligned)
      const addSubscriptionBtn = document.querySelector('#stack-explore-add-subscription-btn');
      if (addSubscriptionBtn) {
        addSubscriptionBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleAddSubscription();
        };
      }
      
      // Hide action buttons if Subscribe button is visible (mutually exclusive)
      if (!this.targetPublicKey) {
        const subscribeBtnContainer = document.querySelector('#stack-explore-subscribe-button-container');
        const actionBtnContainer = document.querySelector('.stack-explore-action-button-container');
        if (subscribeBtnContainer && actionBtnContainer) {
          const isSubscribeVisible = subscribeBtnContainer.style.display !== 'none';
          actionBtnContainer.style.display = isSubscribeVisible ? 'none' : 'flex';
        }
      }

      // Subscribe button (for URL-based creator view)
      const subscribeBtn = document.querySelector('#stack-explore-subscribe-btn');
      if (subscribeBtn) {
        subscribeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleSubscribeToCreator();
        };
      }
      
      // Subscription/Identity list items
      const subscriptionItems = document.querySelectorAll('.stack-explore-subscription-item');
      subscriptionItems.forEach(item => {
        item.onclick = (e) => {
          e.preventDefault();
	  // IMPORTANT: user-driven navigation overrides URL bootstrap
  	  this.mod.targetPublicKey = null;
          // Remove active class from all items
          subscriptionItems.forEach(i => i.classList.remove('active'));
          // Add active class to clicked item
          item.classList.add('active');
          const filter = item.getAttribute('data-filter');
          // Update author header based on selection
          this.updateAuthorHeader();
          // Load posts for the selected filter
          this.loadPostsForFilter(filter);
        };
      });

      // Post teaser clicks are now handled by attachPostClickHandlers()
      // This is called after posts are loaded
      this.attachPostClickHandlers();
    } catch (err) {
      console.error('Explore overlay attachEvents error:', err);
    }
  }

  /**
   * Handle manual subscription addition via "+" icon
   * Opens a modal/overlay to enter username or publicKey
   */
  handleAddSubscription() {
    const promptText = prompt('Enter Saito username or public key:');
    if (!promptText || !promptText.trim()) {
      return; // User cancelled or entered empty
    }

    const input = promptText.trim();
    this.resolveAndSubscribe(input);
  }

  /**
   * Resolve username/publicKey and add subscription
   * @param {string} input - Username or publicKey
   */
  async resolveAndSubscribe(input) {
    try {
      let publicKey = input;

      // Check if input is a valid publicKey
      if (!this.app.wallet.isValidPublicKey(input)) {
        // Try to resolve username to publicKey via keychain
        const keyResponse = this.app.connection.respondTo('saito-return-key');
        if (keyResponse && keyResponse.returnKey) {
          const keyData = keyResponse.returnKey({ identifier: input });
          if (keyData && keyData.publicKey) {
            publicKey = keyData.publicKey;
          } else {
            alert('Unable to find user with that username or public key. Please check and try again.');
            return;
          }
        } else {
          alert('Unable to resolve username. Please enter a valid public key.');
          return;
        }
      }

      // Validate publicKey
      if (!this.app.wallet.isValidPublicKey(publicKey)) {
        alert('Invalid public key. Please check and try again.');
        return;
      }

      // Add subscription
      const added = this.mod.addSubscription(publicKey);
      if (added) {
        // Refresh the overlay to show new subscription
        this.mod.exploreOverlay.render();
      } else {
        alert('Already subscribed to this creator.');
      }
    } catch (error) {
      console.error('Stack: Error adding subscription:', error);
      alert('Error adding subscription. Please try again.');
    }
  }

  /**
   * Handle contextual subscription (when viewing creator via URL)
   * Adds the targetPublicKey to subscriptions
   */
  handleSubscribeToCreator() {
    if (!this.targetPublicKey) {
      return;
    }

    const added = this.mod.addSubscription(this.targetPublicKey);
    if (added) {
      // Hide subscribe button and show action buttons (mutually exclusive)
      const subscribeContainer = document.querySelector('#stack-explore-subscribe-button-container');
      const actionBtnContainer = document.querySelector('.stack-explore-action-button-container');
      if (subscribeContainer) {
        subscribeContainer.style.display = 'none';
      }
      if (actionBtnContainer) {
        actionBtnContainer.style.display = 'flex';
      }
      
      // Show success message
      siteMessage('Subscribed!', 2000);
    }
  }
}

module.exports = ExploreOverlay;

