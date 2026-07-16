const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublishSettingsTemplate = require('./publish-settings.template');

class PublishSettingsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.createNftOverlay = null;
    this.postState = {
      published: false,
      accessLevel: 'public', // 'public', 'private', 'subscription'
      accessMode: 'transferable', // kept for publish intent; not shown in UI
      description: '',
      image: null,
      imageUrl: null,
      customCSS: ''
    };
    // Wizard navigation + future check hooks (null = not yet resolved)
    this.wizardState = {
      step: 1,
      hasSaito: null,
      hasAccessKey: null,
      isListedInStore: null,
      createNftStatus: null,
      pendingNftId: null,
      pendingNftSignature: null
    };
    this._isSliding = false;
  }

  render(postData = {}, options = {}) {
    const { preserveStep = false } = options;

    this.postState = {
      ...this.postState,
      ...postData
    };

    if (!preserveStep) {
      this.wizardState = {
        step: 1,
        hasSaito: null,
        hasAccessKey: null,
        isListedInStore: null,
        createNftStatus: null,
        pendingNftId: null,
        pendingNftSignature: null
      };
    }

    if (this.postState.accessLevel === 'private' || this.postState.accessLevel === 'subscription') {
      if (!this.postState.accessMode) {
        this.postState.accessMode = 'transferable';
      }
    } else if (this.postState.accessLevel === 'public') {
      this.postState.accessMode = null;
    }

    if (this.mod.create_post_ui && this.mod.create_post_ui.featuredImage) {
      this.postState.image = this.mod.create_post_ui.featuredImage;
    }

    const html = PublishSettingsTemplate(this.app, this.mod, this.postState, this.wizardState);
    this.overlay.show(html);

    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  /**
   * Re-render only the step panel + action buttons without remounting the overlay.
   * Used for wizard Next/Back with horizontal slide animation.
   */
  async renderStep(direction = 'forward') {
    if (this._isSliding) return;
    this._isSliding = true;

    const panel = document.querySelector('#stack-publish-step-panel');
    const actionBar = document.querySelector('.stack-publish-global-action');
    if (!panel) {
      this._isSliding = false;
      this.render(this.postState, { preserveStep: true });
      return;
    }

    const exitClass =
      direction === 'forward' ? 'stack-publish-slide-exit-left' : 'stack-publish-slide-exit-right';
    const enterClass =
      direction === 'forward' ? 'stack-publish-slide-enter-right' : 'stack-publish-slide-enter-left';

    panel.classList.add(exitClass);
    await this._wait(180);

    const html = PublishSettingsTemplate(this.app, this.mod, this.postState, this.wizardState);
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();

    const newPanel = temp.querySelector('#stack-publish-step-panel');
    const newActionBar = temp.querySelector('.stack-publish-global-action');

    if (newPanel) {
      newPanel.classList.add(enterClass);
      panel.replaceWith(newPanel);
      // Double rAF so the enter transform is painted before we ease to rest
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            newPanel.classList.remove(enterClass);
            resolve();
          });
        });
      });
    }

    if (actionBar && newActionBar) {
      actionBar.replaceWith(newActionBar);
    }

    this.attachEvents();
    await this._wait(220);
    this._isSliding = false;
  }

  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  attachEvents() {
    if (this._waitingInterval) {
      clearInterval(this._waitingInterval);
      this._waitingInterval = null;
    }
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }

    const isWaiting = this.wizardState.createNftStatus === 'waiting';
    const keyPhrase =
      this.postState.accessLevel === 'subscription' ? 'Subscription Key' : 'Access Key';
    const keysPhrase =
      this.postState.accessLevel === 'subscription' ? 'Subscription Keys' : 'Access Keys';
    const waitingMessage = `You'll be back in control in just a moment. We're waiting for your ${keysPhrase} to arrive.`;

    const overlayCloseBtn = document.querySelector('.saito-overlay-close');
    if (overlayCloseBtn) {
      overlayCloseBtn.onclick = () => {
        if (this._waitingInterval) {
          clearInterval(this._waitingInterval);
          this._waitingInterval = null;
        }
        if (this._countdownInterval) {
          clearInterval(this._countdownInterval);
          this._countdownInterval = null;
        }
        this.overlay.hide();
      };
    }

    const accessCards = document.querySelectorAll('.stack-publish-access-card');
    const accessCheckboxes = document.querySelectorAll('.stack-publish-access-checkbox');

    accessCards.forEach((card) => {
      card.onclick = (e) => {
        if (e.target.type === 'checkbox') return;

        const checkbox = card.querySelector('.stack-publish-access-checkbox');
        const accessValue = card.getAttribute('data-access');

        accessCheckboxes.forEach((cb) => {
          if (cb !== checkbox) {
            cb.checked = false;
            cb.closest('.stack-publish-access-card')?.classList.remove(
              'stack-publish-access-card-active'
            );
          }
        });

        checkbox.checked = true;
        card.classList.add('stack-publish-access-card-active');
        this.setAccessLevel(accessValue);
      };
    });

    accessCheckboxes.forEach((checkbox) => {
      checkbox.onchange = () => {
        const card = checkbox.closest('.stack-publish-access-card');
        const accessValue = card?.getAttribute('data-access');

        if (checkbox.checked) {
          accessCheckboxes.forEach((cb) => {
            if (cb !== checkbox) {
              cb.checked = false;
              cb.closest('.stack-publish-access-card')?.classList.remove(
                'stack-publish-access-card-active'
              );
            }
          });
          card?.classList.add('stack-publish-access-card-active');
          this.setAccessLevel(accessValue);
        } else {
          checkbox.checked = true;
        }
      };
    });

    // Icon-only delete (bare <i>, same pattern as choose-draft) — not a <button>
    const deleteDraftBtn = document.querySelector('#stack-publish-delete-draft-btn');
    if (deleteDraftBtn) {
      deleteDraftBtn.onclick = (e) => {
        e.preventDefault();
        this.handleDeleteDraft();
      };
      deleteDraftBtn.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleDeleteDraft();
        }
      };
    }

    const backBtn = document.querySelector('#stack-publish-back-btn');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        if (isWaiting) {
          siteMessage(waitingMessage, 3500);
          return;
        }
        this.handleBack();
      };
    }

    const publishImmediately = document.querySelector('#stack-publish-immediately');
    if (publishImmediately) {
      publishImmediately.onclick = (e) => {
        e.preventDefault();
        if (isWaiting) {
          siteMessage(waitingMessage, 3500);
          return;
        }
        this.handlePublish();
      };
    }

    // Panel 2 — open Create NFT with Stack Access type pre-selected
    const createKeysLink = document.querySelector('#stack-create-access-key-link');
    if (createKeysLink) {
      createKeysLink.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openCreateNft();
      };
    }

    const tokensLink = document.querySelector('#stack-publish-tokens-link');
    if (tokensLink) {
      tokensLink.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Placeholder until token faucet / purchase flow is confirmed for this screen
      };
    }

    const primaryBtn = document.querySelector('#stack-publish-primary-btn');
    if (primaryBtn) {
      primaryBtn.onclick = (e) => {
        e.preventDefault();
        if (isWaiting) {
          siteMessage(waitingMessage, 3500);
          return;
        }
        const action = primaryBtn.getAttribute('data-action') || 'publish';
        if (action === 'next') {
          this.handleNext();
        } else {
          this.handlePublish();
        }
      };
    }

    if (isWaiting) {
      const countdownEl = document.querySelector('#stack-publish-countdown');
      const reassuranceEl = document.querySelector('#stack-publish-reassurance');
      const reassuranceMessages = [
        'Your wallet will update automatically.',
        `We're waiting for the network to confirm your ${keyPhrase}.`,
        'This usually takes around 30 seconds.'
      ];
      let seconds = 29;
      let reassuranceIndex = 0;

      if (countdownEl) {
        countdownEl.textContent = String(seconds);
      }

      (async () => {
        try {
          await this.app.wallet.updateNFTList();
          const nftList = this.app.options.wallet.nfts || [];
          let found = false;

          for (const rec of nftList) {
            const nftType = this.app.wallet.extractNFTType(rec.slip3?.utxo_key || '');
            if (nftType !== 'stack') {
              continue;
            }
            if (this.wizardState.pendingNftSignature && rec.tx_sig === this.wizardState.pendingNftSignature) {
              found = true;
              break;
            }
            if (this.wizardState.pendingNftId && rec.id === this.wizardState.pendingNftId) {
              found = true;
              break;
            }
            const creator = rec.slip1?.public_key || '';
            if (creator === this.mod.publicKey) {
              found = true;
              break;
            }
          }

          if (found && this.wizardState.createNftStatus === 'waiting') {
            if (this._waitingInterval) {
              clearInterval(this._waitingInterval);
              this._waitingInterval = null;
            }
            if (this._countdownInterval) {
              clearInterval(this._countdownInterval);
              this._countdownInterval = null;
            }
            this.wizardState.createNftStatus = 'confirmed';
            this.wizardState.hasAccessKey = true;
            this.render(this.postState, { preserveStep: true });
          }
        } catch (err) {
          console.warn('Stack publish: waiting for Access Key', err);
        }
      })();

      this._countdownInterval = setInterval(() => {
        seconds -= 1;
        if (countdownEl) {
          countdownEl.textContent = String(Math.max(0, seconds));
        }
        if (seconds > 0 && seconds % 10 === 0 && reassuranceEl) {
          reassuranceIndex = (reassuranceIndex + 1) % reassuranceMessages.length;
          reassuranceEl.textContent = reassuranceMessages[reassuranceIndex];
        }
      }, 1000);

      this._waitingInterval = setInterval(async () => {
        try {
          await this.app.wallet.updateNFTList();
          const nftList = this.app.options.wallet.nfts || [];
          let found = false;

          for (const rec of nftList) {
            const nftType = this.app.wallet.extractNFTType(rec.slip3?.utxo_key || '');
            if (nftType !== 'stack') {
              continue;
            }
            if (this.wizardState.pendingNftSignature && rec.tx_sig === this.wizardState.pendingNftSignature) {
              found = true;
              break;
            }
            if (this.wizardState.pendingNftId && rec.id === this.wizardState.pendingNftId) {
              found = true;
              break;
            }
            const creator = rec.slip1?.public_key || '';
            if (creator === this.mod.publicKey) {
              found = true;
              break;
            }
          }

          if (found) {
            clearInterval(this._waitingInterval);
            clearInterval(this._countdownInterval);
            this._waitingInterval = null;
            this._countdownInterval = null;
            this.wizardState.createNftStatus = 'confirmed';
            this.wizardState.hasAccessKey = true;
            this.render(this.postState, { preserveStep: true });
          }
        } catch (err) {
          console.warn('Stack publish: waiting for Access Key', err);
        }
      }, 2000);
    }
  }

  /**
   * Open the shared Create NFT dialog with Stack Access type pre-selected.
   * Prefers the header-owned instance so we do not register a second event listener.
   */
  openCreateNft() {
    let createNft =
      this.mod.header &&
      this.mod.header.select_nft_overlay &&
      this.mod.header.select_nft_overlay.create_nft_overlay;

    if (!createNft) {
      if (!this.createNftOverlay) {
        const CreateNFT = require('../../../../../lib/saito/ui/saito-nft/overlays/create-overlay');
        this.createNftOverlay = new CreateNFT(this.app, this.mod);
      }
      createNft = this.createNftOverlay;
    }

    const DREAMSCAPE = '/saito/img/dreamscape.png';
    const username =
      this.app.keychain.returnUsername(this.mod.publicKey) || 'this author';

    createNft.render({
      type: 'stack',
      title: 'Stack Access Key',
      description: `This NFT provides read-access to ${username}'s posts on Saito Stack.`,
      image: DREAMSCAPE,
      locked: ['type'],
      callback: (obj) => {
        if (obj?.status === 'created') {
          this.wizardState.hasAccessKey = true;
          this.wizardState.createNftStatus = 'waiting';
          this.wizardState.pendingNftId = obj.nft_id || null;
          this.wizardState.pendingNftSignature = obj.signature || null;
          this.render(this.postState, { preserveStep: true });
        }

        if (obj?.status === 'cancelled') {
          this.wizardState.createNftStatus = 'cancelled';
          this.render(this.postState, { preserveStep: true });
        }
      }
    });
  }

  handleDeleteDraft() {
    if (confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      if (this.mod.create_post_ui && this.mod.create_post_ui.draftTransaction) {
        this.app.storage
          .deleteTransaction(this.mod.create_post_ui.draftTransaction, null, 'localhost')
          .then(() => {
            this.mod.create_post_ui.draftTransaction = null;

            const editor = document.querySelector('#stack-post-body-editor');
            if (editor && this.mod.create_post_ui) {
              const { parseMarkdownToDocument, renderDocument } = require('../../post-document');
              const emptyDocument = parseMarkdownToDocument('');
              renderDocument(emptyDocument, editor, { contentEditable: true });
              this.mod.create_post_ui.updatePlaceholderVisibility();
              this.mod.create_post_ui.updatePublishTriggerVisibility();
            }

            const titleInput = document.querySelector('#stack-post-title-input');
            if (titleInput) {
              titleInput.value = '';
            }

            this.overlay.hide();

            if (this.mod.main) {
              setTimeout(() => {
                this.mod.main.render();
              }, 100);
            }

            siteMessage('Draft deleted', 1500);
          })
          .catch((error) => {
            console.error('Error deleting draft transaction:', error);
            siteMessage('Failed to delete draft. Please try again.');
          });
      } else {
        const editor = document.querySelector('#stack-post-body-editor');
        if (editor && this.mod.create_post_ui) {
          const { parseMarkdownToDocument, renderDocument } = require('../../post-document');
          const emptyDocument = parseMarkdownToDocument('');
          renderDocument(emptyDocument, editor, { contentEditable: true });
          this.mod.create_post_ui.updatePlaceholderVisibility();
          this.mod.create_post_ui.updatePublishTriggerVisibility();
        }

        const titleInput = document.querySelector('#stack-post-title-input');
        if (titleInput) {
          titleInput.value = '';
        }

        this.overlay.hide();

        if (this.mod.main) {
          setTimeout(() => {
            this.mod.main.render();
          }, 100);
        }

        siteMessage('Draft deleted', 1500);
      }
    }
  }

  setAccessLevel(level) {
    // Only reset when the access type actually changes
    if (this.postState.accessLevel === level) {
      return;
    }

    this.postState.accessLevel = level;

    if (level === 'public') {
      this.postState.accessMode = null;
    } else if ((level === 'private' || level === 'subscription') && !this.postState.accessMode) {
      this.postState.accessMode = 'transferable';
    }

    // Changing access type always returns to step 1
    this.wizardState.step = 1;
    this.wizardState.hasAccessKey = null;
    this.wizardState.isListedInStore = null;
    this.wizardState.hasSaito = null;
    this.wizardState.createNftStatus = null;
    this.wizardState.pendingNftId = null;
    this.wizardState.pendingNftSignature = null;

    this.render(this.postState, { preserveStep: true });
  }

  handleBack() {
    if (this.wizardState.createNftStatus === 'waiting') {
      const keysPhrase =
        this.postState.accessLevel === 'subscription' ? 'Subscription Keys' : 'Access Keys';
      siteMessage(
        `You'll be back in control in just a moment. We're waiting for your ${keysPhrase} to arrive.`,
        3500
      );
      return;
    }

    if (this.wizardState.step <= 1) {
      this.overlay.hide();
      return;
    }

    this.wizardState.step -= 1;
    this.renderStep('back');
  }

  async handleNext() {
    if (this.wizardState.createNftStatus === 'waiting') {
      const keysPhrase =
        this.postState.accessLevel === 'subscription' ? 'Subscription Keys' : 'Access Keys';
      siteMessage(
        `You'll be back in control in just a moment. We're waiting for your ${keysPhrase} to arrive.`,
        3500
      );
      return;
    }

    const level = this.postState.accessLevel;
    if (level !== 'private' && level !== 'subscription') {
      return;
    }

    const nextStep = this.wizardState.step + 1;

    // Resolve stubbed checks when entering the relevant steps
    if (nextStep === 2) {
      const keyState = await this.resolveAccessKeyState();
      this.wizardState.hasSaito = keyState.hasSaito;
      this.wizardState.hasAccessKey = keyState.hasAccessKey;
      this.wizardState.createNftStatus = null;
    } else if (nextStep === 3) {
      const listingState = await this.resolveStoreListingState();
      this.wizardState.isListedInStore = listingState.isListedInStore;
    }

    this.wizardState.step = Math.min(nextStep, 4);
    await this.renderStep('forward');
  }

  /**
   * Future: check wallet SAITO balance and whether an appropriate Access Key NFT exists.
   * Until wired, returns unresolved stubs so the UI shows the create path.
   *
   * @returns {Promise<{ hasSaito: boolean|null, hasAccessKey: boolean|null }>}
   */
  async resolveAccessKeyState() {
    try {
      await this.app.wallet.updateNFTList();
      const nftList = this.app.options.wallet.nfts || [];

      for (const rec of nftList) {
        const nftType = this.app.wallet.extractNFTType(rec.slip3?.utxo_key || '');
        if (nftType !== 'stack') {
          continue;
        }
        const creator = rec.slip1?.public_key || '';
        if (creator === this.mod.publicKey) {
          return {
            hasSaito: null,
            hasAccessKey: true
          };
        }
      }
    } catch (err) {
      console.warn('Stack publish: resolveAccessKeyState', err);
    }

    return {
      hasSaito: null,
      hasAccessKey: false
    };
  }

  /**
   * Future: check whether the Access Key NFT is already listed in the Saito Store.
   * Until wired, returns unresolved stub so the UI offers listing.
   *
   * @returns {Promise<{ isListedInStore: boolean|null }>}
   */
  async resolveStoreListingState() {
    // Placeholder — connect Store listing lookup here
    return {
      isListedInStore: null
    };
  }

  async handlePublish() {
    if (this.wizardState.createNftStatus === 'waiting') {
      const keysPhrase =
        this.postState.accessLevel === 'subscription' ? 'Subscription Keys' : 'Access Keys';
      siteMessage(
        `You'll be back in control in just a moment. We're waiting for your ${keysPhrase} to arrive.`,
        3500
      );
      return;
    }

    let wallet_balance = await this.app.wallet.getBalance('SAITO');
    if (Number(wallet_balance) == 0) {
      siteMessage('A Saito balance is needed to Publish Posts...', 3000);
      this.app.connection.emit('saito-purchase-launch');
      return;
    }

    const title = document.querySelector('#stack-post-title-input')
      ? document.querySelector('#stack-post-title-input').value || ''
      : '';
    let content = '';

    if (this.mod.create_post_ui) {
      // ------------------------------------------------------------
      // CRITICAL: Build imageIdMap BEFORE serialization (publish mode)
      // ------------------------------------------------------------
      if (typeof this.mod.create_post_ui.buildImageIdMap === 'function') {
        this.mod.create_post_ui.buildImageIdMap();
      }

      content = this.mod.create_post_ui.serializeDOMToMarkdown(
        this.mod.create_post_ui.imageIdMap || null
      );
    }

    // ========================================================================
    // VALIDATION GUARD: Prevent publishing empty posts (no title AND no content)
    // ========================================================================
    const titleEmpty = !title.trim();
    const contentEmpty = !content.trim();

    if (titleEmpty && contentEmpty) {
      siteMessage('Please add a title or some content before publishing.');
      return;
    }

    try {
      const parent_id =
        this.mod.create_post_ui && this.mod.create_post_ui.parent_id
          ? this.mod.create_post_ui.parent_id
          : null;

      if (parent_id) {
        siteMessage('Updating post...', 1500);
      } else {
        siteMessage('Publishing post...', 1500);
      }

      const draftIdToDelete = this.mod.create_post_ui
        ? this.mod.create_post_ui.activeDraftId
        : null;
      const draftTxToDelete = this.mod.create_post_ui
        ? this.mod.create_post_ui.draftTransaction
        : null;

      const featuredImage =
        this.mod.create_post_ui && this.mod.create_post_ui.featuredImage
          ? this.mod.create_post_ui.featuredImage
          : this.postState.image || '';

      // ========================================================================
      // PUBLISH INTENT: Generate normalized intent object from UI selection
      // ========================================================================
      const visibility = this.postState.accessLevel || 'public';

      let publishIntent;
      if (visibility === 'public') {
        publishIntent = {
          visibility: 'public',
          access_mode: null,
          time_limit: null,
          author: this.mod.publicKey
        };
      } else if (visibility === 'private') {
        const accessMode = this.postState.accessMode || 'transferable';
        publishIntent = {
          visibility: 'private',
          access_mode: accessMode,
          time_limit: null,
          author: this.mod.publicKey
        };
      } else if (visibility === 'subscription') {
        const accessMode = this.postState.accessMode || 'transferable';
        publishIntent = {
          visibility: 'subscription',
          access_mode: accessMode,
          time_limit: null,
          author: this.mod.publicKey
        };
      } else {
        publishIntent = {
          visibility: 'public',
          access_mode: null,
          time_limit: null,
          author: this.mod.publicKey
        };
      }

      const publishedTx = await this.mod.createStackPostTransaction(
        {
          title,
          content,
          image: featuredImage,
          images: Array.isArray(this.mod.create_post_ui?.images)
            ? this.mod.create_post_ui.images
            : [],
          imageUrl: this.postState.imageUrl,
          tags: [],
          timestamp: Date.now(),
          subscriptionTier: this.postState.accessLevel === 'public' ? 'free' : 'paid',
          excerpt:
            this.postState.description || content.substring(0, 200).replace(/\n/g, ' ').trim(),
          publishIntent: publishIntent,
          accessLevel: this.postState.accessLevel,
          parent_id: parent_id
        },
        () => {
          this.postState.published = true;
        }
      );

      if (parent_id && this.mod.applyOptimisticPostUpdate) {
        this.mod.applyOptimisticPostUpdate(publishedTx);
      }

      if (publishedTx && publishedTx.signature) {
        const txmsg = publishedTx.returnMessage();
        const from =
          publishedTx.from && publishedTx.from.length > 0
            ? publishedTx.from[0].publicKey
            : this.mod.publicKey;

        if (txmsg && txmsg.data && from) {
          const incomingLogicalPostId = this.mod.getLogicalPostId(publishedTx);
          const postParentId = txmsg.data.parent_id || null;

          if (this.mod.postsCache) {
            if (this.mod.postsCache.allPosts) {
              try {
                this.mod.postsCache.allPosts = this.mod.postsCache.allPosts.filter((p) => {
                  if (!p) return false;
                  try {
                    return this.mod.getLogicalPostIdFromPost(p) !== incomingLogicalPostId;
                  } catch (err) {
                    console.warn('Stack: Error filtering post from allPosts cache:', err);
                    return true;
                  }
                });
              } catch (err) {
                console.error('Stack: Error filtering allPosts cache:', err);
              }
            }

            if (this.mod.postsCache.byAuthor && this.mod.postsCache.byAuthor.has(from)) {
              try {
                const authorPosts = this.mod.postsCache.byAuthor.get(from);
                const filteredAuthorPosts = authorPosts.filter((p) => {
                  if (!p) return false;
                  try {
                    return this.mod.getLogicalPostIdFromPost(p) !== incomingLogicalPostId;
                  } catch (err) {
                    console.warn('Stack: Error filtering post from byAuthor cache:', err);
                    return true;
                  }
                });
                this.mod.postsCache.byAuthor.set(from, filteredAuthorPosts);
              } catch (err) {
                console.error('Stack: Error filtering byAuthor cache:', err);
              }
            }
          }

          const post = {
            ...txmsg.data,
            sig: publishedTx.signature,
            publicKey: from,
            timestamp: txmsg.data.timestamp || publishedTx.timestamp,
            lastEdited: txmsg.data.timestamp || publishedTx.timestamp,
            parent_id: postParentId
          };

          this.mod.transactionCache[publishedTx.signature] = publishedTx;

          if (this.mod.postsCache && this.mod.postsCache.allPosts) {
            const existingIndex = this.mod.postsCache.allPosts.findIndex(
              (p) => p.sig === publishedTx.signature
            );
            if (existingIndex < 0) {
              this.mod.postsCache.allPosts.push(post);
            } else {
              this.mod.postsCache.allPosts[existingIndex] = post;
            }
          }

          if (this.mod.postsCache && this.mod.postsCache.byAuthor) {
            if (!this.mod.postsCache.byAuthor.has(from)) {
              this.mod.postsCache.byAuthor.set(from, []);
            }
            const authorPosts = this.mod.postsCache.byAuthor.get(from);
            const existingIndex = authorPosts.findIndex((p) => p.sig === publishedTx.signature);
            if (existingIndex < 0) {
              authorPosts.push(post);
            } else {
              authorPosts[existingIndex] = post;
            }
          }
        }
      }

      console.log('[DRAFT-CHECK] Publishing post - deleting draft:', draftIdToDelete || 'N/A');

      if (draftIdToDelete && this.mod.deleteDraft) {
        const deleted = await this.mod.deleteDraft(draftIdToDelete);
        console.log('[DRAFT-CHECK] Draft deleted from archive and memory:', deleted);
      } else if (draftTxToDelete) {
        try {
          await this.app.storage.deleteTransaction(draftTxToDelete, null, 'localhost');
          if (this.mod.refreshDrafts) {
            await this.mod.refreshDrafts();
          }
          console.log('[DRAFT-CHECK] Draft transaction deleted via fallback');
        } catch (err) {
          console.warn('Stack: Error deleting draft transaction:', err);
        }
      }

      if (this.mod.create_post_ui) {
        this.mod.create_post_ui.activeDraftId = null;
        this.mod.create_post_ui.draftTransaction = null;
        this.mod.create_post_ui.sessionIntent = null;
        this.mod.create_post_ui.isPublished = true;
      }

      this.overlay.hide();

      if (
        this.mod.create_post_ui &&
        typeof this.mod.create_post_ui.onEditorUnmount === 'function'
      ) {
        this.mod.create_post_ui.onEditorUnmount();
      }

      if (!this.mod.viewPostComponent) {
        const ViewPost = require('../view-post');
        this.mod.viewPostComponent = new ViewPost(this.app, this.mod, '.saito-container');
      }

      this.mod.viewPostComponent.render(publishedTx);

      if (publishedTx && publishedTx.signature) {
        const authorPublicKey = this.mod.publicKey;
        if (authorPublicKey) {
          const canonicalUrl = `/${this.mod.slug}/${authorPublicKey}/${publishedTx.signature}`;
          window.history.pushState(
            { view: 'stack_post', publicKey: authorPublicKey, signature: publishedTx.signature },
            null,
            canonicalUrl
          );
        }
      }

      const finalParentId = publishedTx
        ? publishedTx.returnMessage()?.data?.parent_id || null
        : null;
      if (finalParentId) {
        siteMessage('Post updated', 1500);
      } else {
        siteMessage('Stack post published', 1500);
      }
    } catch (error) {
      console.error('Error publishing post:', error);
      const parent_id =
        this.mod.create_post_ui && this.mod.create_post_ui.parent_id
          ? this.mod.create_post_ui.parent_id
          : null;
      if (parent_id) {
        siteMessage('Unable to update post', 3000);
      } else {
        siteMessage('Unable to publish post', 3000);
      }
      siteMessage('Failed to publish post. Please try again.');
    }
  }

  handleViewPreview() {
    this.overlay.hide();
    if (this.mod.previewOverlay) {
      this.mod.previewOverlay.render();
    }
  }
}

module.exports = PublishSettingsOverlay;
