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
    // Wizard navigation + distribution options (survive access switches via preserveStep)
    this.wizardState = {
      step: 1,
      hasSaito: null,
      hasAccessKey: null,
      isListedInStore: null,
      createNftStatus: null,
      pendingNftId: null,
      pendingNftSignature: null,
      // Same-session mint tx — wallet NFT records keep slips/tx_sig only.
      pendingNftTx: null,
      // Distribution options (default checked).
      linkToProfile: true,
      tweetOnPublish: true
    };
    this._isSliding = false;
    // Stack post signatures already cross-posted to RedSquare this session.
    this._redSquareCrossPostedSigs = new Set();
  }

  /**
   * Read persisted distribution choices from the editor session (if any).
   */
  readPersistedDistribution() {
    const saved = this.mod.create_post_ui?.publishDistribution;
    if (!saved || typeof saved !== 'object') {
      return { linkToProfile: true, tweetOnPublish: true };
    }
    return {
      linkToProfile: saved.linkToProfile !== false,
      tweetOnPublish: saved.tweetOnPublish !== false
    };
  }

  /**
   * Persist distribution choices on the editor so overlay re-opens keep them.
   */
  persistDistribution() {
    if (!this.mod.create_post_ui) {
      return;
    }
    this.mod.create_post_ui.publishDistribution = {
      linkToProfile: this.wizardState.linkToProfile !== false,
      tweetOnPublish: this.wizardState.tweetOnPublish !== false
    };
  }

  render(postData = {}, options = {}) {
    const { preserveStep = false } = options;

    this.postState = {
      ...this.postState,
      ...postData
    };

    if (!preserveStep) {
      const distribution = this.readPersistedDistribution();
      this.wizardState = {
        step: 1,
        hasSaito: null,
        hasAccessKey: null,
        isListedInStore: null,
        createNftStatus: null,
        pendingNftId: null,
        pendingNftSignature: null,
        pendingNftTx: null,
        linkToProfile: distribution.linkToProfile,
        tweetOnPublish: distribution.tweetOnPublish
      };
      this.persistDistribution();
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
    const actionBar = document.querySelector('.publish .actions');
    if (!panel) {
      this._isSliding = false;
      this.render(this.postState, { preserveStep: true });
      return;
    }

    const exitClass =
      direction === 'forward' ? 'slide-exit-left' : 'slide-exit-right';
    const enterClass =
      direction === 'forward'
        ? 'slide-enter-right'
        : 'slide-enter-left';

    panel.classList.add(exitClass);
    await this._wait(180);

    const html = PublishSettingsTemplate(this.app, this.mod, this.postState, this.wizardState);
    const temp = document.createElement('div');
    temp.innerHTML = html.trim();

    const newPanel = temp.querySelector('#stack-publish-step-panel');
    const newActionBar = temp.querySelector('.publish .actions');

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
		const overlayCloseBtn = document.querySelector('.saito-overlay-close');
		if (overlayCloseBtn) {
			overlayCloseBtn.onclick = () => {
				this.overlay.hide();
			};
		}

		const accessCards = document.querySelectorAll('.publish .access-card');
		const accessCheckboxes = document.querySelectorAll('.publish .access-checkbox');

		accessCards.forEach((card) => {
			card.onclick = (e) => {
				if (e.target.type === 'checkbox') {
					return;
				}

				const checkbox = card.querySelector('.access-checkbox');
				const accessValue = card.getAttribute('data-access');

				accessCheckboxes.forEach((cb) => {
					if (cb !== checkbox) {
						cb.checked = false;
						cb.closest('.access-card')?.classList.remove(
							'active'
						);
					}
				});

				checkbox.checked = true;
				card.classList.add('active');
				this.setAccessLevel(accessValue);
			};
		});

		accessCheckboxes.forEach((checkbox) => {
			checkbox.onchange = () => {
				const card = checkbox.closest('.access-card');
				const accessValue = card?.getAttribute('data-access');

				if (checkbox.checked) {
					accessCheckboxes.forEach((cb) => {
						if (cb !== checkbox) {
							cb.checked = false;
							cb.closest('.access-card')?.classList.remove(
								'active'
							);
						}
					});
					card?.classList.add('active');
					this.setAccessLevel(accessValue);
				} else {
					checkbox.checked = true;
				}
			};
		});

		const profileToggle = document.querySelector(
			'.publish [data-action="toggle-profile-link"]'
		);
		if (profileToggle) {
			profileToggle.onchange = async () => {
				this.wizardState.linkToProfile = profileToggle.checked;
				this.persistDistribution();
				// Uncheck removes the Profile stack link immediately.
				// Check only records intent — Profile is updated on Publish.
				if (!profileToggle.checked) {
					try {
						await this.mod.updateProfile?.('');
					} catch (err) {
						console.warn('Stack: profile link clear failed', err?.message || err);
						profileToggle.checked = true;
						this.wizardState.linkToProfile = true;
						this.persistDistribution();
					}
				}
			};
		}

		const tweetToggle = document.querySelector(
			'.publish [data-action="toggle-tweet-on-publish"]'
		);
		if (tweetToggle) {
			tweetToggle.onchange = () => {
				this.wizardState.tweetOnPublish = tweetToggle.checked;
				this.persistDistribution();
			};
		}

		const deleteDraftBtn = document.querySelector('#stack-publish-delete-draft-btn');
		if (deleteDraftBtn) {
			deleteDraftBtn.onclick = (e) => {
				e.preventDefault();
				this.handleDeleteDraft();
			};
		}

		const backBtn = document.querySelector('#stack-publish-back-btn');
		if (backBtn) {
			backBtn.onclick = (e) => {
				e.preventDefault();
				this.handleBack();
			};
		}

		const publishImmediately = document.querySelector('#stack-publish-immediately');
		if (publishImmediately) {
			const publishNow = (e) => {
				e.preventDefault();
				this.handlePublish();
			};
			publishImmediately.onclick = publishNow;
			publishImmediately.onkeydown = (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					publishNow(e);
				}
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

		const listKeysLink = document.querySelector('#stack-list-access-key-link');
		if (listKeysLink) {
			listKeysLink.onclick = async (e) => {
				e.preventDefault();
				e.stopPropagation();

				const seller = this.app.modules.returnFirstRespondTo('saito-sell-nft');
				if (!seller) {
					return;
				}

				const nftList = this.app.options.wallet.nfts || [];
				let rec = null;
				for (const r of nftList) {
					const nftType = this.app.wallet.extractNFTType(r.slip3?.utxo_key || '');
					if (nftType !== 'stack') {
						continue;
					}
					if (
						this.wizardState.pendingNftSignature &&
						r.tx_sig === this.wizardState.pendingNftSignature
					) {
						rec = r;
						break;
					}
					if (this.wizardState.pendingNftId && r.id === this.wizardState.pendingNftId) {
						rec = r;
						break;
					}
					const creator = r.slip1?.public_key || '';
					if (creator === this.mod.publicKey) {
						rec = r;
						break;
					}
				}
				if (!rec) {
					return;
				}

				const SaitoNFT = require('../../../../../lib/saito/ui/saito-nft/saito-nft');
				// Prefer the mint tx retained from create (wallet records do not store full txs).
				const access_key_nft = new SaitoNFT(
					this.app,
					this.mod,
					this.wizardState.pendingNftTx || null,
					rec
				);
				if (!access_key_nft.tx && typeof access_key_nft.fetchTransaction === 'function') {
					await new Promise((resolve) => {
						let settled = false;
						const finish = () => {
							if (!settled) {
								settled = true;
								resolve();
							}
						};
						access_key_nft.fetchTransaction(finish);
						setTimeout(finish, 8000);
					});
				}
				if (!access_key_nft.tx) {
					siteMessage(
						'Could not load the Access Key transaction yet. Wait a moment and try again.',
						4000
					);
					return;
				}

				const total =
					Number(access_key_nft.getTotalAmount?.() || access_key_nft.amount || rec.amount || 1) ||
					1;

				seller.render({
					nft: access_key_nft,
					quantity: Math.max(1, total - 1),
					callback: (result) => {
						if (result?.status === 'listed') {
							this.wizardState.isListedInStore = true;
							this.render(this.postState, { preserveStep: true });
						}
					}
				});
			};
		}

		const tokensLink = document.querySelector('#stack-publish-tokens-link');
		if (tokensLink) {
			tokensLink.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
			};
		}

		const primaryBtn = document.querySelector('#stack-publish-primary-btn');
		if (primaryBtn) {
			primaryBtn.onclick = (e) => {
				e.preventDefault();
				const action = primaryBtn.getAttribute('data-action') || 'publish';
				if (action === 'next') {
					this.handleNext();
				} else {
					this.handlePublish();
				}
			};
		}
	}

  /**
   * Open the shared Create NFT dialog with Stack Access type pre-selected.
   * Prefers the header-owned instance so we do not register a second event listener.
   */
  async openCreateNft() {
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

    const username = this.app.keychain.returnUsername(this.mod.publicKey) || 'this author';

    let wallet_balance = await this.app.wallet.getBalance('SAITO');
    let quantity = 1;
    if (Number(wallet_balance) > 100) {
      quantity = 100;
    } else if (Number(wallet_balance) > 10) {
      quantity = 10;
    }
    this.wizardState.createQuantity = quantity;

    let image;
    try {
      const imgPath =
        this.postState.accessLevel === 'subscription'
          ? '/stack/img/saito-stack-subscription.png'
          : '/stack/img/saito-stack-access-key.png';
      const response = await fetch(imgPath);
      if (response.ok) {
        const blob = await response.blob();
        image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (err) {}

		const defaults = {
			type: 'stack',
			title: 'Stack Access Key',
			description: `This NFT provides read-access to ${username}'s posts on Saito Stack.`,
			quantity: quantity,
			deposit: quantity,
			locked: ['type'],
			callback: (obj) => {
				if (obj?.status === 'created') {
					this.wizardState.createNftStatus = 'waiting';
					this.wizardState.pendingNftId = obj.nft_id || null;
					this.wizardState.pendingNftSignature = obj.signature || null;
					this.wizardState.pendingNftTx = obj.tx || null;

					const keyLabel =
						this.postState.accessLevel === 'subscription'
							? 'Subscription Key'
							: 'Access Key';

					this.overlay.hide();
					this.watchTransaction(obj.tx, {
						title: `Creating ${keyLabel}`,
						lead: `Your ${keyLabel} is being broadcast to the Saito network.`,
						subtitle: 'Waiting for confirmation...',
						successTitle: `${keyLabel} Confirmed`,
						successLead: `Your ${keyLabel} has been confirmed and is available in your wallet.`,
						onConfirmed: () => {
							this.wizardState.createNftStatus = 'confirmed';
							this.wizardState.hasAccessKey = true;
							this.render(this.postState, { preserveStep: true });
						},
						onCancelled: () => {
							this.wizardState.createNftStatus = 'cancelled';
							this.render(this.postState, { preserveStep: true });
						}
					});
					return;
				}

				if (obj?.status === 'cancelled') {
					this.wizardState.createNftStatus = 'cancelled';
					this.render(this.postState, { preserveStep: true });
				}
			}
		};
    if (image) {
      defaults.image = image;
    }

    createNft.render(defaults);
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
    this.wizardState.pendingNftTx = null;
    this.wizardState.createQuantity = null;

    this.render(this.postState, { preserveStep: true });
  }

	handleBack() {
		if (this.wizardState.step <= 1) {
			this.overlay.hide();
			return;
		}

		this.wizardState.step -= 1;
		this.renderStep('back');
	}

	async handleNext() {
		const level = this.postState.accessLevel;
		if (level !== 'private' && level !== 'subscription') {
			return;
		}

    const nextStep = this.wizardState.step + 1;

    // Resolve checks when entering panel 2
    if (nextStep === 2) {
      const keyState = await this.resolveAccessKeyState();
      this.wizardState.hasSaito = keyState.hasSaito;
      this.wizardState.hasAccessKey = keyState.hasAccessKey;
      this.wizardState.createNftStatus = null;

      let wallet_balance = await this.app.wallet.getBalance('SAITO');
      let quantity = 1;
      if (Number(wallet_balance) > 100) {
        quantity = 100;
      } else if (Number(wallet_balance) > 10) {
        quantity = 10;
      }
      this.wizardState.createQuantity = quantity;
    }

    this.wizardState.step = Math.min(nextStep, 2);
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

	watchTransaction(tx, {
		title = 'Waiting for Confirmation',
		lead = '',
		subtitle = 'Waiting for confirmation...',
		successTitle = 'Confirmed',
		successLead = '',
		onConfirmed = null,
		onCancelled = null
	} = {}) {
		if (!this.mod.transaction_monitor) {
			console.error('Stack: transaction_monitor is not initialized');
			if (typeof onCancelled === 'function') {
				onCancelled();
			}
			return;
		}

		this.mod.transaction_monitor.render({
			tx,
			title,
			lead,
			subtitle,
			successTitle,
			successLead,
			successActionLabel: 'Continue',
			callback: (result) => {
				if (result?.status === 'confirmed') {
					if (typeof onConfirmed === 'function') {
						onConfirmed(result);
					}
					return;
				}
				if (result?.status === 'cancelled') {
					if (typeof onCancelled === 'function') {
						onCancelled(result);
					}
				}
			}
		});
	}

	async handlePublish() {
		let wallet_balance = await this.app.wallet.getBalance('SAITO');
		if (Number(wallet_balance) == 0) {
			siteMessage('A Saito balance is needed to Publish Posts...', 3000);
			this.app.connection.emit('saito-purchase-launch');
			return;
		}

    const title =
      this.mod.create_post_ui && typeof this.mod.create_post_ui.getDocumentTitle === 'function'
        ? this.mod.create_post_ui.getDocumentTitle()
        : document.querySelector('#stack-post-title-input')
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

			// Checked: ensure Profile has the Stack URL (no-op if already set).
			// Same distribution option for every access level.
			if (this.wizardState.linkToProfile !== false) {
				try {
					const url = this.mod.returnStackUrl?.(this.mod.publicKey) || '';
					if (url && this.mod.returnProfileStackUrl?.() !== url) {
						await this.mod.updateProfile?.(url);
					}
				} catch (err) {
					console.warn('Stack: profile stack link publish skipped', err?.message || err);
				}
			}

			// Optional RedSquare cross-post after the Stack article has a signature.
			if (this.wizardState.tweetOnPublish !== false) {
				await this.crossPostToRedSquare(publishedTx, title);
			}

			this.overlay.hide();

			if (
				this.mod.create_post_ui &&
				typeof this.mod.create_post_ui.onEditorUnmount === 'function'
			) {
				this.mod.create_post_ui.onEditorUnmount();
			}

			const isUpdate = !!parent_id;
			this.watchTransaction(publishedTx, {
				title: isUpdate ? 'Updating Post' : 'Publishing Post',
				lead: isUpdate
					? 'Your update is being broadcast to the Saito network.'
					: 'Your post is being broadcast to the Saito network.',
				subtitle: 'Waiting for confirmation...',
				successTitle: isUpdate ? 'Post Updated' : 'Post Published',
				successLead: isUpdate
					? 'Your update has been confirmed and is now available on the network.'
					: 'Your post has been confirmed and is now available on the network.',
				onConfirmed: () => {
					this.openPublishedPost(publishedTx);
				},
				onCancelled: () => {
					// Transaction was already broadcast — still open the post view.
					this.openPublishedPost(publishedTx);
				}
			});
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

	/**
	 * Create a normal RedSquare post linking to the published Stack article.
	 * Idempotent per Stack post signature for this overlay session.
	 * Only runs after Stack publish returned a signed transaction.
	 */
	async crossPostToRedSquare(publishedTx, title = '') {
		if (!publishedTx || !publishedTx.signature) {
			return;
		}

		const stackSig = String(publishedTx.signature);
		if (this._redSquareCrossPostedSigs.has(stackSig)) {
			return;
		}

		// Updates to an existing article should not spawn another tweet.
		const parentId = publishedTx.returnMessage?.()?.data?.parent_id || null;
		if (parentId) {
			return;
		}

		const redsquare =
			this.app.modules.returnModule?.('RedSquare') ||
			this.app.modules.returnModuleByName?.('RedSquare');
		if (!redsquare || typeof redsquare.createTweetTransaction !== 'function') {
			return;
		}

		const authorPublicKey = this.mod.publicKey;
		if (!authorPublicKey) {
			return;
		}

		const path = `/${this.mod.slug}/${authorPublicKey}/${stackSig}`;
		const absoluteUrl =
			typeof window !== 'undefined' && window.location?.origin
				? `${window.location.origin}${path}`
				: path;

		const articleTitle = String(title || '').trim() || 'Untitled';
		const data = {
			text: `${articleTitle}\n${absoluteUrl}`
		};

		// Mark before await so retries / double-confirm cannot duplicate.
		this._redSquareCrossPostedSigs.add(stackSig);

		try {
			const tweetTx = await redsquare.createTweetTransaction(data, []);
			await tweetTx.sign();
			await this.app.network.propagateTransaction(tweetTx);

			if (redsquare.browser_active && typeof redsquare.receiveTweetTransaction === 'function') {
				try {
					const tweet = await redsquare.receiveTweetTransaction(tweetTx);
					redsquare.manager?.onTweetPosted?.(tweet);
				} catch (err) {
					console.warn('Stack: RedSquare local receive skipped', err?.message || err);
				}
			}
		} catch (err) {
			// Allow a later retry if propagation failed.
			this._redSquareCrossPostedSigs.delete(stackSig);
			console.warn('Stack: RedSquare cross-post failed', err?.message || err);
		}
	}

	openPublishedPost(publishedTx) {
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
	}

	handleViewPreview() {
		this.overlay.hide();
		if (this.mod.previewOverlay) {
			this.mod.previewOverlay.render();
		}
	}
}

module.exports = PublishSettingsOverlay;
