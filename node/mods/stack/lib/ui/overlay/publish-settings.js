const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublishSettingsTemplate = require('./publish-settings.template');

class PublishSettingsOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.postState = {
      published: false,
      accessLevel: 'public', // 'public', 'private', 'subscription'
      description: '',
      image: null,
      imageUrl: null,
      customCSS: ''
    };
  }

  render(postData = {}) {
    // Merge provided post data with current state
    this.postState = {
      ...this.postState,
      ...postData
    };

    // If editor has featured image, use it (authoritative source)
    if (this.mod.create_post_ui && this.mod.create_post_ui.featuredImage) {
      this.postState.image = this.mod.create_post_ui.featuredImage;
    }

    const html = PublishSettingsTemplate(this.app, this.mod, this.postState);
    this.overlay.show(html);
    
    setTimeout(() => {
      this.attachEvents();
    }, 25);
  }

  attachEvents() {
    // Close overlay (click outside or close button)
    const overlayCloseBtn = document.querySelector('.saito-overlay-close');
    if (overlayCloseBtn) {
      overlayCloseBtn.addEventListener('click', () => {
        this.overlay.hide();
      });
    }

    // Access level checkbox cards (only one can be active)
    const accessCards = document.querySelectorAll('.stack-publish-access-card');
    const accessCheckboxes = document.querySelectorAll('.stack-publish-access-checkbox');
    
    accessCards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking directly on the checkbox
        if (e.target.type === 'checkbox') return;
        
        const checkbox = card.querySelector('.stack-publish-access-checkbox');
        const accessValue = card.getAttribute('data-access');
        
        // Uncheck all others
        accessCheckboxes.forEach(cb => {
          if (cb !== checkbox) {
            cb.checked = false;
            cb.closest('.stack-publish-access-card')?.classList.remove('stack-publish-access-card-active');
          }
        });
        
        // Toggle this one
        checkbox.checked = true;
        card.classList.add('stack-publish-access-card-active');
        
        // Only allow selection of public or private (subscription is disabled)
        if (accessValue === 'subscription') {
          // Subscription is disabled - do not change state
          checkbox.checked = false;
          card.classList.remove('stack-publish-access-card-active');
          return;
        }
        
        this.setAccessLevel(accessValue);
      });
    });

    // Checkbox change handlers (for direct checkbox clicks)
    accessCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const card = checkbox.closest('.stack-publish-access-card');
        const accessValue = card?.getAttribute('data-access');
        
        if (checkbox.checked) {
          // Prevent selection of disabled subscription option
          if (accessValue === 'subscription') {
            checkbox.checked = false;
            return;
          }
          
          // Uncheck all others
          accessCheckboxes.forEach(cb => {
            if (cb !== checkbox) {
              cb.checked = false;
              cb.closest('.stack-publish-access-card')?.classList.remove('stack-publish-access-card-active');
            }
          });
          card?.classList.add('stack-publish-access-card-active');
          
          this.setAccessLevel(accessValue);
        } else {
          // Prevent unchecking - at least one must be selected
          checkbox.checked = true;
        }
      });
    });

    // Delete draft button
    const deleteDraftBtn = document.querySelector('#stack-publish-delete-draft-btn');
    if (deleteDraftBtn) {
      deleteDraftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleDeleteDraft();
      });
    }

    // Primary action button (Publish)
    const primaryBtn = document.querySelector('#stack-publish-primary-btn');
    if (primaryBtn) {
      primaryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handlePublish();
      });
    }
  }

  handleDeleteDraft() {
    if (confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      // Delete the draft transaction from the archive
      if (this.mod.create_post_ui && this.mod.create_post_ui.draftTransaction) {
        this.app.storage.deleteTransaction(this.mod.create_post_ui.draftTransaction, null, 'localhost')
          .then(() => {
            this.mod.create_post_ui.draftTransaction = null; // Clear reference
            
            // Clear the editor
            const editor = document.querySelector('#stack-post-body-editor');
            if (editor && this.mod.create_post_ui) {
              const { parseMarkdownToDocument, renderDocument } = require('../../post-document');
              const emptyDocument = parseMarkdownToDocument('');
              renderDocument(emptyDocument, editor, { contentEditable: true });
              this.mod.create_post_ui.updatePlaceholderVisibility();
              this.mod.create_post_ui.updatePublishTriggerVisibility();
            }
            
            // Clear title
            const titleInput = document.querySelector('#stack-post-title-input');
            if (titleInput) {
              titleInput.value = '';
            }
            
            // Hide overlay and navigate back to front page
            this.overlay.hide();
            
            // Navigate back to front page (main splash page)
            if (this.mod.main) {
              setTimeout(() => {
                this.mod.main.render();
              }, 100); // Small delay for smooth transition
            }
            
            siteMessage('Draft deleted', 1500);
          })
          .catch(error => {
            console.error('Error deleting draft transaction:', error);
            alert('Failed to delete draft. Please try again.');
          });
      } else {
        // If no draftTransaction, just clear editor and navigate back
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
        
        // Navigate back to front page
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
    // Only allow 'public' or 'private' (subscription is disabled)
    if (level === 'subscription') {
      console.warn('Stack: Subscription access mode is not yet available');
      return;
    }
    
    this.postState.accessLevel = level; // 'public' or 'private'
    
    // Update checkbox card states
    const accessCards = document.querySelectorAll('.stack-publish-access-card');
    
    accessCards.forEach(card => {
      const cardValue = card.getAttribute('data-access');
      const checkbox = card.querySelector('.stack-publish-access-checkbox');
      
      if (cardValue === level) {
        checkbox.checked = true;
        card.classList.add('stack-publish-access-card-active');
      } else {
        checkbox.checked = false;
        card.classList.remove('stack-publish-access-card-active');
      }
    });
  }

  async handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let imageDataUrl = dataUrl;
      if (this.app.browser && this.app.browser.resizeImg) {
        try {
          imageDataUrl = await this.app.browser.resizeImg(dataUrl);
        } catch (err) {
          console.warn('Image resize failed, using original:', err);
        }
      }

      this.postState.image = imageDataUrl.split(',')[1]; // Base64 data
      this.postState.imageUrl = null;

      // Update preview
      const previewImg = document.querySelector('#stack-publish-image-preview');
      if (previewImg) {
        previewImg.src = imageDataUrl;
        previewImg.style.display = 'block';
      }
    } catch (err) {
      console.error('Error uploading image:', err);
    }
  }

  handleUnpublish() {
    if (confirm('Are you sure you want to unpublish this post?')) {
      this.postState.published = false;
      this.overlay.hide();
      // Update publish trigger state
      if (this.mod.create_post_ui) {
        this.mod.create_post_ui.isPublished = false;
        this.mod.create_post_ui.updatePublishTriggerState();
      }
      siteMessage('Post unpublished', 1500);
    }
  }


  async handlePublish() {
    const title = document.querySelector('#stack-post-title-input') ? (document.querySelector('#stack-post-title-input').value || '') : '';
    // Use DOM-based serialization (DOM is single source of truth)
    const content = this.mod.create_post_ui ? this.mod.create_post_ui.serializeDOMToMarkdown() : '';

    if (!title.trim()) {
      alert('Please enter a title for your post');
      return;
    }

    if (!content.trim()) {
      alert('Please enter content for your post');
      return;
    }

    try {
      // PART 2 — TRANSACTION CREATION CHANGE: Include parent_id if editing
      // If editor.parent_id exists, this is an edit - include parent_id in transaction data
      const parent_id = this.mod.create_post_ui && this.mod.create_post_ui.parent_id ? this.mod.create_post_ui.parent_id : null;
      
      // Show appropriate message based on whether this is an update or new publish
      if (parent_id) {
        siteMessage('Updating post...', 1500);
      } else {
        siteMessage('Publishing post...', 1500);
      }
      
      // Capture draft ID and transaction reference before publishing
      const draftIdToDelete = this.mod.create_post_ui ? this.mod.create_post_ui.activeDraftId : null;
      const draftTxToDelete = this.mod.create_post_ui ? this.mod.create_post_ui.draftTransaction : null;
      
      // Get featured image from editor state (authoritative source)
      const featuredImage = this.mod.create_post_ui && this.mod.create_post_ui.featuredImage ? this.mod.create_post_ui.featuredImage : (this.postState.image || '');
      
      // Create and propagate the transaction
      const publishedTx = await this.mod.createStackPostTransaction({
        title,
        content,
        image: featuredImage, // Featured/teaser image (singular)
        imageUrl: this.postState.imageUrl,
        tags: [],
        timestamp: Date.now(),
        subscriptionTier: this.postState.accessLevel === 'public' ? 'free' : 'paid',
        excerpt: this.postState.description || content.substring(0, 200).replace(/\n/g, ' ').trim(),
        accessLevel: this.postState.accessLevel, // 'public' or 'private'
        parent_id: parent_id // Include parent_id if editing (null for new posts)
      }, () => {
        // This callback runs after network confirmation (may take time)
        // State is already cleaned up below, this is just for final sync
        this.postState.published = true;
      });
      
      // ========================================================================
      // OPTIMISTIC CACHE UPDATE: Add post to postsCache immediately
      // ========================================================================
      // Add to cache so it appears in Explore → My Posts immediately
      // receiveStackPostTransaction will handle this again on confirmation, but
      // it checks for duplicates, so it's safe to add optimistically here
      if (publishedTx && publishedTx.signature) {
        const txmsg = publishedTx.returnMessage();
        const from = publishedTx.from && publishedTx.from.length > 0 ? publishedTx.from[0].publicKey : this.mod.publicKey;
        
        if (txmsg && txmsg.data && from) {
          // ISSUE 2 — DUPLICATE POSTS AFTER EDITING: Remove old versions before adding new one
          const optimistic_parent_id = parent_id; // parent_id is already extracted above
          
          // If this is an edit (has parent_id), remove older versions from cache
          if (optimistic_parent_id && this.mod.postsCache) {
            // Remove from allPosts: remove posts where sig === parent_id OR parent_id === parent_id
            if (this.mod.postsCache.allPosts) {
              this.mod.postsCache.allPosts = this.mod.postsCache.allPosts.filter(p => 
                p.sig !== optimistic_parent_id && p.parent_id !== optimistic_parent_id
              );
            }
            
            // Remove from byAuthor cache
            if (this.mod.postsCache.byAuthor && this.mod.postsCache.byAuthor.has(from)) {
              const authorPosts = this.mod.postsCache.byAuthor.get(from);
              const filteredAuthorPosts = authorPosts.filter(p => 
                p.sig !== optimistic_parent_id && p.parent_id !== optimistic_parent_id
              );
              this.mod.postsCache.byAuthor.set(from, filteredAuthorPosts);
            }
          }
          
          const post = {
            ...txmsg.data,
            sig: publishedTx.signature,
            publicKey: from,
            timestamp: txmsg.data.timestamp || publishedTx.timestamp,
            lastEdited: txmsg.data.timestamp || publishedTx.timestamp,
            parent_id: optimistic_parent_id // Store parent_id for future deduplication
          };
          
          // Add to transactionCache for immediate access
          this.mod.transactionCache[publishedTx.signature] = publishedTx;
          
          // Add to allPosts (check for duplicates first)
          if (this.mod.postsCache && this.mod.postsCache.allPosts) {
            const existingIndex = this.mod.postsCache.allPosts.findIndex(p => p.sig === publishedTx.signature);
            if (existingIndex < 0) {
              this.mod.postsCache.allPosts.push(post);
            } else {
              // Update existing entry
              this.mod.postsCache.allPosts[existingIndex] = post;
            }
          }
          
          // Add to byAuthor cache (check for duplicates first)
          if (this.mod.postsCache && this.mod.postsCache.byAuthor) {
            if (!this.mod.postsCache.byAuthor.has(from)) {
              this.mod.postsCache.byAuthor.set(from, []);
            }
            const authorPosts = this.mod.postsCache.byAuthor.get(from);
            const existingIndex = authorPosts.findIndex(p => p.sig === publishedTx.signature);
            if (existingIndex < 0) {
              authorPosts.push(post);
            } else {
              // Update existing entry
              authorPosts[existingIndex] = post;
            }
          }
        }
      }
      
      // ========================================================================
      // PUBLISH CONSUMES DRAFT: Delete draft immediately after broadcasting
      // ========================================================================
      // [DRAFT-CHECK] Log draft deletion on publish
      console.log('[DRAFT-CHECK] Publishing post - deleting draft:', draftIdToDelete || 'N/A');
      
      if (draftIdToDelete && this.mod.deleteDraft) {
        // Delete from archive and refresh in-memory draft list
        const deleted = await this.mod.deleteDraft(draftIdToDelete);
        console.log('[DRAFT-CHECK] Draft deleted from archive and memory:', deleted);
        // After deletion, draft will not be returned by hasValidDrafts()
      } else if (draftTxToDelete) {
        // Fallback: delete by transaction if we have it but no draftId
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
      
      // ========================================================================
      // CLEAR SESSION-SCOPED DRAFT STATE
      // ========================================================================
      if (this.mod.create_post_ui) {
        this.mod.create_post_ui.activeDraftId = null;
        this.mod.create_post_ui.draftTransaction = null;
        this.mod.create_post_ui.sessionIntent = null;
        this.mod.create_post_ui.isPublished = true;
      }
      
      // Hide overlay
      this.overlay.hide();
      
      // ========================================================================
      // IMMEDIATE TRANSITION TO VIEW POST
      // ========================================================================
      // Unmount editor before navigating to viewer
      if (this.mod.create_post_ui && typeof this.mod.create_post_ui.onEditorUnmount === 'function') {
        this.mod.create_post_ui.onEditorUnmount();
      }
      
      // Initialize ViewPost component if needed
      if (!this.mod.viewPostComponent) {
        const ViewPost = require('../view-post');
        this.mod.viewPostComponent = new ViewPost(this.app, this.mod, '.saito-container');
      }
      
      // Render View Post with the just-broadcast transaction
      this.mod.viewPostComponent.render(publishedTx);
      
      // Update URL to reflect the published post
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
      
      // Success message - use appropriate message based on whether this is an update or new publish
      if (parent_id) {
        siteMessage('Post updated', 1500);
      } else {
        siteMessage('Stack post published', 1500);
      }
      
    } catch (error) {
      console.error('Error publishing post:', error);
      // Check parent_id again in error handler to determine appropriate message
      const parent_id = this.mod.create_post_ui && this.mod.create_post_ui.parent_id ? this.mod.create_post_ui.parent_id : null;
      if (parent_id) {
        siteMessage('Unable to update post', 3000);
      } else {
        siteMessage('Unable to publish post', 3000);
      }
      alert('Failed to publish post. Please try again.');
    }
  }

  handleViewPreview() {
    // Close this overlay and open preview overlay
    this.overlay.hide();
    if (this.mod.previewOverlay) {
      this.mod.previewOverlay.render();
    }
  }
}

module.exports = PublishSettingsOverlay;

