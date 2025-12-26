const CreatePostTemplate = require('./create-post.template');
const { parseMarkdownToDocument, serializeDocumentToMarkdown, renderDocument, generateBlockId } = require('../post-document');

class CreatePost {
  constructor(app, mod, container = "") {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.document = { blocks: [] };
    this.serializeTimeout = null;
    this.DEBOUNCE_MS = 300; // Debounce delay for serialization
    this.saveState = 'draft'; // 'draft', 'saving', 'saved'
    this.saveStateTimeout = null;
    this.storedDropRange = null; // Store Range for drop position (legacy)
    this.storedInsertionPoint = null; // Store insertion point that matches visual indicator (single source of truth)
    this.isDragging = false; // Track drag state
    this.isPublished = false; // Track if post is published
  }

  render(container = "") {
    if (container !== "") {
      this.container = container;
    }

    if (!this.container || this.container.trim() === "") {
      this.container = ".saito-container";
    }

    const html = CreatePostTemplate(this.app, this.mod);

    // Always replace content in container to overwrite existing content
    this.app.browser.replaceElementBySelector(html, this.container);

    // Update container class
    const containerEl = document.querySelector(this.container);
    if (containerEl) {
      containerEl.classList.remove('stack-splash-container');
      containerEl.classList.add('stack-create-post-container');
    }

    this.attachEvents();
    this.initializeDocument();
  }

