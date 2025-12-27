const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ChooseDraftTemplate = require('./choose-draft.template');

class ChooseDraftOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    // Disable default backdrop close behavior so we can handle it custom
    this.overlay.clickBackdropToClose = false;
  }

  /**
   * Check if overlay should be shown
   * Returns true only if:
   * 1. User has published at least once
   * 2. At least one draft exists
   */
  shouldShow() {
    const hasPublished = this.mod.hasPublished && this.mod.hasPublished();
    const drafts = this.mod.getDrafts && this.mod.getDrafts();
    return hasPublished && drafts && drafts.length > 0;
  }

  render() {
    if (!this.shouldShow()) {
      return; // Don't render if conditions aren't met
    }

    const drafts = this.mod.getDrafts();
    const html = ChooseDraftTemplate(this.app, this.mod, drafts);
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
        this.handleDefaultDraft();
      });
    }

    // Click outside overlay (on backdrop) - handle custom behavior
    // Wait a bit for overlay to be fully rendered to get the correct backdrop element
    setTimeout(() => {
      const backdrop = document.querySelector(`#saito-overlay-backdrop${this.overlay.ordinal}`);
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          // Only handle if clicking directly on backdrop, not children
          if (e.target === backdrop) {
            this.handleDefaultDraft();
          }
        });
      }
    }, 50);

    // Draft row click handlers
    const draftRows = document.querySelectorAll('.stack-choose-draft-row');
    draftRows.forEach(row => {
      const draftId = row.getAttribute('data-draft-id');
      if (!draftId) return;

      // Remove existing click handlers
      const newRow = row.cloneNode(true);
      row.parentNode.replaceChild(newRow, row);

      // Attach click handler to entire row (excluding delete icon clicks)
      newRow.addEventListener('click', async (e) => {
        // Don't handle if clicking delete icon
        if (e.target.closest('.stack-choose-draft-delete-icon')) {
          return;
        }
        await this.handleDraftSelect(draftId);
      });

      // Delete icon handler
      const deleteIcon = newRow.querySelector('.stack-choose-draft-delete-icon');
      if (deleteIcon) {
        deleteIcon.addEventListener('click', async (e) => {
          e.stopPropagation(); // Prevent row click
          await this.handleDraftDelete(draftId);
        });
      }
    });

    // Start new post card click handler
    const createNewCard = document.querySelector('#stack-choose-draft-create-new');
    if (createNewCard) {
      createNewCard.addEventListener('click', () => {
        this.handleCreateNew();
      });
    }
  }

  /**
   * Handle selecting a draft to edit
   */
  async handleDraftSelect(draftId) {
    // Load the draft into the editor
    if (this.mod.create_post_ui && this.mod.create_post_ui.loadDraftById) {
      await this.mod.create_post_ui.loadDraftById(draftId);
    }
    
    // Fade out overlay
    this.overlay.hide();
  }

  /**
   * Handle default action (load most recent draft)
   */
  async handleDefaultDraft() {
    const drafts = this.mod.getDrafts();
    if (drafts && drafts.length > 0) {
      const mostRecent = drafts[0];
      await this.handleDraftSelect(mostRecent.id);
    } else {
      // No drafts, create new
      this.handleCreateNew();
    }
  }

  /**
   * Handle creating a new document
   */
  handleCreateNew() {
    // Clear editor to empty state
    if (this.mod.create_post_ui) {
      const { parseMarkdownToDocument, renderDocument } = require('../../post-document');
      const editor = document.querySelector('#stack-post-body-editor');
      const titleInput = document.querySelector('#stack-post-title-input');
      
      if (editor) {
        const emptyDocument = parseMarkdownToDocument('');
        renderDocument(emptyDocument, editor, { contentEditable: true });
        this.mod.create_post_ui.updatePlaceholderVisibility();
        this.mod.create_post_ui.updatePublishTriggerVisibility();
      }
      
      if (titleInput) {
        titleInput.value = '';
      }

      // Clear draft transaction reference
      this.mod.create_post_ui.draftTransaction = null;
      this.mod.create_post_ui.isPublished = false;
      this.mod.create_post_ui.updatePublishTriggerState();
    }

    // Fade out overlay
    this.overlay.hide();
  }

  /**
   * Handle deleting a draft
   * Calls stack.js to delete the draft (archive + in-memory list)
   * Shows confirmation alert before deletion
   */
  async handleDraftDelete(draftId) {
    if (!draftId) {
      return;
    }

    // Show confirmation alert
    if (!confirm('Delete this draft? This cannot be undone.')) {
      return;
    }

    // Check if this is the currently loaded draft
    const isCurrentDraft = this.mod.create_post_ui && 
                           this.mod.create_post_ui.draftTransaction &&
                           (this.mod.create_post_ui.draftTransaction.signature === draftId ||
                            this.mod.create_post_ui.draftTransaction.hash === draftId);

    // Delete draft through stack.js (handles archive + in-memory list update)
    const deleted = await this.mod.deleteDraft && this.mod.deleteDraft(draftId);
    
    if (!deleted) {
      console.error('Stack: Failed to delete draft');
      return;
    }

    // If we deleted the currently loaded draft, clear editor state
    if (isCurrentDraft && this.mod.create_post_ui) {
      this.mod.create_post_ui.draftTransaction = null;
    }

    // Check if any drafts remain
    const drafts = this.mod.getDrafts && this.mod.getDrafts();
    if (!drafts || drafts.length === 0) {
      // No drafts remain, dismiss overlay and create new document
      this.overlay.hide();
      this.handleCreateNew();
    } else {
      // Re-render overlay with updated draft list
      this.render();
    }
  }
}

module.exports = ChooseDraftOverlay;

