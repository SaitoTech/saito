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
    
    // Auto-focus body editor on load - cursor at placeholder position
    setTimeout(() => {
      const editor = document.querySelector('#stack-post-body-editor');
      if (editor) {
        // Find first editable block (should be the empty paragraph)
        const firstBlock = editor.querySelector('[contenteditable="true"]');
        if (firstBlock) {
          const range = document.createRange();
          const selection = window.getSelection();
          
          // Ensure the block has a text node for cursor placement
          if (!firstBlock.firstChild || firstBlock.firstChild.nodeType !== Node.TEXT_NODE) {
            const textNode = document.createTextNode('\u200B');
            firstBlock.appendChild(textNode);
          }
          
          // Place cursor at the start of the text node (where placeholder appears)
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
   */
  handleEnterKey(e) {
    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockType = focusedBlock.getAttribute('data-block-type');
    if (blockType !== 'paragraph') {
      // For non-paragraph blocks, allow default behavior
      return;
    }

    e.preventDefault();

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const blockIndex = this.getBlockIndex(focusedBlock);
    const block = this.document.blocks[blockIndex];

    if (!block || block.type !== 'paragraph') return;

    // Get cursor position within the block
    const cursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
    const currentText = (block.text || '').replace(/\u200B/g, '');
    const beforeText = currentText.substring(0, cursorOffset);
    const afterText = currentText.substring(cursorOffset);

    // Update current block
    block.text = beforeText;

    // Create new paragraph block
    const newBlock = {
      type: 'paragraph',
      id: generateBlockId(this.document.blocks.length),
      text: afterText
    };

    // Insert new block after current block
    this.document.blocks.splice(blockIndex + 1, 0, newBlock);

    // Re-render document
    this.renderDocument();

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

    // Focus the new block
    setTimeout(() => {
      const newBlockElement = document.querySelector(`[data-block-id="${newBlock.id}"]`);
      if (newBlockElement) {
        const range = document.createRange();
        const selection = window.getSelection();
        // Find first text node in new block
        const textNode = newBlockElement.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          range.setStart(textNode, 0);
          range.setEnd(textNode, 0);
        } else {
          range.setStart(newBlockElement, 0);
          range.setEnd(newBlockElement, 0);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 0);
  }

  /**
   * Handle Backspace key - merge with previous block if at start, or delete image if adjacent
   */
  handleBackspaceKey(e) {
    // Check if an image is selected first
    const selectedImage = document.querySelector('.stack-image-selected');
    if (selectedImage) {
      e.preventDefault();
      this.deleteSelectedImage(selectedImage);
      return;
    }

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

    // Handle deletion when caret is at start of paragraph
    if (blockType === 'paragraph' && blockIndex > 0) {
      const cursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
      const isAtStart = cursorOffset === 0;

      if (isAtStart) {
        const previousBlock = this.document.blocks[blockIndex - 1];
        
        // If previous block is an image, delete it
        if (previousBlock && previousBlock.type === 'image') {
          e.preventDefault();
          
          // Remove the image block
          this.document.blocks.splice(blockIndex - 1, 1);
          
          // Re-render document
          this.renderDocument();
          
          // Focus the current paragraph
          setTimeout(() => {
            const currentBlockEl = document.querySelector(`[data-block-id="${this.document.blocks[blockIndex - 1].id}"]`);
            if (currentBlockEl) {
              const newRange = document.createRange();
              const newSelection = window.getSelection();
              if (currentBlockEl.firstChild && currentBlockEl.firstChild.nodeType === Node.TEXT_NODE) {
                newRange.setStart(currentBlockEl.firstChild, 0);
                newRange.setEnd(currentBlockEl.firstChild, 0);
              } else {
                newRange.setStart(currentBlockEl, 0);
                newRange.setEnd(currentBlockEl, 0);
              }
              newSelection.removeAllRanges();
              newSelection.addRange(newRange);
              currentBlockEl.focus();
            }
          }, 0);
          
          // Serialize and save
          const markdown = serializeDocumentToMarkdown(this.document);
          this.saveDraft(markdown);
          this.updatePlaceholderVisibility();
          return;
        }
        
        // If previous block is also a paragraph, merge them
        if (previousBlock && previousBlock.type === 'paragraph') {
          e.preventDefault();
          
          const currentBlock = this.document.blocks[blockIndex];
          // Merge text (remove zero-width spaces)
          const prevText = (previousBlock.text || '').replace(/\u200B/g, '');
          const currText = (currentBlock.text || '').replace(/\u200B/g, '');
          previousBlock.text = prevText + currText;
          
          // Remove current block
          this.document.blocks.splice(blockIndex, 1);
          
          // Re-render document
          this.renderDocument();
          
          // Update placeholder visibility
          this.updatePlaceholderVisibility();
          
          // Serialize and save
          const markdown = serializeDocumentToMarkdown(this.document);
          this.saveDraft(markdown);
          
          // Focus the merged paragraph
          setTimeout(() => {
            const mergedBlockEl = document.querySelector(`[data-block-id="${previousBlock.id}"]`);
            if (mergedBlockEl) {
              const newRange = document.createRange();
              const newSelection = window.getSelection();
              const textLength = prevText.length;
              if (mergedBlockEl.firstChild && mergedBlockEl.firstChild.nodeType === Node.TEXT_NODE) {
                newRange.setStart(mergedBlockEl.firstChild, textLength);
                newRange.setEnd(mergedBlockEl.firstChild, textLength);
              } else {
                newRange.setStart(mergedBlockEl, 0);
                newRange.setEnd(mergedBlockEl, 0);
              }
              newSelection.removeAllRanges();
              newSelection.addRange(newRange);
              mergedBlockEl.focus();
            }
          }, 0);
          return;
        }
      }
    }

    // Allow default backspace behavior for other cases
  }

  /**
   * Handle Delete key - merge with next block if at end, or delete image if adjacent
   */
  handleDeleteKey(e) {
    // Check if an image is selected first
    const selectedImage = document.querySelector('.stack-image-selected');
    if (selectedImage) {
      e.preventDefault();
      this.deleteSelectedImage(selectedImage);
      return;
    }

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockIndex = this.getBlockIndex(focusedBlock);
    const currentBlock = this.document.blocks[blockIndex];

    // If cursor is at the end of a paragraph block
    if (currentBlock && currentBlock.type === 'paragraph' && range.startOffset === (currentBlock.text || '').replace(/\u200B/g, '').length && range.collapsed) {
      e.preventDefault(); // Prevent default browser delete behavior

      const nextBlockIndex = blockIndex + 1;
      if (nextBlockIndex >= this.document.blocks.length) {
        // Last block, allow default behavior (e.g., deleting trailing spaces)
        return;
      }

      const nextBlock = this.document.blocks[nextBlockIndex];
      if (!nextBlock) return;

      if (nextBlock.type === 'image' || nextBlock.type === 'rawhtml') {
        // Delete the next image/rawhtml block
        this.document.blocks.splice(nextBlockIndex, 1);
        this.renderDocument();
        this.updatePlaceholderVisibility();

        // Keep cursor at the end of the current block
        setTimeout(() => {
          const newFocusedElement = document.querySelector(`[data-block-id="${currentBlock.id}"]`);
          if (newFocusedElement) {
            const newRange = document.createRange();
            const newSelection = window.getSelection();
            const textNode = newFocusedElement.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
              newRange.setStart(textNode, textNode.textContent.length);
              newRange.setEnd(textNode, textNode.textContent.length);
            } else {
              newRange.setStart(newFocusedElement, 0);
              newRange.setEnd(newFocusedElement, 0);
            }
            newSelection.removeAllRanges();
            newSelection.addRange(newRange);
          }
        }, 0);
        this.saveDraft(serializeDocumentToMarkdown(this.document));
        return;
      } else if (nextBlock.type === 'paragraph' || nextBlock.type === 'heading') {
        // Merge next paragraph/heading into current paragraph
        const currText = (currentBlock.text || '').replace(/\u200B/g, '');
        const nextText = (nextBlock.text || '').replace(/\u200B/g, '');
        currentBlock.text = currText + nextText;
        this.document.blocks.splice(nextBlockIndex, 1);
        this.renderDocument();
        this.updatePlaceholderVisibility();

        // Keep cursor at the merge point in the current block
        setTimeout(() => {
          const mergedBlockElement = document.querySelector(`[data-block-id="${currentBlock.id}"]`);
          if (mergedBlockElement) {
            const newRange = document.createRange();
            const newSelection = window.getSelection();
            const textNode = mergedBlockElement.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
              const offset = Math.min(currText.length, textNode.textContent.length);
              newRange.setStart(textNode, offset);
              newRange.setEnd(textNode, offset);
            } else {
              newRange.setStart(mergedBlockElement, 0);
              newRange.setEnd(mergedBlockElement, 0);
            }
            newSelection.removeAllRanges();
            newSelection.addRange(newRange);
          }
        }, 0);
        this.saveDraft(serializeDocumentToMarkdown(this.document));
        return;
      }
    } else if (focusedBlock.getAttribute('data-block-type') === 'image') {
      // If an image block is somehow focused, delete it
      e.preventDefault();
      this.document.blocks.splice(blockIndex, 1);
      this.renderDocument();
      this.updatePlaceholderVisibility();
      this.saveDraft(serializeDocumentToMarkdown(this.document));
      return;
    }
    // Allow default browser behavior for other cases
  }

  /**
   * Handle input events - update document model
   */
  handleEditorInput(e) {
    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockId = focusedBlock.getAttribute('data-block-id');
    const blockType = focusedBlock.getAttribute('data-block-type');
    const blockIndex = this.getBlockIndex(focusedBlock);
    const block = this.document.blocks[blockIndex];

    if (!block) return;

    // Update block text based on type
    if (blockType === 'paragraph' || blockType === 'heading') {
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
      return;
    }

    // Handle text paste - let default behavior happen, then process
    // We'll handle this in the input event
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

    // If we need to split a block, do it first
    if (needsBlockSplit && splitInfo && blockToSplitIndex >= 0 && blockToSplitIndex < this.document.blocks.length) {
      const blockToSplit = this.document.blocks[blockToSplitIndex];
      if (blockToSplit && blockToSplit.type === 'paragraph') {
        // Update the original block with text before the split
        blockToSplit.text = splitInfo.beforeText.trim();
        
        // Create a new paragraph block with text after the split
        const afterBlock = {
          type: 'paragraph',
          id: generateBlockId(this.document.blocks.length),
          text: splitInfo.afterText.trim()
        };
        
        // Insert the after-block at insertIndex (which is already blockToSplitIndex + 1)
        // This places it right after the original block (which is now split)
        this.document.blocks.splice(insertIndex, 0, afterBlock);
        // insertIndex remains correct for the image (after the new after-block)
      }
    }

    // Create image block
    const imageBlock = {
      type: 'image',
      id: generateBlockId(this.document.blocks.length),
      src: imageDataUrl, // Use data URL for immediate display
      caption: file.name || '' // Optional caption, hidden by default
    };

    // Insert image block
    this.document.blocks.splice(insertIndex, 0, imageBlock);

    // Create new paragraph block after image for cursor
    const newParagraphBlock = {
      type: 'paragraph',
      id: generateBlockId(this.document.blocks.length + 1),
      text: ''
    };
    this.document.blocks.splice(insertIndex + 1, 0, newParagraphBlock);

    // Re-render document
    this.renderDocument();

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

    // Focus the new paragraph block
    setTimeout(() => {
      const newBlockElement = document.querySelector(`[data-block-id="${newParagraphBlock.id}"]`);
      if (newBlockElement) {
        const range = document.createRange();
        const selection = window.getSelection();
        if (newBlockElement.firstChild) {
          range.setStart(newBlockElement.firstChild, 0);
          range.setEnd(newBlockElement.firstChild, 0);
        } else {
          range.setStart(newBlockElement, 0);
          range.setEnd(newBlockElement, 0);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 0);

    // Serialize and save draft
    const markdown = serializeDocumentToMarkdown(this.document);
    this.saveDraft(markdown);

    // Update placeholder visibility
    this.updatePlaceholderVisibility();
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
      
      // If still no block, ensure we have at least one paragraph
      if (!targetBlock && this.document.blocks.length === 0) {
        const { generateBlockId } = require('../post-document');
        this.document.blocks.push({
          type: 'paragraph',
          id: generateBlockId(0),
          text: ''
        });
        this.renderDocument();
        targetBlock = editor.querySelector('[contenteditable="true"]');
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

    const blockIndex = this.document.blocks.findIndex(block => block.id === blockId);
    if (blockIndex < 0) return;

    // Remove the image block from the document
    this.document.blocks.splice(blockIndex, 1);

    // Re-render the document
    this.renderDocument();
    this.updatePlaceholderVisibility();

    // Move caret to an adjacent paragraph
    setTimeout(() => {
      let targetBlock = null;
      
      // Try to find a paragraph block after the deleted image
      if (blockIndex < this.document.blocks.length) {
        targetBlock = this.document.blocks[blockIndex];
      }
      // If no block after, try the one before
      if (!targetBlock && blockIndex > 0) {
        targetBlock = this.document.blocks[blockIndex - 1];
      }
      // If still no block, create a new empty paragraph
      if (!targetBlock) {
        const { generateBlockId } = require('../post-document');
        targetBlock = {
          type: 'paragraph',
          id: generateBlockId(this.document.blocks.length),
          text: ''
        };
        this.document.blocks.push(targetBlock);
        this.renderDocument();
      }

      // Focus the target block
      if (targetBlock) {
        const targetElement = document.querySelector(`[data-block-id="${targetBlock.id}"]`);
        if (targetElement && targetElement.hasAttribute('contenteditable')) {
          const range = document.createRange();
          const selection = window.getSelection();
          
          // Place cursor at the end of the block if it's a paragraph/heading
          if (targetBlock.type === 'paragraph' || targetBlock.type === 'heading') {
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
    }, 0);

    // Serialize and save draft
    const { serializeDocumentToMarkdown } = require('../post-document');
    const markdown = serializeDocumentToMarkdown(this.document);
    this.saveDraft(markdown);
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

