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
    this.posts = {};
    this.lastTimeStamp = {};
    this.isLoading = true;
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

    this.subscriptions = this.calculateSubscriptions();

    if (!this.targetPublicKey) {
      this.targetPublicKey = this.mod.STACK_OFFICIAL_PUBLICKEY;
    }

    const html = ExploreTemplate(this.app, this.mod, this.subscriptions);
    this.overlay.show(html);

    setTimeout(() => {
      this.attachEvents();
      this.updateHelpNoteVisibility();
      // Load posts after attaching events (skip if URL-based routing already loaded posts)
      this.loadPostsForFilter(this.targetPublicKey);
    }, 25);
  }

  createLabel(publicKey) {
    if (publicKey == this.mod.STACK_OFFICIAL_PUBLICKEY) {
      return 'SaitoOfficial';
    }

    if (publicKey == this.mod.publicKey) {
      return 'My Posts';
    }

    return this.app.keychain.returnUsername(publicKey);
  }

  //
  // URL - publicKey on top of list, then Official, then My Posts, then whatever is in in app.options.stack.subscriptions
  // We prevent duplication of items if the URL is one of our otherwise listed publicKeys
  //
  calculateSubscriptions() {
    let subscriptions = [];

    // 1. URL-driven single-user view
    if (this.targetPublicKey) {
      subscriptions = [
        {
          publickey: this.targetPublicKey,
          icon: 'fa-solid fa-user',
          label: this.createLabel(this.targetPublicKey),
          source: 'url'
        }
      ];
    }

    if (this.targetPublicKey !== this.mod.STACK_OFFICIAL_PUBLICKEY) {
      subscriptions.push({
        icon: 'fa-solid fa-user',
        label: 'SaitoOfficial',
        publickey: this.mod.STACK_OFFICIAL_PUBLICKEY,
        source: 'default'
      });
    }

    if (this.targetPublicKey !== this.mod.publicKey) {
      subscriptions.push({
        icon: 'fa-solid fa-user',
        label: 'My Posts',
        publickey: this.mod.publicKey,
        source: 'default'
      });
    }

    for (let pk of this.mod.getSubscriptions()) {
      if (this.targetPublicKey !== pk) {
        subscriptions.push({
          publickey: pk,
          icon: 'fa-solid fa-user',
          label: this.createLabel(pk),
          source: 'subscription'
        });
      }
    }

    return subscriptions;
  }

  updateHelpNoteVisibility() {
    // Count subscription items
    const subscriptionItems = document.querySelectorAll(
      '.stack-explore-subscriptions-list .stack-explore-subscription-item'
    );
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

    const currentUserPublicKey = this.targetPublicKey || this.mod.publicKey;

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
      currentUserPublicKey,
      'Explore', // User notice parameter for description
      '' // fourthelem
    );
    saitoUser.render();

    // Show/hide subscribe button based on subscription status
    // Hide action buttons when Subscribe button is shown (mutually exclusive)
    const isSubscribed = this.mod.isSubscribed(currentUserPublicKey);
    const subscribeBtnContainer = document.querySelector(
      '#stack-explore-subscribe-button-container'
    );
    const actionBtnContainer = document.querySelector('.stack-explore-action-button-container');
    if (subscribeBtnContainer) {
      subscribeBtnContainer.style.display = isSubscribed ? 'none' : 'block';
    }
    if (actionBtnContainer) {
      actionBtnContainer.style.display = isSubscribed ? 'flex' : 'none';
    }

    // ========================================================================
    // INVARIANT 3: Update action buttons based on filter
    // ========================================================================
    const shareAuthorBtn = document.getElementById('stack-explore-author-share');
    if (shareAuthorBtn) {
      if (currentUserPublicKey == this.mod.STACK_OFFICIAL_PUBLICKEY) {
        shareAuthorBtn.style.display = 'none';
      } else {
        shareAuthorBtn.style.display = '';
      }
    }

    const settingsBtn = document.querySelector('#stack-explore-settings-btn');
    if (settingsBtn) {
      // Temporary since there is no connected functionality
      //settingsBtn.style.display = currentUserPublicKey === this.mod.publicKey ? '' : 'none';
    }

    const postBtn = document.querySelector('#stack-explore-new-post-btn');
    if (postBtn) {
      if (currentUserPublicKey === this.mod.publicKey) {
        postBtn.style.display = '';
        this.attachGetStartedHandler();
      } else {
        postBtn.style.display = 'none';
      }
    }
  }

  /**
   * Loads posts for the given filter using loadPostsForAuthor().
   * Shows loading state, then populated or empty state.
   */
  async loadPostsForFilter(author) {
    if (!author) {
      console.warn('No author resolved for filter:', author);
      return;
    }

    let ts = Date.now();

    // Don't harrass the server with pull requests...
    if (!this.lastTimeStamp[author] || ts - this.lastTimeStamp[author] > 120000) {
      this.isLoading = true;
      this.updatePostsGrid(author);

      // Delegate ALL loading to the author loader
      console.log('fetching', author);
      let posts = await this.mod.loadPostsForAuthor(author, { forceRemote: true });
      this.posts[author] = posts;
      this.lastTimeStamp[author] = ts;
    }

    this.isLoading = false;
    this.updatePostsGrid(author);
  }

  /**
   * Updates the posts grid with current state (loading, empty, or populated).
   */
  updatePostsGrid(author = '') {
    const grid = document.querySelector('#stack-explore-posts-grid');
    if (!grid) {
      return;
    }

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
    } else if (this.posts[author]?.length > 0) {
      const teaserHtml = this.posts[author]
        .map((transaction) => {
          const teaser = new PostTeaser(this.app, this.mod, '', transaction);
          return teaser.render(); // Returns HTML string for batch rendering
        })
        .join('');

      grid.innerHTML = teaserHtml;
      // Re-attach click handlers for new posts
      this.attachPostClickHandlers();
    } else {
      if (author == this.mod.publicKey) {
        grid.innerHTML = `
        <div class="stack-explore-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; padding: 4rem 2rem; text-align: center;">
          <i class="fa-solid fa-newspaper" style="font-size: 4rem; color: var(--saito-font-color-light); opacity: 0.5; margin-bottom: 2rem;"></i>
          <h3 style="font-size: 2rem; font-weight: 600; color: var(--saito-font-color); margin: 0 0 1rem 0;">Welcome</h3>
          <p style="font-size: 1.6rem; color: var(--saito-font-color-light); margin: 0; max-width: 500px; line-height: 1.6;">
            You haven't published any posts yet. <span class="stack-alt-new-post saito-anchor">Get started now<span>
          </p>
        </div>
      `;
        this.attachGetStartedHandler();
      } else {
        // Show empty state for reading
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
  }

  pruneEditedPosts() {
    if (!Array.isArray(this.posts[this.targetPublicKey])) {
      return;
    }
    let hasChildren = new Set();

    // First pass: record all parents that have edits
    for (const tx of this.posts[this.targetPublicKey]) {
      if (!tx?.signature) {
        continue;
      }
      let msg = tx.returnMessage?.();
      if (msg?.data?.parent_id) {
        hasChildren.add(msg?.data?.parent_id);
      }
    }

    // Second pass: keep only latest leaf nodes
    this.posts[this.targetPublicKey] = this.posts[this.targetPublicKey].filter((tx) => {
      if (!tx?.signature) {
        return false;
      }

      const msg = tx.returnMessage?.();
      const ts = msg?.data?.timestamp ?? 0;

      // Rule 1: remove anything that has been edited
      if (hasChildren.has(tx.signature)) {
        return false;
      }

      // Rule 2: among siblings, keep only newest
      if (msg?.data?.parent_id) {
        return !this.posts[this.targetPublicKey].some((other) => {
          if (!other?.signature) {
            return false;
          }
          const om = other.returnMessage?.();
          return om?.data?.parent_id === msg?.data?.parent_id && (om?.data?.timestamp ?? 0) > ts;
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
    teasers.forEach((teaser) => {
      // Get transaction signature from DOM (preferred) or fallback to post-id
      const txSignature =
        teaser.getAttribute('data-tx-signature') || teaser.getAttribute('data-post-id');
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
        let tx = this.posts[this.targetPublicKey].find((p) => p.signature === txSignature) || null;

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

  attachGetStartedHandler() {
    Array.from(document.querySelectorAll('.stack-alt-new-post')).forEach((btn) => {
      btn.onclick = (e) => {
        document.querySelector('#stack-create-post-btn').click();
        this.overlay.hide();
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
            ${
              txSignature
                ? `
              <p style="font-size: 1.4rem; color: var(--saito-font-color-light); margin: 1.5rem 0 0 0; opacity: 0.7; font-family: monospace; word-break: break-all;">
                ${txSignature.substring(0, 32)}...
              </p>
            `
                : ''
            }
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

      // Add subscription function -> in help / bottom of the explore list
      const addSubscriptionBtn = document.querySelector('#stack-explore-add-subscription-btn');
      if (addSubscriptionBtn) {
        addSubscriptionBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleAddSubscription();
        };
      }

      // Mobile Alternate
      const mobileAddBtn = document.querySelector('.stack-explorer-mobile-icon');
      if (mobileAddBtn) {
        mobileAddBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleAddSubscription();
        };
      }

      const shareAuthorBtn = document.getElementById('stack-explore-author-share');
      if (shareAuthorBtn) {
        shareAuthorBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          let shareUrl = window.location.origin + `/${this.mod.slug}/${this.targetPublicKey}`;
          let title = 'Stack Creator';
          if (this.app.keychain.returnIdentifierByPublicKey(this.targetPublicKey)) {
            title += ' --- ' + this.app.keychain.returnIdentifierByPublicKey(this.targetPublicKey);
          }

          this.app.browser.handleShare({
            title,
            url: shareUrl
          });
        };
      }

      // Hide action buttons if Subscribe button is visible (mutually exclusive)
      if (!this.targetPublicKey) {
        const subscribeBtnContainer = document.querySelector(
          '#stack-explore-subscribe-button-container'
        );
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

      const settingsBtn = document.querySelector('#stack-explore-settings-btn');
      if (settingsBtn) {
        settingsBtn.onclick = (e) => {
          siteMessage('Saito Stack is Under Development...', 2000);
        };
      }

      // Subscription/Identity list items
      const subscriptionItems = document.querySelectorAll(
        '.stack-explore-subscriptions-list .stack-explore-subscription-item'
      );
      subscriptionItems.forEach((item) => {
        item.onclick = (e) => {
          e.preventDefault();
          // Remove active class from all items
          subscriptionItems.forEach((i) => i.classList.remove('active'));
          // Add active class to clicked item
          item.classList.add('active');
          const filter = item.getAttribute('data-filter');
          // IMPORTANT: user-driven navigation overrides URL bootstrap
          this.targetPublicKey = filter;
          // Update author header based on selection
          this.updateAuthorHeader();
          // Load posts for the selected filter
          this.loadPostsForFilter(filter);
        };
      });

      // Mobile author selector
      const mobileSelector = document.querySelector('.stack-explorer-mobile-selector');
      if (mobileSelector) {
        mobileSelector.onchange = (e) => {
          e.preventDefault;
          let filter = e.currentTarget.value;
          // IMPORTANT: user-driven navigation overrides URL bootstrap
          this.targetPublicKey = filter;
          // Update author header based on selection
          this.updateAuthorHeader();
          // Load posts for the selected filter
          this.loadPostsForFilter(filter);
        };
      }

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
  async handleAddSubscription() {
    const promptText = await sprompt('Enter Saito username or public key:');
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
        if (!input.includes('@')) {
          input += '@saito';
        }
        // Try to resolve username to publicKey via keychain
        const keyData = this.app.keychain.returnKey({ identifier: input });
        if (keyData && keyData.publicKey) {
          publicKey = keyData.publicKey;
        } else {
          siteMessage(`Unable to find ${input}, Please check and try again`, 5000);
          return;
        }
      }

      // Validate publicKey
      if (!this.app.wallet.isValidPublicKey(publicKey)) {
        siteMessage('Invalid public key. Please check and try again', 5000);
        return;
      }

      // Add subscription
      const added = this.mod.addSubscription(publicKey);
      if (added) {
        // Refresh the overlay to show new subscription
        this.mod.exploreOverlay.render();
      } else {
        siteMessage('Already subscribed to this creator.', 5000);
      }
    } catch (error) {
      console.error('Stack: Error adding subscription:', error);
      siteMessage('Error adding subscription. Please try again.', 5000);
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
      const subscribeContainer = document.querySelector(
        '#stack-explore-subscribe-button-container'
      );
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