  /**
   * Initialize document model from draft or create empty document
   */
  initializeDocument() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    // Load from draft if available
    const draftKey = 'stack-post-draft';
    let markdown = '';
    
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        markdown = savedDraft;
      }
    } catch (err) {
      console.error('Error loading draft:', err);
    }

    // Parse markdown → document (or create empty document)
    this.document = markdown ? parseMarkdownToDocument(markdown) : { blocks: [{ type: 'paragraph', id: generateBlockId(0), text: '' }] };
    
    // Render document to editor
    this.renderDocument();
    
    // Ensure placeholder is shown if editor is empty
    this.updatePlaceholderVisibility();
    
    // Initialize save state
    this.updateSaveState('draft');
    
    // Update next step button state
    this.updateNextStepButton();
    
    // Update publish trigger visibility
    this.updatePublishTriggerVisibility();
    this.updatePublishTriggerState();
    
    // Auto-focus title input on load if no content exists
    setTimeout(() => {
      const titleInput = document.querySelector('#stack-post-title-input');
      const editor = document.querySelector('#stack-post-body-editor');
      
      // Check if there's any existing content
      const hasTitle = titleInput && titleInput.value.trim().length > 0;
      const hasBodyContent = this.document.blocks.some(block => {
        if (block.type === 'paragraph' || block.type === 'heading') {
          const text = (block.text || '').replace(/\u200B/g, '').trim();
          return text.length > 0;
        }
        if (block.type === 'image') {
          return true;
        }
        if (block.type === 'rawhtml') {
          return (block.html || '').trim().length > 0;
        }
        return false;
      });
      
      // If no content exists, focus title input
      if (!hasTitle && !hasBodyContent && titleInput) {
        titleInput.focus();
      } else if (editor && hasBodyContent) {
        // If body has content, focus body editor
        const firstBlock = editor.querySelector('[contenteditable="true"]');
        if (firstBlock) {
          const range = document.createRange();
          const selection = window.getSelection();
          
          // Ensure the block has a text node for cursor placement
          if (!firstBlock.firstChild || firstBlock.firstChild.nodeType !== Node.TEXT_NODE) {
            const textNode = document.createTextNode('\u200B');
            firstBlock.appendChild(textNode);
          }
          
          // Place cursor at the start of the text node
          if (firstBlock.firstChild && firstBlock.firstChild.nodeType === Node.TEXT_NODE) {
            range.setStart(firstBlock.firstChild, 0);
            range.setEnd(firstBlock.firstChild, 0);
          } else {
            range.setStart(firstBlock, 0);
            range.setEnd(firstBlock, 0);
          }
          selection.removeAllRanges();
          selection.addRange(range);
          firstBlock.focus();
        } else {
          editor.focus();
        }
      }
    }, 100);
  }

  /**
   * Render document to editor surface
   */
  renderDocument() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    renderDocument(this.document, editor, {
      contentEditable: true,
      onBlockUpdate: (blockId, newText) => {
        this.updateBlockText(blockId, newText);
      }
    });

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

    // Update next step button state
    this.updateNextStepButton();
    
    // Update publish trigger visibility
    this.updatePublishTriggerVisibility();

    // Serialize and save draft
    const markdown = serializeDocumentToMarkdown(this.document);
    this.saveDraft(markdown);
  }

  /**
   * Check if editor has meaningful content and update placeholder visibility
   */
  updatePlaceholderVisibility() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    // Check if there's any meaningful content
    const hasContent = this.document.blocks.some(block => {
      if (block.type === 'paragraph' || block.type === 'heading') {
        const text = (block.text || '').replace(/\u200B/g, '').trim();
        return text.length > 0;
      }
      if (block.type === 'image') {
        return true; // Images count as content
      }
      if (block.type === 'rawhtml') {
        return (block.html || '').trim().length > 0;
      }
      return false;
    });

    // Toggle placeholder class
    if (hasContent) {
      editor.classList.remove('stack-editor-empty');
    } else {
      editor.classList.add('stack-editor-empty');
    }
  }

  /**
   * Update block text in document model
   */
  updateBlockText(blockId, newText) {
    const block = this.document.blocks.find(b => b.id === blockId);
    if (block && (block.type === 'paragraph' || block.type === 'heading')) {
      block.text = newText;
      this.scheduleSerialization();
    }
  }

  /**
   * Sync document state FROM DOM (DOM is authoritative).
   * Reads all blocks from the editor DOM and updates this.document to match.
   * This must be called BEFORE any code reads from this.document to ensure state is current.
   */
  syncDocumentFromDOM() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    // Read all blocks from DOM
    const blockElements = editor.querySelectorAll('[data-block-id]');
    const newBlocks = [];

    blockElements.forEach((blockEl) => {
      const blockId = blockEl.getAttribute('data-block-id');
      const blockType = blockEl.getAttribute('data-block-type');
      
      // Find existing block to preserve ID and other properties
      const existingBlock = this.document.blocks.find(b => b.id === blockId);
      
      let block = existingBlock ? { ...existingBlock } : null;

      switch (blockType) {
        case 'paragraph':
        case 'list-item':
        case 'blockquote':
          // Treat list-item and blockquote as paragraph variants
          const paragraphText = (blockEl.textContent || '').replace(/\u200B/g, '');
          if (!block) {
            block = {
              type: 'paragraph',
              id: blockId || generateBlockId(newBlocks.length),
              text: paragraphText
            };
          } else {
            block.text = paragraphText;
          }
          break;

        case 'heading':
          const level = parseInt(blockEl.tagName.charAt(1)) || 1;
          const headingText = (blockEl.textContent || '').replace(/\u200B/g, '');
          if (!block) {
            block = {
              type: 'heading',
              id: blockId || generateBlockId(newBlocks.length),
              level: level,
              text: headingText
            };
          } else {
            block.text = headingText;
            block.level = level;
          }
          break;

        case 'image':
          const img = blockEl.querySelector('img');
          const captionEl = blockEl.querySelector('.stack-image-caption');
          if (!block) {
            block = {
              type: 'image',
              id: blockId || generateBlockId(newBlocks.length),
              src: img ? img.src : '',
              caption: captionEl ? captionEl.textContent : ''
            };
          } else {
            if (img) block.src = img.src;
            if (captionEl) block.caption = captionEl.textContent;
          }
          break;

        case 'rawhtml':
          const htmlContent = blockEl.innerHTML || '';
          if (!block) {
            block = {
              type: 'rawhtml',
              id: blockId || generateBlockId(newBlocks.length),
              html: htmlContent
            };
          } else {
            block.html = htmlContent;
          }
          break;
      }

      if (block) {
        newBlocks.push(block);
      }
    });

    // Update document to match DOM
    this.document.blocks = newBlocks;
  }

  /**
   * Schedule debounced serialization
   */
  scheduleSerialization() {
    if (this.serializeTimeout) {
      clearTimeout(this.serializeTimeout);
    }

    // Update state to "saving"
    this.updateSaveState('saving');

    this.serializeTimeout = setTimeout(() => {
      const markdown = serializeDocumentToMarkdown(this.document);
      this.saveDraft(markdown);
      // Update state to "saved" after save completes
      this.updateSaveState('saved');
      // Return to "draft" after a brief moment
      if (this.saveStateTimeout) {
        clearTimeout(this.saveStateTimeout);
      }
      this.saveStateTimeout = setTimeout(() => {
        this.updateSaveState('draft');
      }, 2000);
    }, this.DEBOUNCE_MS);
  }

  /**
   * Update save state indicator
   */
  updateSaveState(state) {
    this.saveState = state;
    const stateElement = document.querySelector('#stack-draft-state');
    const stateText = document.querySelector('.stack-draft-state-text');
    
    if (stateElement && stateText) {
      // Remove all state classes
      stateElement.classList.remove('saving', 'saved');
      
      // Add current state class
      if (state !== 'draft') {
        stateElement.classList.add(state);
      }
      
      // Update text
      const stateLabels = {
        'draft': 'Draft',
        'saving': 'Saving…',
        'saved': 'Saved'
      };
      stateText.textContent = stateLabels[state] || 'Draft';
    }
  }

  /**
   * Check if document has content and update next step button
   */
  updateNextStepButton() {
    const nextStepBtn = document.querySelector('#stack-next-step-btn');
    if (!nextStepBtn) return;

    const title = document.querySelector('#stack-post-title-input')?.value || '';
    const hasContent = this.document.blocks.some(block => {
      if (block.type === 'paragraph' || block.type === 'heading') {
        const text = (block.text || '').replace(/\u200B/g, '').trim();
        return text.length > 0;
      }
      if (block.type === 'image') {
        return true;
      }
      if (block.type === 'rawhtml') {
        return (block.html || '').trim().length > 0;
      }
      return false;
    });

    const hasTitle = title.trim().length > 0;

    if (hasContent || hasTitle) {
      nextStepBtn.disabled = false;
    } else {
      nextStepBtn.disabled = true;
    }
  }

  /**
   * Save draft to localStorage
   */
  saveDraft(markdown) {
    try {
      const draftKey = 'stack-post-draft';
      localStorage.setItem(draftKey, markdown);
    } catch (err) {
      console.error('Error saving draft:', err);
    }
  }

  /**
   * Get the currently focused block element
   */
  getFocusedBlock() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;

    let node = selection.anchorNode;
    while (node && node !== document) {
      if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-block-id')) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  /**
   * Get block index from DOM element
   */
  getBlockIndex(blockElement) {
    const index = blockElement.getAttribute('data-block-index');
    return index !== null ? parseInt(index, 10) : -1;
  }

  /**
   * Get text offset from selection within a block
   */
  getTextOffsetInBlock(blockElement, selection) {
    const range = selection.getRangeAt(0);
    return this.getTextOffsetFromRange(blockElement, range);
  }

  /**
   * Get text offset from a range within a block
   */
  getTextOffsetFromRange(blockElement, range) {
    let offset = 0;
    
    // Walk through text nodes in the block
    const walker = document.createTreeWalker(
      blockElement,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode === range.startContainer) {
        offset += range.startOffset;
        break;
      }
      // Remove zero-width space from length calculation
      const textLength = textNode.textContent.replace(/\u200B/g, '').length;
      offset += textLength;
      textNode = walker.nextNode();
    }
    
    return offset;
  }

  /**
   * Handle Enter key - split paragraph block
   * If text is selected, delete selection and insert newline
   * If in a block-formatted line and line is empty, exit the block
   */
  handleEnterKey(e) {
    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockType = focusedBlock.getAttribute('data-block-type');

    // CRITICAL: Sync document state FROM DOM first (DOM is authoritative)
    // This ensures we read the current text the user sees, not stale JS state
    this.syncDocumentFromDOM();

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const blockIndex = this.getBlockIndex(focusedBlock);
    const block = this.document.blocks[blockIndex];

    if (!block) return;

    // Check if we're in a block-formatted line (list-item, blockquote, heading) and line is empty
    const blockText = (focusedBlock.textContent || '').replace(/\u200B/g, '').trim();
    const isBlockFormatted = blockType === 'list-item' || blockType === 'blockquote' || blockType === 'heading';
    const isEmpty = blockText.length === 0;

    if (isBlockFormatted && isEmpty) {
      // EXIT BLOCK: Remove formatting and create normal paragraph
      e.preventDefault();

      // Convert current block to paragraph IN PLACE
      focusedBlock.setAttribute('data-block-type', 'paragraph');
      focusedBlock.classList.remove('stack-list-item', 'stack-blockquote');
      focusedBlock.textContent = '';
      const textNode = document.createTextNode('\u200B');
      focusedBlock.appendChild(textNode);

      // Create new paragraph block in DOM
      const editor = focusedBlock.parentNode;
      const newBlockElement = document.createElement('p');
      const newBlockId = generateBlockId(this.document.blocks.length);
      newBlockElement.setAttribute('data-block-id', newBlockId);
      newBlockElement.setAttribute('data-block-type', 'paragraph');
      newBlockElement.setAttribute('data-block-index', (blockIndex + 1).toString());
      newBlockElement.contentEditable = 'true';
      newBlockElement.textContent = '';
      const newTextNode = document.createTextNode('\u200B');
      newBlockElement.appendChild(newTextNode);
      
      // Insert after current block
      if (focusedBlock.nextSibling) {
        editor.insertBefore(newBlockElement, focusedBlock.nextSibling);
      } else {
        editor.appendChild(newBlockElement);
      }

      // Sync document state from DOM
      this.syncDocumentFromDOM();

      // Update placeholder visibility
      this.updatePlaceholderVisibility();

      // Focus the new paragraph synchronously
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      if (newBlockElement.firstChild && newBlockElement.firstChild.nodeType === Node.TEXT_NODE) {
        newRange.setStart(newBlockElement.firstChild, 0);
        newRange.setEnd(newBlockElement.firstChild, 0);
      } else {
        newRange.setStart(newBlockElement, 0);
        newRange.setEnd(newBlockElement, 0);
      }
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      newBlockElement.focus();
      this.autoScrollToCaret();
      return;
    }

    // Handle Enter for headings, lists, and blockquotes that have text
    // (Empty blocks are handled above - they exit the block format)
    if (blockType === 'heading' || blockType === 'list-item' || blockType === 'blockquote') {
      // Split the block at cursor position
      e.preventDefault();
      
      const cursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
      const currentText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
      const beforeText = currentText.substring(0, cursorOffset);
      const afterText = currentText.substring(cursorOffset);
      
      // Update current block text in DOM
      focusedBlock.textContent = beforeText;
      
      // Create new block in DOM
      const editor = focusedBlock.parentNode;
      let newBlockElement;
      
      if (blockType === 'list-item') {
        // For list items, create a new list item (continue the list)
        newBlockElement = document.createElement('p');
        newBlockElement.setAttribute('data-block-type', 'list-item');
        newBlockElement.classList.add('stack-list-item');
      } else {
        // For headings and blockquotes, create a paragraph (exit the format)
        newBlockElement = document.createElement('p');
        newBlockElement.setAttribute('data-block-type', 'paragraph');
      }
      
      const newBlockId = generateBlockId(this.document.blocks.length);
      newBlockElement.setAttribute('data-block-id', newBlockId);
      newBlockElement.setAttribute('data-block-index', (blockIndex + 1).toString());
      newBlockElement.contentEditable = 'true';
      newBlockElement.textContent = afterText;
      
      // Insert after current block
      if (focusedBlock.nextSibling) {
        editor.insertBefore(newBlockElement, focusedBlock.nextSibling);
      } else {
        editor.appendChild(newBlockElement);
      }
      
      // Sync document state from DOM
      this.syncDocumentFromDOM();
      
      // Update placeholder visibility
      this.updatePlaceholderVisibility();
      
      // Focus the new block synchronously
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      const textNode = newBlockElement.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        newRange.setStart(textNode, 0);
        newRange.setEnd(textNode, 0);
      } else {
        newRange.setStart(newBlockElement, 0);
        newRange.setEnd(newBlockElement, 0);
      }
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      newBlockElement.focus();
      this.autoScrollToCaret();
      return;
    }

    // For other block types (image, rawhtml), allow default behavior
    if (blockType !== 'paragraph') {
      return;
    }

    e.preventDefault();

    if (block.type !== 'paragraph') return;

    // Check if there's an active selection (not collapsed)
    const hasSelection = !range.collapsed;

    if (hasSelection) {
      // DELETE selected text and INSERT newline at cursor position
      // The visible selection is authoritative - delete it completely
      
      // Get the start position of the selection (where cursor will be after deletion)
      // Create a collapsed range at the selection start to calculate offset
      const startRange = document.createRange();
      startRange.setStart(range.startContainer, range.startOffset);
      startRange.setEnd(range.startContainer, range.startOffset);
      const selectionStart = this.getTextOffsetFromRange(focusedBlock, startRange);

      // Delete the selected content from DOM
      range.deleteContents();

      // Sync document state from DOM after deletion
      this.syncDocumentFromDOM();

      // Read current text from DOM after deletion
      const currentText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
      const beforeText = currentText.substring(0, selectionStart);
      const afterText = currentText.substring(selectionStart);

      // Update current block text in DOM
      focusedBlock.textContent = beforeText;

      // Create new paragraph block in DOM
      const editor = focusedBlock.parentNode;
      const newBlockElement = document.createElement('p');
      const newBlockId = generateBlockId(this.document.blocks.length);
      newBlockElement.setAttribute('data-block-id', newBlockId);
      newBlockElement.setAttribute('data-block-type', 'paragraph');
      newBlockElement.setAttribute('data-block-index', (blockIndex + 1).toString());
      newBlockElement.contentEditable = 'true';
      newBlockElement.textContent = afterText;
      
      // Insert after current block
      if (focusedBlock.nextSibling) {
        editor.insertBefore(newBlockElement, focusedBlock.nextSibling);
      } else {
        editor.appendChild(newBlockElement);
      }

      // Sync document state from DOM
      this.syncDocumentFromDOM();

      // Update placeholder visibility
      this.updatePlaceholderVisibility();

      // Focus the new block synchronously
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      const textNode = newBlockElement.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        newRange.setStart(textNode, 0);
        newRange.setEnd(textNode, 0);
      } else {
        newRange.setStart(newBlockElement, 0);
        newRange.setEnd(newBlockElement, 0);
      }
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      newBlockElement.focus();
      this.autoScrollToCaret();
    } else {
      // No selection - split at cursor
    const cursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
      const currentText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
    const beforeText = currentText.substring(0, cursorOffset);
    const afterText = currentText.substring(cursorOffset);

      // Update current block text in DOM
      focusedBlock.textContent = beforeText;

      // Create new paragraph block in DOM
      const editor = focusedBlock.parentNode;
      const newBlockElement = document.createElement('p');
      const newBlockId = generateBlockId(this.document.blocks.length);
      newBlockElement.setAttribute('data-block-id', newBlockId);
      newBlockElement.setAttribute('data-block-type', 'paragraph');
      newBlockElement.setAttribute('data-block-index', (blockIndex + 1).toString());
      newBlockElement.contentEditable = 'true';
      newBlockElement.textContent = afterText;
      
      // Insert after current block
      if (focusedBlock.nextSibling) {
        editor.insertBefore(newBlockElement, focusedBlock.nextSibling);
      } else {
        editor.appendChild(newBlockElement);
      }

      // Sync document state from DOM
      this.syncDocumentFromDOM();

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

      // Focus the new block synchronously
      const newRange = document.createRange();
      const newSelection = window.getSelection();
        const textNode = newBlockElement.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        newRange.setStart(textNode, 0);
        newRange.setEnd(textNode, 0);
        } else {
        newRange.setStart(newBlockElement, 0);
        newRange.setEnd(newBlockElement, 0);
      }
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      newBlockElement.focus();
      this.autoScrollToCaret();
    }
  }

  /**
   * Handle Backspace key - merge with previous block if at start, or delete image if adjacent
   * DOM is authoritative: sync from DOM FIRST
   */
  handleBackspaceKey(e) {
    // Check if an image is selected first
    const selectedImage = document.querySelector('.stack-image-selected');
    if (selectedImage) {
      e.preventDefault();
      this.deleteSelectedImage(selectedImage);
      return;
    }

    // CRITICAL: Sync document state FROM DOM first (DOM is authoritative)
    this.syncDocumentFromDOM();

    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockType = focusedBlock.getAttribute('data-block-type');
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const blockIndex = this.getBlockIndex(focusedBlock);

    // Don't allow caret to enter image blocks - move to previous block
    if (blockType === 'image') {
      e.preventDefault();
      
      // Move caret to previous block if it exists
      if (blockIndex > 0) {
        const previousBlock = this.document.blocks[blockIndex - 1];
        if (previousBlock) {
          setTimeout(() => {
            const prevBlockEl = document.querySelector(`[data-block-id="${previousBlock.id}"]`);
            if (prevBlockEl && prevBlockEl.hasAttribute('contenteditable')) {
              const newRange = document.createRange();
              const newSelection = window.getSelection();
              if (prevBlockEl.firstChild && prevBlockEl.firstChild.nodeType === Node.TEXT_NODE) {
                const textLength = prevBlockEl.firstChild.textContent.length;
                newRange.setStart(prevBlockEl.firstChild, textLength);
                newRange.setEnd(prevBlockEl.firstChild, textLength);
              } else {
                newRange.setStart(prevBlockEl, prevBlockEl.childNodes.length);
                newRange.setEnd(prevBlockEl, prevBlockEl.childNodes.length);
              }
              newSelection.removeAllRanges();
              newSelection.addRange(newRange);
              prevBlockEl.focus();
            }
          }, 0);
        }
      }
      return;
    }

    // Handle removal of block formatting when cursor is at start of block-formatted line
      const cursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
      const isAtStart = cursorOffset === 0;

    if (isAtStart && (blockType === 'list-item' || blockType === 'blockquote' || blockType === 'heading')) {
      // REMOVE BLOCK FORMATTING: Convert back to paragraph IN PLACE
      e.preventDefault();

      const blockText = (focusedBlock.textContent || '').replace(/\u200B/g, '');

      // Convert in place
      if (blockType === 'heading') {
        // Replace heading with paragraph
        const newParagraph = document.createElement('p');
        Array.from(focusedBlock.attributes).forEach(attr => {
          if (attr.name !== 'data-block-type' && attr.name !== 'class') {
            newParagraph.setAttribute(attr.name, attr.value);
          }
        });
        newParagraph.setAttribute('data-block-type', 'paragraph');
        newParagraph.contentEditable = 'true';
        newParagraph.textContent = blockText || '\u200B';
        focusedBlock.parentNode.replaceChild(newParagraph, focusedBlock);
        
        // Sync and restore cursor synchronously
        this.syncDocumentFromDOM();
        const newRange = document.createRange();
        const newSelection = window.getSelection();
        const textNode = newParagraph.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          newRange.setStart(textNode, 0);
          newRange.setEnd(textNode, 0);
        } else {
          newRange.setStart(newParagraph, 0);
          newRange.setEnd(newParagraph, 0);
        }
        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
        newParagraph.focus();
      } else {
        // Convert list-item/blockquote in place
        focusedBlock.setAttribute('data-block-type', 'paragraph');
        focusedBlock.classList.remove('stack-list-item', 'stack-blockquote');
        if (blockText.length === 0) {
          focusedBlock.textContent = '';
          focusedBlock.appendChild(document.createTextNode('\u200B'));
        }
        
        // Sync and restore cursor synchronously
        this.syncDocumentFromDOM();
        const newRange = document.createRange();
        const newSelection = window.getSelection();
        const textNode = focusedBlock.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          newRange.setStart(textNode, 0);
          newRange.setEnd(textNode, 0);
        } else {
          newRange.setStart(focusedBlock, 0);
          newRange.setEnd(focusedBlock, 0);
        }
        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
        focusedBlock.focus();
      }
      
      this.updatePlaceholderVisibility();
      return;
    }

    // Handle deletion when caret is at start of paragraph
    if (blockType === 'paragraph' && blockIndex > 0) {
      if (isAtStart) {
        const previousBlock = this.document.blocks[blockIndex - 1];
        
        // If previous block is an image, delete it from DOM
        if (previousBlock && previousBlock.type === 'image') {
          e.preventDefault();
          
          const prevBlockEl = document.querySelector(`[data-block-id="${previousBlock.id}"]`);
          if (prevBlockEl) {
            prevBlockEl.remove();
            this.syncDocumentFromDOM();
            this.updatePlaceholderVisibility();
            
            // Focus current block synchronously
              const newRange = document.createRange();
              const newSelection = window.getSelection();
            const textNode = focusedBlock.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
              newRange.setStart(textNode, 0);
              newRange.setEnd(textNode, 0);
              } else {
              newRange.setStart(focusedBlock, 0);
              newRange.setEnd(focusedBlock, 0);
              }
              newSelection.removeAllRanges();
              newSelection.addRange(newRange);
            focusedBlock.focus();
          }
          return;
        }
        
        // If previous block is also a paragraph, merge them in DOM
        if (previousBlock && previousBlock.type === 'paragraph') {
          e.preventDefault();
          
          const prevBlockEl = document.querySelector(`[data-block-id="${previousBlock.id}"]`);
          if (prevBlockEl) {
            const prevText = (prevBlockEl.textContent || '').replace(/\u200B/g, '');
            const currText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
            
            // Merge in DOM
            prevBlockEl.textContent = prevText + currText;
            focusedBlock.remove();
            
            // Sync and restore cursor synchronously
            this.syncDocumentFromDOM();
          this.updatePlaceholderVisibility();
          
              const newRange = document.createRange();
              const newSelection = window.getSelection();
            const textNode = prevBlockEl.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
              newRange.setStart(textNode, prevText.length);
              newRange.setEnd(textNode, prevText.length);
              } else {
              newRange.setStart(prevBlockEl, 0);
              newRange.setEnd(prevBlockEl, 0);
              }
              newSelection.removeAllRanges();
              newSelection.addRange(newRange);
            prevBlockEl.focus();
            }
          return;
        }
      }
    }

    // Allow default backspace behavior for other cases
  }

  /**
   * Handle Delete key - merge with next block if at end, or delete image if adjacent
   * DOM is authoritative: sync from DOM FIRST
   */
  handleDeleteKey(e) {
    // Check if an image is selected first
    const selectedImage = document.querySelector('.stack-image-selected');
    if (selectedImage) {
      e.preventDefault();
      this.deleteSelectedImage(selectedImage);
      return;
    }

    // CRITICAL: Sync document state FROM DOM first (DOM is authoritative)
    this.syncDocumentFromDOM();

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockIndex = this.getBlockIndex(focusedBlock);
    const currentBlock = this.document.blocks[blockIndex];

    // If cursor is at the end of a paragraph block
    if (currentBlock && currentBlock.type === 'paragraph' && range.collapsed) {
      const cursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
      const blockText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
      const isAtEnd = cursorOffset >= blockText.length;
      
      if (isAtEnd) {
        e.preventDefault();

      const nextBlockIndex = blockIndex + 1;
      if (nextBlockIndex >= this.document.blocks.length) {
        return;
      }

      const nextBlock = this.document.blocks[nextBlockIndex];
      if (!nextBlock) return;

        const nextBlockEl = document.querySelector(`[data-block-id="${nextBlock.id}"]`);
        if (!nextBlockEl) return;

      if (nextBlock.type === 'image' || nextBlock.type === 'rawhtml') {
          // Delete the next block from DOM
          nextBlockEl.remove();
          this.syncDocumentFromDOM();
        this.updatePlaceholderVisibility();

          // Keep cursor at the end of the current block synchronously
            const newRange = document.createRange();
            const newSelection = window.getSelection();
          const textNode = focusedBlock.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
              newRange.setStart(textNode, textNode.textContent.length);
              newRange.setEnd(textNode, textNode.textContent.length);
            } else {
            newRange.setStart(focusedBlock, 0);
            newRange.setEnd(focusedBlock, 0);
            }
            newSelection.removeAllRanges();
            newSelection.addRange(newRange);
          focusedBlock.focus();
        return;
      } else if (nextBlock.type === 'paragraph' || nextBlock.type === 'heading') {
          // Merge next block into current in DOM
          const currText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
          const nextText = (nextBlockEl.textContent || '').replace(/\u200B/g, '');
          
          focusedBlock.textContent = currText + nextText;
          nextBlockEl.remove();
          
          this.syncDocumentFromDOM();
        this.updatePlaceholderVisibility();

          // Keep cursor at the merge point synchronously
            const newRange = document.createRange();
            const newSelection = window.getSelection();
          const textNode = focusedBlock.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            newRange.setStart(textNode, currText.length);
            newRange.setEnd(textNode, currText.length);
            } else {
            newRange.setStart(focusedBlock, 0);
            newRange.setEnd(focusedBlock, 0);
            }
            newSelection.removeAllRanges();
            newSelection.addRange(newRange);
          focusedBlock.focus();
        return;
        }
      }
    } else if (focusedBlock.getAttribute('data-block-type') === 'image') {
      // If an image block is somehow focused, delete it from DOM
      e.preventDefault();
      focusedBlock.remove();
      this.syncDocumentFromDOM();
      this.updatePlaceholderVisibility();
      return;
    }
    // Allow default browser behavior for other cases
  }

  /**
   * Check for auto-conversion triggers when marker characters or space are typed
   * Operates on the active line only, after text insertion
   */
  checkAutoConversion(e) {
    // Only check on text insertion (not deletion, formatting, etc.)
    if (e.inputType !== 'insertText' && e.inputType !== 'insertCompositionText') {
      return false;
    }

    const insertedChar = e.data || '';
    
    // Check if inserted character is a marker OR space (for fallback)
    const isMarker = insertedChar === '#' || insertedChar === '*' || insertedChar === '-' || insertedChar === '>';
    const isSpace = insertedChar === ' ';
    
    if (!isMarker && !isSpace) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return false;

    // Only convert paragraph blocks
    const blockType = focusedBlock.getAttribute('data-block-type');
    if (blockType !== 'paragraph') return false;

    // Get block text (ignoring zero-width chars)
    const blockText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
    
    // Check if marker is at TRUE start of block (after trimming leading whitespace)
    const trimmedText = blockText.trimStart();
    const leadingWhitespace = blockText.length - trimmedText.length;
    
    // Check for conversion markers at the start
    let conversionType = null;
    let markerLength = 0;
    let remainingText = '';

    // Check for markers (must be at true start)
    // Conversion occurs ONLY when marker + space is present
    // Priority: check longer patterns first (## before #)
    if (trimmedText.startsWith('##')) {
      // H2: convert only when ## + space is present
      if (trimmedText.startsWith('## ')) {
        // Already has space, convert
        conversionType = 'heading2';
        markerLength = 3; // "## "
        remainingText = trimmedText.substring(3);
      } else if (isSpace && trimmedText === '##') {
        // User just typed space after ##
        conversionType = 'heading2';
        markerLength = 3; // "## "
        remainingText = '';
      }
    } else if (trimmedText.startsWith('#')) {
      // H1: convert only when # + space is present
      if (trimmedText.startsWith('# ')) {
        // Already has space, convert
        conversionType = 'heading1';
        markerLength = 2; // "# "
        remainingText = trimmedText.substring(2);
      } else if (isSpace && trimmedText === '#') {
        // User just typed space after #
        conversionType = 'heading1';
        markerLength = 2; // "# "
        remainingText = '';
      }
    } else if (trimmedText.startsWith('*')) {
      // List: convert only when * + space is present
      if (trimmedText.startsWith('* ')) {
        // Already has space, convert
        conversionType = 'list';
        markerLength = 2; // "* "
        remainingText = trimmedText.substring(2);
      } else if (isSpace && trimmedText === '*') {
        // User just typed space after *
        conversionType = 'list';
        markerLength = 2; // "* "
        remainingText = '';
      }
    } else if (trimmedText.startsWith('-')) {
      // List: convert only when - + space is present
      if (trimmedText.startsWith('- ')) {
        // Already has space, convert
        conversionType = 'list';
        markerLength = 2; // "- "
        remainingText = trimmedText.substring(2);
      } else if (isSpace && trimmedText === '-') {
        // User just typed space after -
        conversionType = 'list';
        markerLength = 2; // "- "
        remainingText = '';
      }
    } else if (trimmedText.startsWith('>')) {
      // Blockquote: convert only when > + space is present
      if (trimmedText.startsWith('> ')) {
        // Already has space, convert
        conversionType = 'blockquote';
        markerLength = 2; // "> "
        remainingText = trimmedText.substring(2);
      } else if (isSpace && trimmedText === '>') {
        // User just typed space after >
        conversionType = 'blockquote';
        markerLength = 2; // "> "
        remainingText = '';
      }
    }

    if (!conversionType) return false;

    // Convert block IN PLACE where possible
    if (conversionType === 'heading1' || conversionType === 'heading2') {
      const level = conversionType === 'heading1' ? 1 : 2;
      
      // Replace with heading element
      const newHeading = document.createElement(`h${level}`);
      Array.from(focusedBlock.attributes).forEach(attr => {
        if (attr.name !== 'data-block-type') {
          newHeading.setAttribute(attr.name, attr.value);
        }
      });
      newHeading.setAttribute('data-block-type', 'heading');
      newHeading.contentEditable = 'true';
      newHeading.textContent = (leadingWhitespace > 0 ? ' '.repeat(leadingWhitespace) : '') + remainingText;
      
      focusedBlock.parentNode.replaceChild(newHeading, focusedBlock);
      
      // Sync document state
      this.syncDocumentFromDOM();
      
      // Place cursor synchronously at end of remaining text
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      const textNode = newHeading.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const cursorPos = Math.min(leadingWhitespace + remainingText.length, textNode.textContent.length);
        newRange.setStart(textNode, cursorPos);
        newRange.setEnd(textNode, cursorPos);
      } else {
        newRange.setStart(newHeading, 0);
        newRange.setEnd(newHeading, 0);
      }
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      newHeading.focus();
      
      return true;
    } else if (conversionType === 'list' || conversionType === 'blockquote') {
      // Convert in place by changing attributes
      if (conversionType === 'list') {
        focusedBlock.setAttribute('data-block-type', 'list-item');
        focusedBlock.classList.add('stack-list-item');
      } else {
        focusedBlock.setAttribute('data-block-type', 'blockquote');
        focusedBlock.classList.add('stack-blockquote');
      }
      
      // Update text content (remove marker)
      focusedBlock.textContent = (leadingWhitespace > 0 ? ' '.repeat(leadingWhitespace) : '') + remainingText;
      
      // Sync document state
      this.syncDocumentFromDOM();
      
      // Place cursor synchronously at end of remaining text
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      const textNode = focusedBlock.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const cursorPos = Math.min(leadingWhitespace + remainingText.length, textNode.textContent.length);
        newRange.setStart(textNode, cursorPos);
        newRange.setEnd(textNode, cursorPos);
      } else {
        newRange.setStart(focusedBlock, 0);
        newRange.setEnd(focusedBlock, 0);
      }
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      focusedBlock.focus();
      
      return true;
    }

    return false;
  }

  /**
   * Handle input events - update document model
   * DOM is authoritative: always read from DOM to update state
   */
  handleEditorInput(e) {
    // Check for auto-conversion BEFORE syncing (conversion modifies DOM directly)
    if (this.checkAutoConversion(e)) {
      // Conversion happened, sync and return early
      this.syncDocumentFromDOM();
      this.scheduleSerialization();
      this.updatePlaceholderVisibility();
      this.updateNextStepButton();
      return;
    }

    // CRITICAL: Sync document state FROM DOM first (DOM is authoritative)
    // This ensures any pending edits are captured before we process the input
    this.syncDocumentFromDOM();

    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockId = focusedBlock.getAttribute('data-block-id');
    const blockType = focusedBlock.getAttribute('data-block-type');
    const blockIndex = this.getBlockIndex(focusedBlock);
    const block = this.document.blocks[blockIndex];

    if (!block) return;

    // Update block text based on type (read from DOM)
    if (blockType === 'paragraph' || blockType === 'heading' || blockType === 'list-item' || blockType === 'blockquote') {
      let newText = focusedBlock.textContent || '';
      // Remove zero-width space if present
      newText = newText.replace(/\u200B/g, '');
      block.text = newText;
      this.scheduleSerialization();
    } else if (blockType === 'rawhtml') {
      block.html = focusedBlock.innerHTML || '';
      this.scheduleSerialization();
    }

    // Update placeholder visibility immediately when user types
    this.updatePlaceholderVisibility();
    
    // Update next step button state
    this.updateNextStepButton();

    // Auto-scroll to keep caret visible
    this.autoScrollToCaret();
  }

  /**
   * Auto-scroll editor container to keep caret visible
   * Only scrolls when caret is near or past viewport edges
   */
  autoScrollToCaret() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    
    // Don't scroll if selection spans multiple lines
    if (!range.collapsed) {
      // Check if selection spans multiple blocks
      const startBlock = range.startContainer.nodeType === Node.TEXT_NODE 
        ? range.startContainer.parentElement.closest('[data-block-id]')
        : range.startContainer.closest('[data-block-id]');
      const endBlock = range.endContainer.nodeType === Node.TEXT_NODE
        ? range.endContainer.parentElement.closest('[data-block-id]')
        : range.endContainer.closest('[data-block-id]');
      
      if (startBlock !== endBlock) {
        return; // Multi-block selection, don't auto-scroll
      }
    }

    // Get caret position
    const caretRect = range.getBoundingClientRect();
    
    // Get editor container (scrollable wrapper)
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;
    
    const container = editor.closest('.stack-post-body-field');
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    
    // Calculate distances from caret to container edges
    const caretTop = caretRect.top;
    const caretBottom = caretRect.bottom;
    const containerTop = containerRect.top;
    const containerBottom = containerRect.bottom;
    
    const threshold = 48; // ~48px threshold
    
    // Check if caret is near or past bottom edge
    if (caretBottom >= containerBottom - threshold) {
      // Scroll down incrementally - just enough to bring caret into comfortable view
      const scrollDelta = caretBottom - (containerBottom - threshold);
      // Add a bit more to keep caret comfortably visible
      container.scrollTop += scrollDelta + threshold;
    }
    // Check if caret is above container top
    else if (caretTop < containerTop) {
      // Scroll up incrementally - just enough to bring caret into view
      const scrollDelta = containerTop - caretTop;
      // Add a bit more to keep caret comfortably visible
      container.scrollTop -= scrollDelta + threshold;
    }
    // Caret is comfortably visible, no scrolling needed
  }

  /**
   * Handle paste events - support images and text
   */
  async handlePaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    // Check for image in clipboard
    const items = Array.from(clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));

    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      await this.insertImageAtCursor(file);
      // Sync after image insertion
      this.syncDocumentFromDOM();
      // Auto-scroll after paste
      setTimeout(() => {
        this.autoScrollToCaret();
      }, 0);
      return;
    }

    // Handle text paste - let default behavior happen, then process
    // Auto-scroll will be handled by input event
  }

  /**
   * Handle drag over - show insertion indicator and store insertion point as single source of truth
   */
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging files
    if (!e.dataTransfer.types.includes('Files')) {
      return;
    }

    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    this.isDragging = true;

    // Find insertion point for visual indicator - this is the single source of truth
    const insertionPoint = this.findInsertionPoint(e.clientY);
    
    if (insertionPoint) {
      // Store the insertion point that matches the visual indicator
      // Update on every dragover so it always matches the current indicator position
      // This ensures the drop position matches where the indicator is when drop happens
      this.storedInsertionPoint = {
        position: insertionPoint.position,
        element: insertionPoint.element,
        index: insertionPoint.index, // Document model index, not DOM index
        splitBlock: insertionPoint.splitBlock ? { ...insertionPoint.splitBlock } : null
      };
      
      // Show visual indicator at this exact position (only moves if position changed)
      this.showInsertionIndicator(insertionPoint);
    } else {
      // If insertionPoint is null, clear stored point to avoid stale data
      // This shouldn't happen in normal flow, but protects against edge cases
      this.storedInsertionPoint = null;
      this.removeInsertionIndicators();
    }

    e.dataTransfer.dropEffect = 'copy';
  }

  /**
   * Handle drag leave - remove insertion indicator (but keep stored insertion point)
   */
  handleDragLeave(e) {
    // Only remove if we're leaving the editor entirely
    const editor = document.querySelector('#stack-post-body-editor');
    if (editor && !editor.contains(e.relatedTarget)) {
      this.removeInsertionIndicators();
      this.isDragging = false;
      // DO NOT clear storedInsertionPoint here - keep it frozen until drop
    }
  }

  /**
   * Handle drop - insert image at drop point using stored insertion point (single source of truth)
   */
  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // CRITICAL: Sync document state FROM DOM first (DOM is authoritative)
    this.syncDocumentFromDOM();

    this.removeInsertionIndicators();
    this.isDragging = false;

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length === 0) {
      this.storedInsertionPoint = null;
      this.storedDropRange = null;
      return;
    }

    // Use the STORED INSERTION POINT as single source of truth
    // This matches exactly what the visual indicator showed
    const storedInsertionPoint = this.storedInsertionPoint;
    this.storedInsertionPoint = null; // Clear after use
    this.storedDropRange = null; // Clear legacy reference

    if (!storedInsertionPoint) {
      // Fallback: if no stored insertion point, use end of document
      console.warn('No stored insertion point, inserting at end');
      await this.insertImageAtCursor(files[0], null);
      return;
    }

    // Use the first image file with the stored insertion point
    await this.insertImageAtCursor(files[0], storedInsertionPoint);
  }

  /**
   * Find insertion point based on Y coordinate
   * Handles both between blocks and within blocks (e.g., between <br> tags)
   */
  findInsertionPoint(clientY) {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return null;

    const blocks = Array.from(editor.children);
    if (blocks.length === 0) return { position: 'before', element: null, index: 0, splitBlock: null };

    // Check if we're before the first block
    if (blocks.length > 0) {
      const firstBlock = blocks[0];
      const firstRect = firstBlock.getBoundingClientRect();
      if (clientY < firstRect.top) {
        return { position: 'before', element: firstBlock, index: 0, splitBlock: null };
      }
    }

    // First, check if we're over a paragraph block that might contain <br> tags
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const rect = block.getBoundingClientRect();
      
      // Check if Y coordinate is within this block
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const blockType = block.getAttribute('data-block-type');
        
        // Get document model index from data-block-index attribute (more reliable than loop index)
        const docIndex = block.getAttribute('data-block-index');
        const blockIndex = docIndex !== null ? parseInt(docIndex, 10) : i;
        
        // For paragraph blocks, check if we're over a line break area
        if (blockType === 'paragraph') {
          const splitPoint = this.findSplitPointInBlock(block, clientY);
          if (splitPoint) {
            return {
              position: 'split',
              element: block,
              index: blockIndex, // Use document model index
              splitBlock: splitPoint
            };
          }
        }
        
        // If we're in the upper half, insert before
        const blockMiddle = rect.top + rect.height / 2;
        if (clientY < blockMiddle) {
          return { position: 'before', element: block, index: blockIndex, splitBlock: null };
        } else {
          // In lower half, insert after
          return { position: 'after', element: block, index: blockIndex + 1, splitBlock: null };
        }
      }
      
      // Check if we're in a gap BETWEEN blocks (not inside any block)
      // If we're past the current block's bottom but before the next block's top
      if (i < blocks.length - 1) {
        const nextBlock = blocks[i + 1];
        const nextRect = nextBlock.getBoundingClientRect();
        
        // If mouse is between current block bottom and next block top
        if (clientY > rect.bottom && clientY < nextRect.top) {
          // Get document model index for the current block
          const docIndex = block.getAttribute('data-block-index');
          const blockIndex = docIndex !== null ? parseInt(docIndex, 10) : i;
          
          // Insert after the current block (in the gap)
          return { position: 'after', element: block, index: blockIndex + 1, splitBlock: null };
        }
      }
    }

    // After last block - use document model length
    const lastBlock = blocks[blocks.length - 1];
    const lastDocIndex = lastBlock ? (parseInt(lastBlock.getAttribute('data-block-index'), 10) || blocks.length - 1) : blocks.length - 1;
    return { position: 'after', element: lastBlock, index: lastDocIndex + 1, splitBlock: null };
  }

  /**
   * Find split point from a Range within a block
   * @param {Element} block - Block element
   * @param {Node} container - Container node from Range
   * @param {number} offset - Offset in container
   * @returns {Object|null} Split information or null
   */
  findSplitPointInBlockFromRange(block, container, offset) {
    if (!block || !container) return null;

    // Check if we're at or near a <br> element
    let node = container;
    if (container.nodeType === Node.TEXT_NODE) {
      node = container.parentNode;
    }

    // Walk to find <br> elements
    const brElements = Array.from(block.querySelectorAll('br'));
    for (const br of brElements) {
      const range = document.createRange();
      range.setStart(block, 0);
      range.setEndBefore(br);
      const beforeText = range.toString();
      
      range.setStartAfter(br);
      range.setEnd(block, block.childNodes.length);
      const afterText = range.toString();

      // Check if our offset is near this <br>
      const beforeLength = beforeText.length;
      if (Math.abs(offset - beforeLength) < 2) {
        return {
          brNode: br,
          beforeText: beforeText.trim(),
          afterText: afterText.trim()
        };
      }
    }

    return null;
  }

  /**
   * Find if we should split a block at a line break area
   * Returns split information if we're over a <br> area or blank line, null otherwise
   */
  findSplitPointInBlock(block, clientY) {
    const rect = block.getBoundingClientRect();
    
    // Try to use caretRangeFromPoint or caretPositionFromPoint to find exact position
    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(clientY, rect.left + rect.width / 2);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientY, rect.left + rect.width / 2);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    }
    
    // If we got a range, use it to find split point
    if (range && range.startContainer) {
      const container = range.startContainer;
      let splitNode = null;
      let offset = range.startOffset;
      
      // If container is the block itself, find the child node at that offset
      if (container === block) {
        if (block.childNodes[offset]) {
          splitNode = block.childNodes[offset];
        } else if (offset > 0 && block.childNodes[offset - 1]) {
          splitNode = block.childNodes[offset - 1];
        }
      } else {
        // Container is a child node
        splitNode = container;
      }
      
      // Check if we're at or near a <br> element
      if (splitNode && splitNode.tagName === 'BR') {
        const beforeText = this.getTextBeforeNode(block, splitNode);
        const afterText = this.getTextAfterNode(block, splitNode);
        return {
          brNode: splitNode,
          beforeText: beforeText.trim(),
          afterText: afterText.trim()
        };
      }
      
      // If we're in a text node, find the nearest <br> or line break
      if (splitNode && splitNode.nodeType === Node.TEXT_NODE) {
        // Walk backwards to find previous <br>
        let prevNode = splitNode.previousSibling;
        while (prevNode) {
          if (prevNode.tagName === 'BR') {
            const beforeText = this.getTextBeforeNode(block, prevNode);
            const afterText = this.getTextAfterNode(block, prevNode);
            return {
              brNode: prevNode,
              beforeText: beforeText.trim(),
              afterText: afterText.trim()
            };
          }
          prevNode = prevNode.previousSibling;
        }
        
        // Walk forwards to find next <br>
        let nextNode = splitNode.nextSibling;
        while (nextNode) {
          if (nextNode.tagName === 'BR') {
            const beforeText = this.getTextBeforeNode(block, nextNode);
            const afterText = this.getTextAfterNode(block, nextNode);
            return {
              brNode: nextNode,
              beforeText: beforeText.trim(),
              afterText: afterText.trim()
            };
          }
          nextNode = nextNode.nextSibling;
        }
        
        // No <br> found, but we can still split at the text position
        const fullText = block.textContent || '';
        let charPos = 0;
        
        // Calculate character position
        const walker = document.createTreeWalker(
          block,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        let textNode = walker.nextNode();
        while (textNode && textNode !== splitNode) {
          charPos += textNode.textContent.length;
          textNode = walker.nextNode();
        }
        
        if (textNode === splitNode) {
          charPos += offset;
        }
        
        const beforeText = fullText.substring(0, charPos).trim();
        const afterText = fullText.substring(charPos).trim();
        
        if (beforeText || afterText) {
          return {
            brNode: null,
            beforeText: beforeText,
            afterText: afterText,
            estimated: true
          };
        }
      }
    }
    
    // Fallback: check all <br> elements
    const brElements = Array.from(block.querySelectorAll('br'));
    let closestBr = null;
    let closestDistance = Infinity;
    
    for (const br of brElements) {
      const brRect = br.getBoundingClientRect();
      const brY = brRect.top + brRect.height / 2;
      const distance = Math.abs(clientY - brY);
      
      if (distance < closestDistance && distance < 30) {
        closestDistance = distance;
        closestBr = br;
      }
    }
    
    if (closestBr) {
      const beforeText = this.getTextBeforeNode(block, closestBr);
      const afterText = this.getTextAfterNode(block, closestBr);
      return {
        brNode: closestBr,
        beforeText: beforeText.trim(),
        afterText: afterText.trim()
      };
    }
    
    return null;
  }

  /**
   * Get text content before a specific node within a block
   */
  getTextBeforeNode(block, targetNode) {
    const range = document.createRange();
    range.setStart(block, 0);
    range.setEndBefore(targetNode);
    return range.toString();
  }

  /**
   * Get text content after a specific node within a block
   */
  getTextAfterNode(block, targetNode) {
    const range = document.createRange();
    range.setStartAfter(targetNode);
    range.setEnd(block, block.childNodes.length);
    return range.toString();
  }

  /**
   * Show insertion indicator between blocks or at split point
   * Optimized to only move indicator when position actually changes
   */
  showInsertionIndicator(insertionPoint) {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor || !insertionPoint) return;

    let indicator = document.querySelector('.stack-insertion-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'stack-insertion-indicator';
      editor.appendChild(indicator);
    }

    // Determine where the indicator should be
    let targetSibling = null;
    if (insertionPoint.position === 'split' && insertionPoint.splitBlock && insertionPoint.element) {
      // Show indicator after the block that will be split
      const block = insertionPoint.element;
      targetSibling = block.nextSibling;
    } else if (insertionPoint.position === 'before' && insertionPoint.element) {
      targetSibling = insertionPoint.element;
    } else if (insertionPoint.position === 'after' && insertionPoint.element) {
      targetSibling = insertionPoint.element.nextSibling;
    } else if (insertionPoint.position === 'before' && !insertionPoint.element) {
      // First block (no element means before first)
      targetSibling = editor.firstChild;
    } else {
      // Fallback: append to end
      targetSibling = null;
    }

    // Only move indicator if it's not already in the correct position
    // Check if indicator's nextSibling matches the target
    const currentNextSibling = indicator.nextSibling;
    if (currentNextSibling !== targetSibling) {
      if (targetSibling && targetSibling !== indicator) {
        // Only move if target is not the indicator itself (prevents infinite loops)
        editor.insertBefore(indicator, targetSibling);
      } else if (targetSibling === null) {
        // No target sibling means append to end
        // Only move if indicator is not already at the end
        if (indicator.parentNode !== editor || indicator.nextSibling !== null) {
          editor.appendChild(indicator);
        }
      }
    }
  }

  /**
   * Remove insertion indicators
   */
  removeInsertionIndicators() {
    const indicators = document.querySelectorAll('.stack-insertion-indicator');
    indicators.forEach(indicator => indicator.remove());
  }

  /**
   * Insert image at cursor position or drop point
   * @param {File} file - Image file to insert
   * @param {Object|null} dropPosition - Stored insertionPoint object (single source of truth), or null for cursor
   */
  async insertImageAtCursor(file, dropPosition = null) {
    if (!file || !file.type.startsWith('image/')) return;

    // CRITICAL: Sync document state FROM DOM first (DOM is authoritative)
    this.syncDocumentFromDOM();

    // Read file as data URL
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Optionally resize image (using existing infrastructure)
    let imageDataUrl = dataUrl;
    if (this.app.browser && this.app.browser.resizeImg) {
      try {
        imageDataUrl = await this.app.browser.resizeImg(dataUrl);
      } catch (err) {
        console.warn('Image resize failed, using original:', err);
      }
    }

    // Extract base64 data (for storage)
    const base64Data = imageDataUrl.split(',')[1] || '';

    // Determine insertion index using stored insertion point (single source of truth)
    // Default to end only if we have no position information
    let insertIndex = -1; // Use -1 to indicate "not set" - we'll validate later
    let needsBlockSplit = false;
    let splitInfo = null;
    let blockToSplitIndex = -1;
    
    if (dropPosition) {
      // Use stored insertion point - this matches exactly what the visual indicator showed
      // dropPosition is the storedInsertionPoint object with: position, element, index, splitBlock
      insertIndex = dropPosition.index;
      blockToSplitIndex = dropPosition.index;
      
      if (dropPosition.position === 'split' && dropPosition.splitBlock) {
        needsBlockSplit = true;
        splitInfo = dropPosition.splitBlock;
        // When splitting, insert after the split (at index + 1)
        insertIndex = dropPosition.index + 1;
      } else if (dropPosition.position === 'before') {
        // Insert before the element at this index
        insertIndex = dropPosition.index;
      } else if (dropPosition.position === 'after') {
        // Insert after the element at this index
        insertIndex = dropPosition.index;
      }
    } else {
      // Cursor position (no drop position provided)
      const focusedBlock = this.getFocusedBlock();
      if (focusedBlock) {
        const blockIndex = this.getBlockIndex(focusedBlock);
        if (blockIndex >= 0) {
          insertIndex = blockIndex + 1;
        }
      }
    }

    // Validate insertIndex - clamp to valid range
    if (insertIndex < 0) {
      insertIndex = this.document.blocks.length;
    } else if (insertIndex > this.document.blocks.length) {
      // If index is beyond document length, clamp to end
      insertIndex = this.document.blocks.length;
    }

    // Get editor reference
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    // If we need to split a block, do it first in DOM
    if (needsBlockSplit && splitInfo && blockToSplitIndex >= 0 && blockToSplitIndex < this.document.blocks.length) {
      const blockToSplit = this.document.blocks[blockToSplitIndex];
      if (blockToSplit && blockToSplit.type === 'paragraph') {
        const blockToSplitEl = document.querySelector(`[data-block-id="${blockToSplit.id}"]`);
        if (blockToSplitEl) {
        // Update the original block with text before the split
          blockToSplitEl.textContent = splitInfo.beforeText.trim();
          
          // Create a new paragraph block with text after the split in DOM
          const afterBlockEl = document.createElement('p');
          const afterBlockId = generateBlockId(this.document.blocks.length);
          afterBlockEl.setAttribute('data-block-id', afterBlockId);
          afterBlockEl.setAttribute('data-block-type', 'paragraph');
          afterBlockEl.setAttribute('data-block-index', insertIndex.toString());
          afterBlockEl.contentEditable = 'true';
          afterBlockEl.textContent = splitInfo.afterText.trim();
          
          // Insert after the split block
          if (blockToSplitEl.nextSibling) {
            editor.insertBefore(afterBlockEl, blockToSplitEl.nextSibling);
          } else {
            editor.appendChild(afterBlockEl);
          }
        // insertIndex remains correct for the image (after the new after-block)
        }
      }
    }

    // Create image block
    const imageBlock = {
      type: 'image',
      id: generateBlockId(this.document.blocks.length),
      src: imageDataUrl, // Use data URL for immediate display
      caption: file.name || '' // Optional caption, hidden by default
    };

    // Create image element in DOM
    const imageElement = document.createElement('figure');
    imageElement.setAttribute('data-block-id', imageBlock.id);
    imageElement.setAttribute('data-block-type', 'image');
    imageElement.setAttribute('data-block-index', insertIndex.toString());
    imageElement.className = 'stack-image-block';
    imageElement.contentEditable = false;

    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.alt = imageBlock.caption || '';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.margin = '0 auto';
    imageElement.appendChild(img);

    // Create new paragraph element in DOM
    const newParagraphElement = document.createElement('p');
    const newParagraphId = generateBlockId(this.document.blocks.length + 1);
    newParagraphElement.setAttribute('data-block-id', newParagraphId);
    newParagraphElement.setAttribute('data-block-type', 'paragraph');
    newParagraphElement.setAttribute('data-block-index', (insertIndex + 1).toString());
    newParagraphElement.contentEditable = 'true';
    newParagraphElement.textContent = '';
    newParagraphElement.appendChild(document.createTextNode('\u200B'));

    // Insert into DOM
    if (insertIndex >= editor.children.length) {
      editor.appendChild(imageElement);
      editor.appendChild(newParagraphElement);
        } else {
      const insertBefore = editor.children[insertIndex];
      editor.insertBefore(imageElement, insertBefore);
      editor.insertBefore(newParagraphElement, imageElement.nextSibling);
        }

    // Sync document state from DOM
    this.syncDocumentFromDOM();

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

    // Focus the new paragraph synchronously
    const newRange = document.createRange();
    const newSelection = window.getSelection();
    const textNode = newParagraphElement.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      newRange.setStart(textNode, 0);
      newRange.setEnd(textNode, 0);
    } else {
      newRange.setStart(newParagraphElement, 0);
      newRange.setEnd(newParagraphElement, 0);
    }
    newSelection.removeAllRanges();
    newSelection.addRange(newRange);
    newParagraphElement.focus();
  }

  /**
   * Handle click on image block - toggle selection to show/hide caption
   */
  handleImageClick(imageBlock) {
    // Deselect all images first
    this.deselectAllImages();
    
    // Toggle selection on clicked image
    if (imageBlock.classList.contains('stack-image-selected')) {
      imageBlock.classList.remove('stack-image-selected');
    } else {
      imageBlock.classList.add('stack-image-selected');
    }
  }

  /**
   * Deselect all image blocks
   */
  deselectAllImages() {
    const selectedImages = document.querySelectorAll('.stack-image-selected');
    selectedImages.forEach(img => img.classList.remove('stack-image-selected'));
  }

  /**
   * Update publish trigger visibility based on content (now on Admin element)
   */
  updatePublishTriggerVisibility() {
    const adminElement = document.querySelector('#stack-draft-state');
    if (!adminElement) return;

    // Check if there's meaningful content
    const hasContent = this.document.blocks.some(block => {
      if (block.type === 'paragraph' || block.type === 'heading') {
        const text = (block.text || '').replace(/\u200B/g, '').trim();
        return text.length > 0;
      }
      if (block.type === 'image') {
        return true;
      }
      if (block.type === 'rawhtml') {
        return (block.html || '').trim().length > 0;
      }
      return false;
    });

    if (hasContent) {
      adminElement.classList.add('stack-admin-active');
    } else {
      adminElement.classList.remove('stack-admin-active');
    }
  }

  /**
   * Update publish trigger state (draft/published) - now on Admin element
   */
  updatePublishTriggerState() {
    const adminElement = document.querySelector('#stack-draft-state');
    if (!adminElement) return;

    if (this.isPublished) {
      adminElement.classList.add('stack-admin-published');
      adminElement.setAttribute('title', 'Edit publication');
    } else {
      adminElement.classList.remove('stack-admin-published');
      adminElement.setAttribute('title', 'Publish settings');
    }
  }

  /**
   * Focus body editor at the end of document content
   * Used when transitioning from title to body (Enter/Tab)
   */
  focusBodyEditorAtEnd() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    // Find the last editable block in the document
    const blocks = Array.from(editor.children);
    let targetBlock = null;

    // Work backwards to find the last editable block
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      const blockType = block.getAttribute('data-block-type');
      
      // Skip non-editable blocks (images, etc.)
      if (blockType === 'paragraph' || blockType === 'heading' || blockType === 'rawhtml') {
        if (block.hasAttribute('contenteditable') && block.getAttribute('contenteditable') === 'true') {
          targetBlock = block;
          break;
        }
      }
    }

    // If no editable block found, use the first block or create one
    if (!targetBlock) {
      targetBlock = editor.querySelector('[contenteditable="true"]');
      
      // If still no block, ensure we have at least one paragraph in DOM
      if (!targetBlock && this.document.blocks.length === 0) {
        const { generateBlockId } = require('../post-document');
        const newParagraphEl = document.createElement('p');
        const newParagraphId = generateBlockId(0);
        newParagraphEl.setAttribute('data-block-id', newParagraphId);
        newParagraphEl.setAttribute('data-block-type', 'paragraph');
        newParagraphEl.setAttribute('data-block-index', '0');
        newParagraphEl.contentEditable = 'true';
        newParagraphEl.textContent = '';
        newParagraphEl.appendChild(document.createTextNode('\u200B'));
        editor.appendChild(newParagraphEl);
        
        // Sync document state from DOM
        this.syncDocumentFromDOM();
        
        targetBlock = newParagraphEl;
      }
    }

    if (targetBlock) {
      const range = document.createRange();
      const selection = window.getSelection();

      // Find the last text node in the block
      let lastTextNode = null;
      const walker = document.createTreeWalker(
        targetBlock,
        NodeFilter.SHOW_TEXT,
        null
      );

      let textNode = walker.nextNode();
      while (textNode) {
        lastTextNode = textNode;
        textNode = walker.nextNode();
      }

      // Place cursor at the end of the last text node
      if (lastTextNode) {
        const textLength = lastTextNode.textContent.replace(/\u200B/g, '').length;
        const actualLength = lastTextNode.textContent.length;
        range.setStart(lastTextNode, actualLength);
        range.setEnd(lastTextNode, actualLength);
      } else {
        // No text node, place at end of block
        if (targetBlock.firstChild) {
          range.setStartAfter(targetBlock.lastChild);
          range.setEndAfter(targetBlock.lastChild);
        } else {
          // Empty block, create text node and place cursor
          const textNode = document.createTextNode('\u200B');
          targetBlock.appendChild(textNode);
          range.setStart(textNode, 0);
          range.setEnd(textNode, 0);
        }
      }

      selection.removeAllRanges();
      selection.addRange(range);
      targetBlock.focus();

      // Smoothly scroll to make the caret visible
      setTimeout(() => {
        const rect = range.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        const scrollContainer = editor.closest('.stack-post-body-field');
        
        if (scrollContainer && rect) {
          // Check if caret is outside viewport
          const isAboveViewport = rect.top < editorRect.top;
          const isBelowViewport = rect.bottom > editorRect.bottom;
          
          if (isAboveViewport || isBelowViewport) {
            // Calculate scroll position to center the caret
            const scrollTop = scrollContainer.scrollTop;
            const caretRelativeTop = rect.top - editorRect.top + scrollTop;
            const viewportHeight = scrollContainer.clientHeight;
            const targetScroll = caretRelativeTop - (viewportHeight / 2);
            
            scrollContainer.scrollTo({
              top: Math.max(0, targetScroll),
              behavior: 'smooth'
            });
          }
        } else if (targetBlock) {
          // Fallback: scroll the block into view
          targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 0);
    } else {
      // Fallback: focus the editor itself
      editor.focus();
    }
  }

  /**
   * Handle publish trigger click - open publish settings overlay
   */
  handlePublishTriggerClick() {
    if (!this.mod.publishSettingsOverlay) {
      const PublishSettingsOverlay = require('./overlay/publish-settings');
      this.mod.publishSettingsOverlay = new PublishSettingsOverlay(this.app, this.mod);
    }

    // Get current post data
    const title = document.querySelector('#stack-post-title-input')?.value || '';
    const editor = document.querySelector('#stack-post-body-editor');
    const { serializeDocumentToMarkdown } = require('../post-document');
    const content = editor ? serializeDocumentToMarkdown(this.document) : '';

    // Get cover image if exists
    const coverImageImg = document.querySelector('#stack-cover-image-img');
    let image = null;
    let imageUrl = null;
    if (coverImageImg && coverImageImg.src) {
      const src = coverImageImg.src;
      if (src.startsWith('data:')) {
        image = src.split(',')[1];
      } else {
        imageUrl = src;
      }
    }

    this.mod.publishSettingsOverlay.render({
      published: this.isPublished,
      description: content.substring(0, 200).replace(/\n/g, ' ').trim(),
      image: image,
      imageUrl: imageUrl
    });
  }

  /**
   * Delete a selected image block
   */
  deleteSelectedImage(imageElement) {
    const blockId = imageElement.getAttribute('data-block-id');
    if (!blockId) return;

    // Find target element BEFORE removing (to move caret to)
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    let targetElement = null;
    
    // Try to find a paragraph block after the image
    const nextSibling = imageElement.nextSibling;
    if (nextSibling && nextSibling.hasAttribute && nextSibling.hasAttribute('contenteditable')) {
      targetElement = nextSibling;
    }
    
      // If no block after, try the one before
    if (!targetElement) {
      const prevSibling = imageElement.previousSibling;
      if (prevSibling && prevSibling.hasAttribute && prevSibling.hasAttribute('contenteditable')) {
        targetElement = prevSibling;
      }
    }

    // Remove the image block from DOM
    imageElement.remove();

    // Sync document state from DOM
    this.syncDocumentFromDOM();

    // Update placeholder visibility
    this.updatePlaceholderVisibility();
    
    // If still no block, create a new empty paragraph in DOM
    if (!targetElement) {
        const { generateBlockId } = require('../post-document');
      const newParagraphEl = document.createElement('p');
      const newParagraphId = generateBlockId(this.document.blocks.length);
      newParagraphEl.setAttribute('data-block-id', newParagraphId);
      newParagraphEl.setAttribute('data-block-type', 'paragraph');
      newParagraphEl.setAttribute('data-block-index', '0');
      newParagraphEl.contentEditable = 'true';
      newParagraphEl.textContent = '';
      newParagraphEl.appendChild(document.createTextNode('\u200B'));
      editor.appendChild(newParagraphEl);
      targetElement = newParagraphEl;
      
      // Sync after creating new block
      this.syncDocumentFromDOM();
    }

    // Focus the target block synchronously
        if (targetElement && targetElement.hasAttribute('contenteditable')) {
          const range = document.createRange();
          const selection = window.getSelection();
          
          // Place cursor at the end of the block if it's a paragraph/heading
      const blockType = targetElement.getAttribute('data-block-type');
      if (blockType === 'paragraph' || blockType === 'heading') {
            const textNode = targetElement.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
              const textLength = textNode.textContent.replace(/\u200B/g, '').length;
              range.setStart(textNode, Math.min(textLength, textNode.textContent.length));
              range.setEnd(textNode, Math.min(textLength, textNode.textContent.length));
            } else {
              range.setStart(targetElement, 0);
              range.setEnd(targetElement, 0);
            }
          } else {
            range.setStart(targetElement, 0);
            range.setEnd(targetElement, 0);
          }
          
          selection.removeAllRanges();
          selection.addRange(range);
          targetElement.focus();
        }
  }

  attachEvents() {
    try {
      // Admin element (draft-state) - always clickable
      const adminElement = document.querySelector('#stack-draft-state');
      if (adminElement) {
        adminElement.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handlePublishTriggerClick();
        });
        // Ensure element is always clickable
        adminElement.style.pointerEvents = 'auto';
        adminElement.style.cursor = 'pointer';
      }
      
      // Title input - update next step button on change
      const titleInput = document.querySelector('#stack-post-title-input');
      if (titleInput) {
        titleInput.addEventListener('input', () => {
          this.updateNextStepButton();
          this.updatePublishTriggerVisibility();
        });
        
        // Handle Enter and Tab to move to body editor
        titleInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            this.focusBodyEditorAtEnd();
          }
        });
        
        titleInput.addEventListener('blur', () => {
          // Auto-focus body editor when title loses focus (if empty)
          if (!titleInput.value.trim()) {
            setTimeout(() => {
              const editor = document.querySelector('#stack-post-body-editor');
              if (editor) {
                const firstBlock = editor.querySelector('[contenteditable="true"]');
                if (firstBlock) {
                  firstBlock.focus();
                }
              }
            }, 0);
          }
        });
      }

      // Next step button (Preview)
      const nextStepBtn = document.querySelector('#stack-next-step-btn');
      if (nextStepBtn) {
        nextStepBtn.onclick = (e) => {
          e.preventDefault();
          if (!nextStepBtn.disabled && this.mod.previewOverlay) {
            this.mod.previewOverlay.render();
          }
        };
      }

      // Editor keyboard and input handlers
      const editor = document.querySelector('#stack-post-body-editor');
      if (editor) {
        // Handle Enter key
        editor.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            this.handleEnterKey(e);
          } else if (e.key === 'Backspace') {
            this.handleBackspaceKey(e);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            this.handleArrowKey(e);
          } else if (e.key === 'Delete') {
            this.handleDeleteKey(e);
          }
        });

        // Handle input events
        editor.addEventListener('input', (e) => {
          this.handleEditorInput(e);
        });

        // Handle paste events
        editor.addEventListener('paste', (e) => {
          this.handlePaste(e);
        });

        // Handle drag and drop
        editor.addEventListener('dragover', (e) => {
          this.handleDragOver(e);
        });

        editor.addEventListener('dragleave', (e) => {
          this.handleDragLeave(e);
        });

        editor.addEventListener('drop', (e) => {
          this.handleDrop(e);
        });

        // Handle blur to ensure document is saved
        editor.addEventListener('blur', () => {
          const markdown = serializeDocumentToMarkdown(this.document);
          this.saveDraft(markdown);
        });

        // Handle clicks on image blocks to show/hide caption
        editor.addEventListener('click', (e) => {
          const imageBlock = e.target.closest('figure[data-block-type="image"]');
          if (imageBlock) {
            this.handleImageClick(imageBlock);
          } else {
            // Deselect all images when clicking elsewhere
            this.deselectAllImages();
          }
        });
      }
    } catch (err) {
      console.error('CreatePost attachEvents error:', err);
    }
  }

  async handlePublish() {
    const title = document.querySelector('#stack-post-title-input')?.value || '';
    
    // Get markdown from document model (source of truth)
    // Serialize document to ensure we have the latest version
    const content = serializeDocumentToMarkdown(this.document);
    
    if (!title.trim()) {
      alert('Please enter a title for your post');
      return;
    }

    if (!content.trim()) {
      alert('Please enter content for your post');
      return;
    }

    try {
      // Get uploaded images
      const uploadedImages = document.querySelectorAll('.stack-uploaded-image-item img');
      let image = '';
      let imageUrl = '';
      
      // Use the first uploaded image if available
      if (uploadedImages.length > 0) {
        const firstImage = uploadedImages[0];
        const imageSrc = firstImage.getAttribute('src');
        if (imageSrc && imageSrc.startsWith('data:')) {
          // Extract base64 data (remove data:image/...;base64, prefix)
          image = imageSrc.split(',')[1] || '';
        } else if (imageSrc) {
          imageUrl = imageSrc;
        }
      }

      // Create excerpt from content (first 200 characters)
      const excerpt = content.substring(0, 200).replace(/\n/g, ' ').trim();
      const excerptWithEllipsis = excerpt.length < content.length ? excerpt + '...' : excerpt;

      // Prepare post data matching blog module structure
      const postData = {
        title: title.trim(),
        content: content.trim(),
        image: image,
        imageUrl: imageUrl,
        tags: [], // Can be extended later
        timestamp: Date.now(),
        subscriptionTier: 'free', // Default to free, can be extended later
        excerpt: excerptWithEllipsis
      };

      // Show loading message
      if (this.app.connection) {
        this.app.connection.emit('saito-header-update-message', {
          msg: 'Publishing post...',
          timeout: 0
        });
      }

      // Create and propagate the transaction
      await this.mod.createStackPostTransaction(postData, () => {
        // Callback after post is confirmed
        if (this.app.connection) {
          this.app.connection.emit('saito-header-update-message', { msg: '' });
        }
        
        // Return to splash page
        if (this.mod.main) {
          this.mod.main.render();
        }
      });

    } catch (error) {
      console.error('Error publishing post:', error);
      alert('Failed to publish post. Please try again.');
      if (this.app.connection) {
        this.app.connection.emit('saito-header-update-message', {
          msg: 'Error publishing post',
          timeout: 2000
        });
      }
    }
  }
}

module.exports = CreatePost;

