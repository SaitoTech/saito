const CreatePostTemplate = require('./create-post.template');
const { parseMarkdownToDocument, serializeDocumentToMarkdown, renderDocument, generateBlockId } = require('../post-document');

/**
 * ============================================================================
 * EDITOR STRUCTURAL INVARIANTS
 * ============================================================================
 * 
 * These invariants define the core semantics of the editor and must be
 * maintained by all code paths. Violations cause race conditions, stale state,
 * and unpredictable behavior.
 * 
 * 1. DOM IS SINGLE SOURCE OF TRUTH
 *    - During editing, the DOM is authoritative
 *    - JavaScript state is DERIVED from DOM, never authoritative
 *    - No parallel document/block model exists during live editing
 * 
 * 2. STRUCTURAL CHANGES ARE ENTER-AUTHORITATIVE
 *    - Structural block changes (headings, lists, blockquotes) occur ONLY on
 *      Enter keydown events
 *    - input events may change text content but MUST NOT change block structure
 *    - This ensures deterministic behavior and prevents race conditions
 * 
 * 3. SELECTION/RANGE ARE VOLATILE
 *    - Selection and Range objects become stale after any DOM mutation
 *    - They must be re-read immediately before use, never cached across
 *      DOM changes
 *    - Early capture and reuse causes incorrect cursor positions
 * 
 * 4. NORMALIZATION VS COMPLETION
 *    - Normalization (block type conversion) never creates sibling blocks
 *    - Normalization updates focusedBlock and blockType in place
 *    - Enter completion always creates sibling blocks (new paragraphs/list items)
 *    - These are separate phases that must not be conflated
 * 
 * 5. ENTER COMPLETION IS MANDATORY
 *    - Every Enter keypress must result in exactly one structural change
 *    - Normalization must NOT return early or consume the Enter action
 *    - Enter completion logic always runs after normalization
 *    - Early returns after normalization are forbidden
 * 
 * 6. NO STRUCTURAL CONVERSION OUTSIDE handleEnterKey()
 *    - checkAutoConversion() is a no-op (structural conversion removed)
 *    - All structural conversion happens in handleEnterKey() only
 *    - This prevents race conditions and empty blocks during typing
 * 
 * ============================================================================
 */

class CreatePost {
  constructor(app, mod, container = "") {
    this.app = app;
    this.mod = mod;
    this.container = container;
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
   * Initialize document from draft or create empty document
   * Uses temporary document model only for initial markdown → DOM conversion
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

    // Parse markdown → temporary document (only for initial render)
    const tempDocument = markdown ? parseMarkdownToDocument(markdown) : { blocks: [{ type: 'paragraph', id: generateBlockId(0), text: '' }] };
    
    // Render document to editor (one-time conversion from markdown to DOM)
    renderDocument(tempDocument, editor, {
      contentEditable: true
    });
    
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
      
      // Check if there's any existing content (read from DOM)
      const hasTitle = titleInput && titleInput.value.trim().length > 0;
      const hasBodyContent = editor && Array.from(editor.querySelectorAll('[data-block-id]')).some(blockEl => {
        const blockType = blockEl.getAttribute('data-block-type');
        if (blockType === 'paragraph' || blockType === 'heading' || blockType === 'list-item' || blockType === 'blockquote') {
          const text = (blockEl.textContent || '').replace(/\u200B/g, '').trim();
          return text.length > 0;
        }
        if (blockType === 'image') {
          return true;
        }
        if (blockType === 'rawhtml') {
          return (blockEl.innerHTML || '').trim().length > 0;
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
   * Serialize DOM directly to markdown
   * DOM is the single source of truth during editing
   */
  serializeDOMToMarkdown() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return '';

    const markdownLines = [];
    const blockElements = Array.from(editor.querySelectorAll('[data-block-id]'));

    for (let i = 0; i < blockElements.length; i++) {
      const blockEl = blockElements[i];
      const blockType = blockEl.getAttribute('data-block-type');

      // Add blank line between blocks (except before first block)
      if (i > 0) {
        markdownLines.push('');
      }

      switch (blockType) {
        case 'heading':
          const level = parseInt(blockEl.tagName.charAt(1)) || 1;
          const headingText = (blockEl.textContent || '').replace(/\u200B/g, '').trim();
          const headingPrefix = '#'.repeat(level);
          markdownLines.push(`${headingPrefix} ${headingText}`);
          break;

        case 'image':
          const img = blockEl.querySelector('img');
          const captionEl = blockEl.querySelector('.stack-image-caption');
          const alt = captionEl ? captionEl.textContent : '';
          const src = img ? img.src : '';
          markdownLines.push(`![${alt}](${src})`);
          break;

        case 'rawhtml':
          const htmlContent = blockEl.innerHTML || '';
          markdownLines.push(htmlContent);
          break;

        case 'paragraph':
        case 'list-item':
        case 'blockquote':
        default:
          // Paragraph, list-item, and blockquote are plain text
          const text = (blockEl.textContent || '').replace(/\u200B/g, '').trim();
          if (text) {
            markdownLines.push(text);
          }
          break;
      }
    }

    return markdownLines.join('\n');
  }

  /**
   * Check if editor has meaningful content and update placeholder visibility
   * Reads directly from DOM (single source of truth)
   */
  updatePlaceholderVisibility() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    // Check if there's any meaningful content (read from DOM)
    const blockElements = editor.querySelectorAll('[data-block-id]');
    let hasContent = false;

    for (const blockEl of blockElements) {
      const blockType = blockEl.getAttribute('data-block-type');
      
      if (blockType === 'paragraph' || blockType === 'heading' || blockType === 'list-item' || blockType === 'blockquote') {
        const text = (blockEl.textContent || '').replace(/\u200B/g, '').trim();
        if (text.length > 0) {
          hasContent = true;
          break;
        }
      } else if (blockType === 'image') {
        hasContent = true; // Images count as content
        break;
      } else if (blockType === 'rawhtml') {
        const html = (blockEl.innerHTML || '').trim();
        if (html.length > 0) {
          hasContent = true;
          break;
        }
      }
    }

    // Toggle placeholder class
    if (hasContent) {
      editor.classList.remove('stack-editor-empty');
    } else {
      editor.classList.add('stack-editor-empty');
    }
  }

  /**
   * Schedule debounced serialization
   * Serializes directly from DOM (single source of truth)
   */
  scheduleSerialization() {
    if (this.serializeTimeout) {
      clearTimeout(this.serializeTimeout);
    }

    // Update state to "saving"
    this.updateSaveState('saving');

    this.serializeTimeout = setTimeout(() => {
      const markdown = this.serializeDOMToMarkdown();
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
    const editor = document.querySelector('#stack-post-body-editor');
    let hasContent = false;
    if (editor) {
      const blockElements = editor.querySelectorAll('[data-block-id]');
      for (const blockEl of blockElements) {
        const blockType = blockEl.getAttribute('data-block-type');
        if (blockType === 'paragraph' || blockType === 'heading' || blockType === 'list-item' || blockType === 'blockquote') {
          const text = (blockEl.textContent || '').replace(/\u200B/g, '').trim();
          if (text.length > 0) {
            hasContent = true;
            break;
          }
        } else if (blockType === 'image') {
          hasContent = true;
          break;
        } else if (blockType === 'rawhtml') {
          const html = (blockEl.innerHTML || '').trim();
          if (html.length > 0) {
            hasContent = true;
            break;
          }
        }
      }
    }

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
   * B1: Block identity is a type system - ONLY editable leaf nodes may have data-block-id
   * Returns only elements with data-block-id (blocks), never structural containers like <ul>
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
   * Get block count from DOM (replaces this.document.blocks.length)
   * B1: Block identity - counts ONLY elements with data-block-id (true blocks)
   * Structural containers like <ul> are never counted
   */
  getBlockCount() {
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return 0;
    return editor.querySelectorAll('[data-block-id]').length;
  }

  /**
   * A2: data-block-index removed - order is derived from DOM position only
   * B4: Adjacency logic must be DOM-safe - never rely on cached indices
   */

  /**
   * Get text offset from selection within a block
   */
  /**
   * Get text offset from selection within a block.
   * 
   * STRUCTURAL CONSTRAINT: This function is ONLY for paragraph splitting.
   * Using it elsewhere (normalization, heading/list/blockquote Enter) is a structural violation.
   * 
   * Cursor offset logic exists ONLY in paragraph Enter completion.
   * All other Enter paths (heading, list, blockquote) must NOT use cursor offsets.
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
   * 
   * DOM-AUTHORITATIVE INVARIANT:
   * - This function operates ONLY on DOM elements (focusedBlock, DOM nodes)
   * - NO document/block object model exists or should be referenced
   * - The ONLY allowed state variables are:
   *   * focusedBlock (DOM Element node)
   *   * blockType (string from DOM attribute or tagName)
   *   * selection / range (Selection API objects)
   * - Variables like `block`, `block.text`, `block.type` must NEVER be introduced
   * - All block information must come from DOM inspection (attributes, textContent, tagName)
   */
  handleEnterKey(e) {
    // ========================================================================
    // EDITOR CORE INFRASTRUCTURE
    // ========================================================================
    // This function is editor core infrastructure.
    // Changes must preserve all stated invariants.
    // Do not add recovery logic, heuristics, or alternative code paths.
    // 
    // This function implements a deterministic Enter key handling system with
    // strict phase separation: Intent Capture → Normalization → Enter Completion.
    // All invariants, illegal states, and structural rules documented within
    // this function must be preserved. Violations are bugs, not edge cases.
    // ========================================================================
    
    // ========================================================================
    // ATOMIC EVENT CLAIMING
    // ========================================================================
    // Enter is claimed atomically at the top of the handler to prevent race conditions.
    // Once handleEnterKey() runs, the browser must NEVER process the Enter key.
    // Normalization and completion run under full event control, ensuring deterministic behavior.
    // 
    // INVARIANT: Enter prevention is centralized here and must not be reintroduced conditionally.
    // No branch in this function "decides" whether Enter is prevented - it is always prevented.
    e.preventDefault();

    // ========================================================================
    // PHASE 1: INTENT CAPTURE
    // ========================================================================
    // Capture current editor state and user intent before any mutations.
    // This phase is read-only and establishes the context for all subsequent phases.
    
    // DOM-AUTHORITATIVE: Get focused block element (DOM node only)
    let focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    // Postcondition enforcement: track structural mutations
    let didMutateStructure = false;

    // ========================================================================
    // BLOCK TYPE INFERENCE RULES (NON-NEGOTIABLE)
    // ========================================================================
    // Block type is defined EXCLUSIVELY by the 'data-block-type' DOM attribute.
    // Valid values: 'paragraph', 'heading', 'list-item', 'blockquote', 'image', 'rawhtml'
    // 
    // INVARIANT: Block type must NEVER be inferred from:
    //   - Cursor position or offsets
    //   - Text content patterns (markdown markers, etc.)
    //   - Heuristic analysis
    //   - Tag names alone (e.g., <h1>, <li>, <p>)
    //   - CSS classes or other attributes
    // 
    // The 'data-block-type' attribute is the SINGLE SOURCE OF TRUTH for block type.
    // All Enter behavior reasoning must reference this attribute only.
    // DOM-AUTHORITATIVE: Get block type from DOM attribute (string only)
    let blockType = focusedBlock.getAttribute('data-block-type');

    // INVARIANT: blockType must be non-null during Enter handling.
    // If data-block-type is missing, infer ONCE from tagName and set the attribute.
    // This is a one-time fix for blocks that lack the attribute; after this, blockType is authoritative.
    if (blockType === null) {
      const tagName = focusedBlock.tagName.toLowerCase();
      if (tagName === 'p') {
        blockType = 'paragraph';
      } else if (tagName.match(/^h[1-6]$/)) {
        blockType = 'heading';
      } else if (tagName === 'li') {
        blockType = 'list-item';
      } else if (tagName === 'blockquote') {
        blockType = 'blockquote';
      } else if (tagName === 'figure' || tagName === 'img') {
        blockType = 'image';
      } else {
        blockType = 'paragraph'; // Default fallback
      }
      focusedBlock.setAttribute('data-block-type', blockType);
    }

    // CRITICAL INVARIANT: Cursor offset is captured ONCE before any DOM mutations.
    // This offset is VALID ONLY for paragraph-to-paragraph splitting (no normalization).
    // If blockType changes during normalization, this offset becomes INVALID and must be discarded.
    // Normalization ignores cursor position and uses the entire line.
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const originalCursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
    const originalBlockText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
    const originalBlockType = blockType; // Track original block type to detect normalization
    
    // This offset is used ONLY in paragraph-to-paragraph splitting (Enter completion for paragraphs).
    // If blockType changed during normalization, originalCursorOffset is INVALID and must not be used.
    // Normalization does NOT use cursor offsets - it is purely structural.

    // ========================================================================
    // PHASE 2: BLOCK NORMALIZATION
    // ========================================================================
    // B2: Normalization vs Completion separation
    // Normalization: Detects intent only. MUST NOT read Selection/Range, place cursor, or decide grouping.
    // Convert block types (paragraph → heading, paragraph → list) based on
    // markdown markers. This phase normalizes structure but does NOT create
    // sibling blocks. Normalization updates focusedBlock and blockType in place.
    // 
    // INVARIANT: Normalization never creates siblings, never returns early.
    // INVARIANT: Enter completion always runs after normalization.
    // INVARIANT: Normalization must not move the cursor. Cursor placement occurs
    //            during Enter completion.
    // INVARIANT: Normalization is purely structural - cursor position is irrelevant.
    //            Normalization removes markdown markers and uses the ENTIRE remaining
    //            line. Cursor offset logic exists ONLY in paragraph splitting.
    // 
    // ILLEGAL: Cursor placement in normalization phase
    // - Normalization MUST NEVER place or move the cursor
    // - If cursor is placed here, this is a structural violation
    // - console.warn: "Cursor placement in normalization phase - structural violation"
    // 
    // ILLEGAL: Cursor offset usage in normalization phase
    // - Normalization MUST NEVER reference cursor offsets or Selection
    // - If offsets are used here, this is a structural violation
    // - console.warn: "Cursor offset usage in normalization phase - structural violation"

    // Check for markdown heading conversion: "# ", "## ", "### " at start of paragraph
    // Normalization is PURELY STRUCTURAL - no Selection/Range reading allowed
    // PRECONDITION: Block's visible content (after removing ZWSP) must START WITH the trigger
    if (blockType === 'paragraph') {
      const blockText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
      const trimmedText = blockText.trimStart();
      
      let headingLevel = null;
      if (trimmedText.startsWith('### ')) {
        headingLevel = 3;
      } else if (trimmedText.startsWith('## ')) {
        headingLevel = 2;
      } else if (trimmedText.startsWith('# ')) {
        headingLevel = 1;
      }
      
      if (headingLevel) {
        const leadingWhitespace = blockText.length - trimmedText.length;
        const markerEndOffset = leadingWhitespace + headingLevel + 1;
        const headingText = blockText.substring(markerEndOffset);
        
        const newHeading = document.createElement(`h${headingLevel}`);
        Array.from(focusedBlock.attributes).forEach(attr => {
          if (attr.name !== 'data-block-type') {
            newHeading.setAttribute(attr.name, attr.value);
          }
        });
        newHeading.setAttribute('data-block-type', 'heading');
        newHeading.contentEditable = 'true';
        newHeading.textContent = headingText;
        
        focusedBlock.parentNode.replaceChild(newHeading, focusedBlock);
        focusedBlock = newHeading;
        blockType = 'heading';
      }

      // Check for markdown list creation: "* " or "- " at start of paragraph
      // Normalization is PURELY STRUCTURAL - no Selection/Range reading allowed
      // PRECONDITION: Block's visible content (after removing ZWSP) must START WITH the trigger
      // Note: List normalization was previously restricted to trigger-only blocks (like headers were),
      // but now allows text after the trigger to match header normalization behavior.
      const listBlockText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
      const listTrimmedText = listBlockText.trimStart();
      
      if (listTrimmedText.startsWith('* ') || listTrimmedText.startsWith('- ')) {
        // Invariant 7: Normalization ONLY detects list intent, does NOT create structure.
        // Convert paragraph to <li> only. <ul> creation and grouping happen in Enter completion.
        const listLeadingWhitespace = listBlockText.length - listTrimmedText.length;
        const listMarkerEndOffset = listLeadingWhitespace + 2;
        const itemText = listBlockText.substring(listMarkerEndOffset);
        
        // A1: Persist marker explicitly - C2: No clever inference
        const marker = listTrimmedText.startsWith('* ') ? '* ' : '- ';
        
        // Convert paragraph to <li> (this is converting current block, not creating siblings)
        const liElement = document.createElement('li');
        const liId = generateBlockId(this.getBlockCount());
        liElement.setAttribute('data-block-id', liId);
        liElement.setAttribute('data-block-type', 'list-item');
        liElement.setAttribute('data-list-marker', marker);
        liElement.contentEditable = 'true';
        liElement.textContent = itemText;
        
        // Replace paragraph with <li> (no <ul> wrapper yet)
        focusedBlock.parentNode.replaceChild(liElement, focusedBlock);
        
        // Update focusedBlock and blockType for Enter completion
        focusedBlock = liElement;
        blockType = 'list-item';
      }
    }

    // ========================================================================
    // PHASE 3: ENTER COMPLETION
    // ========================================================================
    // Create the next block (sibling) based on current block type and state.
    // This phase always runs after normalization (if any occurred).
    // 
    // STRUCTURAL SEPARATION:
    // - Paragraph Enter splits text and requires cursor offset logic
    // - Heading/List/Blockquote Enter exits the block and does NOT split text
    // 
    // INVARIANT: Every Enter keypress results in exactly one structural change.
    // INVARIANT: Enter completion always creates sibling blocks.
    // INVARIANT: Enter completion is the sole authority for cursor placement.
    // NOTE: Early returns ARE allowed in this phase (after completion is done),
    //       but NOT in normalization phase (which must always proceed to completion).
    // 
    // ========================================================================
    // ILLEGAL STATES (STRUCTURAL VIOLATIONS, NOT EDGE CASES)
    // ========================================================================
    // The following states MUST NEVER occur. If they do, they are bugs, not
    // situations to "handle" with recovery logic:
    // 
    // 1. Enter completion without creating a new block
    //    - Every Enter completion MUST create exactly one new block
    //    - If no block is created, this is a structural violation
    //    - console.warn: "Enter completion failed to create new block - structural violation"
    // 
    // 2. Cursor placement outside Enter completion
    //    - Cursor placement MUST ONLY occur in Enter completion phase
    //    - Normalization, event handlers, or other code MUST NOT place cursor
    //    - If cursor is placed elsewhere, this is a structural violation
    //    - console.warn: "Cursor placed outside Enter completion - structural violation"
    // 
    // 3. Blocks without a text node after Enter
    //    - Every block created by Enter completion MUST have a text node
    //    - textContent='' creates a text node, which is sufficient
    //    - If a block lacks a text node, this is a structural violation
    //    - console.warn: "Block created without text node - structural violation"
    // 
    // 4. Selection recovery during Enter handling
    //    - Enter handling MUST NOT attempt to "recover" from stale selection
    //    - Selection is captured once in Phase 1, then cursor is placed deterministically
    //    - If selection is recomputed or "recovered", this is a structural violation
    //    - console.warn: "Selection recovery attempted during Enter - structural violation"

    // ========================================================================
    // LIST ITEM ENTER: Exit list (no text splitting)
    // ========================================================================
    // Heading/List/Blockquote Enter exits the block and does NOT split text.
    // List item Enter exits the list and creates a paragraph below.
    // NO cursor offset logic - this is unconditional block exit.
    // 
    // ILLEGAL: Offset logic is illegal here. Cursor offset logic exists ONLY in paragraph splitting.
    // Using getTextOffsetInBlock() or originalCursorOffset here is a structural violation.
    // 
    // L1: Only <li> elements are blocks. Enter completion for list items.
    // Invariant 8: Enter completion is the ONLY place where <ul> is created and <li> is appended.
    if (blockType === 'list-item' && focusedBlock.tagName === 'LI') {
      // Invariant 8: Ensure <li> is wrapped in <ul> (may not be if just normalized)
      let ulElement = focusedBlock.parentNode;
      if (ulElement.tagName !== 'UL') {
        // <li> is not in <ul> yet - create <ul> and wrap it
        // B4: Adjacency logic must be DOM-safe - skip non-element nodes, never scan more than one block
        const editor = ulElement;
        let prevBlock = focusedBlock.previousSibling;
        while (prevBlock && prevBlock.nodeType === Node.ELEMENT_NODE && !prevBlock.hasAttribute('data-block-id')) {
          prevBlock = prevBlock.previousSibling;
        }
        
        if (prevBlock && prevBlock.tagName === 'LI' && prevBlock.getAttribute('data-block-type') === 'list-item') {
          // B4: Adjacency-based grouping - immediately previous block is <li>
          ulElement = prevBlock.parentNode;
          ulElement.appendChild(focusedBlock);
        } else {
          // B1: Create new <ul> (no data-block-id or data-block-type) - structural container only
          ulElement = document.createElement('ul');
          editor.insertBefore(ulElement, focusedBlock);
          ulElement.appendChild(focusedBlock);
        }
      }
      
      const listItemText = (focusedBlock.textContent || '').replace(/\u200B/g, '').trim();
      const isEmpty = listItemText.length === 0;
      
      if (isEmpty) {
        // L3: Empty list item exits the list - remove empty <li> and create paragraph below
        const ulElement = focusedBlock.parentNode;
        const editor = ulElement.parentNode;
        const ulNextSibling = ulElement.nextSibling;
        const willRemoveUl = ulElement.children.length === 1;
        
        // Remove the empty <li>
        ulElement.removeChild(focusedBlock);
        
        // If <ul> is now empty, remove it
        if (willRemoveUl) {
          ulElement.parentNode.removeChild(ulElement);
        }
        
        // Create new paragraph below
        const newBlockElement = document.createElement('p');
        const newBlockId = generateBlockId(this.getBlockCount());
        newBlockElement.setAttribute('data-block-id', newBlockId);
        newBlockElement.setAttribute('data-block-type', 'paragraph');
        newBlockElement.contentEditable = 'true';
        const caretAnchor = document.createTextNode('\u200B');
        newBlockElement.appendChild(caretAnchor);
        
        // Insert after the list (or where list was if removed)
        if (willRemoveUl) {
          // <ul> was removed - insert where it was
          if (ulNextSibling) {
            editor.insertBefore(newBlockElement, ulNextSibling);
        } else {
            editor.appendChild(newBlockElement);
          }
        } else {
          // <ul> still exists - insert after it
          if (ulElement.nextSibling) {
            editor.insertBefore(newBlockElement, ulElement.nextSibling);
          } else {
            editor.appendChild(newBlockElement);
          }
        }
        
        this.updatePlaceholderVisibility();
        
        const newRange = document.createRange();
        const newSelection = window.getSelection();
        newRange.setStart(caretAnchor, 0);
        newRange.setEnd(caretAnchor, 0);
        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
        newBlockElement.focus();
        this.autoScrollToCaret();
        didMutateStructure = true;
      return;
      } else {
        // L4: Non-empty list item continues the list - create new <li> with same marker
        const ulElement = focusedBlock.parentNode;
        const editor = ulElement.parentNode;
        
        // A1: Read marker from stored data, NOT from textContent - C2: No clever inference
        const marker = focusedBlock.getAttribute('data-list-marker') || '- ';
        
        // Create new <li> element
        const newLiElement = document.createElement('li');
        const newLiId = generateBlockId(this.getBlockCount());
        newLiElement.setAttribute('data-block-id', newLiId);
        newLiElement.setAttribute('data-block-type', 'list-item');
        newLiElement.setAttribute('data-list-marker', marker);
        newLiElement.contentEditable = 'true';
        
        // I2: <li>.textContent MUST NEVER include the marker - marker is in data-list-marker only
        // I3: Visual markers rendered via CSS, not textContent
        const caretAnchor = document.createTextNode('\u200B');
        newLiElement.appendChild(caretAnchor);
        
        // Append to existing <ul>
        ulElement.appendChild(newLiElement);
        
        this.updatePlaceholderVisibility();
        
        const newRange = document.createRange();
        const newSelection = window.getSelection();
        newRange.setStart(caretAnchor, 0);
        newRange.setEnd(caretAnchor, 0);
        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
        newLiElement.focus();
        this.autoScrollToCaret();
        didMutateStructure = true;
        return;
      }
    }

    // ========================================================================
    // EMPTY BLOCK EXIT: Exit block when empty (no text splitting)
    // ========================================================================
    // Heading/List/Blockquote Enter exits the block and does NOT split text.
    // When the block is empty, convert it to paragraph and create new paragraph below.
    // NO cursor offset logic - this is unconditional block exit.
    // 
    // ILLEGAL: Offset logic is illegal here. Cursor offset logic exists ONLY in paragraph splitting.
    // Using getTextOffsetInBlock() or originalCursorOffset here is a structural violation.
    const blockText = (focusedBlock.textContent || '').replace(/\u200B/g, '').trim();
    const isBlockFormatted = blockType === 'list-item' || blockType === 'blockquote' || blockType === 'heading';
    const isEmpty = blockText.length === 0;

    if (isBlockFormatted && isEmpty) {
      // EXIT BLOCK: Remove formatting and create normal paragraph
      // e.preventDefault() already called at function start
      // NO cursor offset logic - this is unconditional block exit
      // ILLEGAL: Offset logic is illegal here

      // Convert current block to paragraph IN PLACE
      focusedBlock.setAttribute('data-block-type', 'paragraph');
      focusedBlock.classList.remove('stack-list-item', 'stack-blockquote');
      focusedBlock.textContent = '';
      const emptyTextNode = document.createTextNode('\u200B');
      focusedBlock.appendChild(emptyTextNode);

      // Create new paragraph block in DOM
      // ILLEGAL: Enter completion MUST create a new block. If no block is created here, this is a bug.
      const editor = focusedBlock.parentNode;
      const newBlockElement = document.createElement('p');
      const newBlockId = generateBlockId(this.getBlockCount());
      newBlockElement.setAttribute('data-block-id', newBlockId);
      newBlockElement.setAttribute('data-block-type', 'paragraph');
      newBlockElement.contentEditable = 'true';
      // ILLEGAL: Blocks MUST have a text node. ENTER completion must ensure new blocks contain a caret anchor.
      // Empty block: ensure caret anchor exists for stable cursor placement
      const caretAnchor = document.createTextNode('\u200B');
      newBlockElement.appendChild(caretAnchor);
      
      // Insert after current block
      if (focusedBlock.nextSibling) {
        editor.insertBefore(newBlockElement, focusedBlock.nextSibling);
      } else {
        editor.appendChild(newBlockElement);
      }

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

      // Enter completion is the sole authority for cursor placement.
      // ILLEGAL: Cursor placement MUST ONLY occur in Enter completion. If placed elsewhere, this is a bug.
      // Cursor placement is deterministic: always at offset 0 of the text node.
      // ENTER completion ensures the editor is in a stable state with exactly one active block
      // and a valid collapsed selection inside that block.
      // ILLEGAL: Selection recovery is forbidden. Selection is captured once, cursor is placed deterministically.
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      newRange.setStart(caretAnchor, 0);
      newRange.setEnd(caretAnchor, 0);
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      newBlockElement.focus();
      this.autoScrollToCaret();
      didMutateStructure = true;
      return;
    }

    // ========================================================================
    // HEADING/BLOCKQUOTE ENTER: Exit block (no text splitting)
    // ========================================================================
    // Heading/List/Blockquote Enter exits the block and does NOT split text.
    // This path does NOT use cursor offset logic - it unconditionally exits the block
    // and creates a new paragraph below, leaving the current block unchanged.
    // (List items are handled above with special logic for continuing/exiting lists)
    // (Empty blocks are handled above - they exit the block format)
    // Enter completion is the sole authority for cursor placement.
    // 
    // ILLEGAL: Offset logic is illegal here. Cursor offset logic exists ONLY in paragraph splitting.
    // Using getTextOffsetInBlock() or originalCursorOffset here is a structural violation.
    if (blockType === 'heading' || blockType === 'blockquote') {
      // Exit heading/blockquote: leave current block unchanged, create new paragraph below
      // e.preventDefault() already called at function start
      // NO cursor offset logic - this is unconditional block exit
      // ILLEGAL: Offset logic is illegal here
      
      // Create new paragraph block in DOM
      // (List items are handled earlier and never reach this code path)
      // ILLEGAL: Enter completion MUST create a new block. If no block is created here, this is a bug.
      const editor = focusedBlock.parentNode;
      const newBlockElement = document.createElement('p');
        newBlockElement.setAttribute('data-block-type', 'paragraph');
      
      const newBlockId = generateBlockId(this.getBlockCount());
      newBlockElement.setAttribute('data-block-id', newBlockId);
      newBlockElement.contentEditable = 'true';
      // ILLEGAL: Blocks MUST have a text node. ENTER completion must ensure new blocks contain a caret anchor.
      // Empty block: ensure caret anchor exists for stable cursor placement
      const caretAnchor = document.createTextNode('\u200B');
      newBlockElement.appendChild(caretAnchor);
      
      // Insert after current block
      if (focusedBlock.nextSibling) {
        editor.insertBefore(newBlockElement, focusedBlock.nextSibling);
      } else {
        editor.appendChild(newBlockElement);
      }

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

      // Enter completion is the sole authority for cursor placement.
      // ILLEGAL: Cursor placement MUST ONLY occur in Enter completion. If placed elsewhere, this is a bug.
      // Cursor placement is deterministic: always at offset 0 of the text node.
      // ENTER completion ensures the editor is in a stable state with exactly one active block
      // and a valid collapsed selection inside that block.
      // ILLEGAL: Selection recovery is forbidden. Selection is captured once, cursor is placed deterministically.
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      newRange.setStart(caretAnchor, 0);
      newRange.setEnd(caretAnchor, 0);
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
      newBlockElement.focus();
      this.autoScrollToCaret();
      didMutateStructure = true;
      return;
    }

    // For other block types (image, rawhtml), return early
    // Note: e.preventDefault() was already called at function start, so default behavior is prevented
    if (blockType !== 'paragraph') {
      return;
    }

    // ========================================================================
    // PARAGRAPH ENTER: Split text (requires cursor offset logic)
    // ========================================================================
    // Paragraph Enter splits text and requires cursor offset logic.
    // This is the ONLY Enter path that uses cursor offset calculations.
    // MANDATORY FALLBACK: This is the mandatory fallback for normal paragraph splitting.
    // If this code does not run, Enter is broken.
    // This ensures that EVERY Enter keypress in a paragraph results in exactly one structural action.
    // e.preventDefault() already called at function start

    const currentText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
    
    // Cursor offset logic is ONLY used for paragraph-to-paragraph splitting.
    // If blockType changed during normalization, originalCursorOffset is INVALID.
    // Only use originalCursorOffset if we're still a paragraph (no normalization occurred).
    let cursorOffset;
    if (blockType === 'paragraph' && originalBlockType === 'paragraph') {
      // Paragraph-to-paragraph splitting: use pre-normalization offset
      cursorOffset = originalCursorOffset;
    } else {
      // BlockType changed during normalization: offset is INVALID, recompute from live selection
      const currentSelection = window.getSelection();
      if (!currentSelection.rangeCount) {
        throw new Error('No selection after normalization - structural violation');
      }
      cursorOffset = this.getTextOffsetInBlock(focusedBlock, currentSelection);
    }
    
    // Ensure cursor offset is within bounds
    if (cursorOffset < 0) cursorOffset = 0;
    if (cursorOffset > currentText.length) cursorOffset = currentText.length;
    
    // Split text into before and after cursor
    const beforeText = currentText.substring(0, cursorOffset);
    const afterText = currentText.substring(cursorOffset);

    // Update current block text in DOM
    focusedBlock.textContent = beforeText;

    // Create new paragraph block in DOM
    // ILLEGAL: Enter completion MUST create a new block. If no block is created here, this is a bug.
    const editor = focusedBlock.parentNode;
    const newBlockElement = document.createElement('p');
    const newBlockId = generateBlockId(this.getBlockCount());
    newBlockElement.setAttribute('data-block-id', newBlockId);
    newBlockElement.setAttribute('data-block-type', 'paragraph');
    newBlockElement.contentEditable = 'true';
    // ILLEGAL: Blocks MUST have a text node. textContent creates one. If missing, this is a bug.
    // ENTER completion must ensure new blocks contain a caret anchor for stable cursor placement.
    if (afterText.length === 0) {
      // Empty block: ensure caret anchor exists for cursor placement
      const caretAnchor = document.createTextNode('\u200B');
      newBlockElement.appendChild(caretAnchor);
    } else {
    newBlockElement.textContent = afterText;
    }
    
    // Insert after current block
    if (focusedBlock.nextSibling) {
      editor.insertBefore(newBlockElement, focusedBlock.nextSibling);
    } else {
      editor.appendChild(newBlockElement);
    }
    didMutateStructure = true;

    // Update placeholder visibility
    this.updatePlaceholderVisibility();

    // Enter completion is the sole authority for cursor placement.
    // ILLEGAL: Cursor placement MUST ONLY occur in Enter completion. If placed elsewhere, this is a bug.
    // Cursor placement is deterministic: always at offset 0 of the text node.
    // ENTER completion ensures the editor is in a stable state with exactly one active block
    // and a valid collapsed selection inside that block.
    // ILLEGAL: Selection recovery is forbidden. Selection is captured once, cursor is placed deterministically.
    const newRange = document.createRange();
    const newSelection = window.getSelection();
    const textNode = newBlockElement.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('Enter completion created block without text node - structural violation');
    }
        newRange.setStart(textNode, 0);
        newRange.setEnd(textNode, 0);
    newSelection.removeAllRanges();
    newSelection.addRange(newRange);
    newBlockElement.focus();
    this.autoScrollToCaret();
    
    // Postcondition enforcement: every Enter must result in exactly one structural mutation
    if (!didMutateStructure) {
      throw new Error('Enter key violated postcondition: no structural mutation occurred');
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

    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockType = focusedBlock.getAttribute('data-block-type');
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    // Don't allow caret to enter image blocks - move to previous block
    if (blockType === 'image') {
      e.preventDefault();
      
      // A2: Order derived from DOM position, not cached index
        const editor = focusedBlock.parentNode;
        const allBlocks = Array.from(editor.querySelectorAll('[data-block-id]'));
      const blockIndex = allBlocks.indexOf(focusedBlock);
      // Move caret to previous block if it exists
      if (blockIndex > 0) {
        const prevBlockEl = allBlocks[blockIndex - 1];
        if (prevBlockEl) {
          setTimeout(() => {
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
        
        // Restore cursor synchronously
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
        
        // Restore cursor synchronously
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
    // A2: Order derived from DOM position, not cached index
    if (blockType === 'paragraph' && isAtStart) {
        const editor = focusedBlock.parentNode;
        const allBlocks = Array.from(editor.querySelectorAll('[data-block-id]'));
      const blockIndex = allBlocks.indexOf(focusedBlock);
      if (blockIndex > 0) {
        const prevBlockEl = allBlocks[blockIndex - 1];
        
        // If previous block is an image, delete it from DOM
        if (prevBlockEl && prevBlockEl.getAttribute('data-block-type') === 'image') {
          e.preventDefault();
          if (prevBlockEl) {
            prevBlockEl.remove();
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
        
        // A3: DOM-authoritative - check previous block from DOM, not legacy model
        if (prevBlockEl && prevBlockEl.getAttribute('data-block-type') === 'paragraph') {
          e.preventDefault();
          
            const prevText = (prevBlockEl.textContent || '').replace(/\u200B/g, '');
            const currText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
            
            // Merge in DOM
            prevBlockEl.textContent = prevText + currText;
            focusedBlock.remove();
            
            // Restore cursor synchronously
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

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    const blockType = focusedBlock.getAttribute('data-block-type');

    // If cursor is at the end of a paragraph block
    if (blockType === 'paragraph' && range.collapsed) {
      const cursorOffset = this.getTextOffsetInBlock(focusedBlock, selection);
      const blockText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
      const isAtEnd = cursorOffset >= blockText.length;
      
      if (isAtEnd) {
        e.preventDefault();

        const editor = focusedBlock.parentNode;
        const allBlocks = Array.from(editor.querySelectorAll('[data-block-id]'));
        // A2: Order derived from DOM position, not cached index
        const blockIndex = allBlocks.indexOf(focusedBlock);
      const nextBlockIndex = blockIndex + 1;
        if (nextBlockIndex >= allBlocks.length) {
        return;
      }

        const nextBlockEl = allBlocks[nextBlockIndex];
        if (!nextBlockEl) return;

        const nextBlockType = nextBlockEl.getAttribute('data-block-type');
        if (nextBlockType === 'image' || nextBlockType === 'rawhtml') {
          // Delete the next block from DOM
          nextBlockEl.remove();
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
      } else if (nextBlockType === 'paragraph' || nextBlockType === 'heading') {
        // A3: DOM-authoritative - merge next block into current in DOM
          const currText = (focusedBlock.textContent || '').replace(/\u200B/g, '');
          const nextText = (nextBlockEl.textContent || '').replace(/\u200B/g, '');
          
          focusedBlock.textContent = currText + nextText;
          nextBlockEl.remove();
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
      this.updatePlaceholderVisibility();
      return;
    }
    // Allow default browser behavior for other cases
  }

  /**
   * Structural conversion is Enter-authoritative to ensure deterministic behavior.
   * No structural conversion occurs during input events to avoid race conditions,
   * empty blocks, stale selection, and cursor jumps.
   * 
   * All structural conversion (headings, lists, blockquotes) is handled in handleEnterKey() only.
   */
  checkAutoConversion(e) {
    // Structural conversion is handled on Enter only.
    // This function is kept as a placeholder for potential future non-structural conversions.
    return false;
  }

  /**
   * Handle input events - update document model
   * DOM is authoritative: always read from DOM to update state
   */
  handleEditorInput(e) {
    // Structural conversion is Enter-authoritative - no conversion during input events
    // checkAutoConversion() is now a no-op; all conversion happens in handleEnterKey()

    const focusedBlock = this.getFocusedBlock();
    if (!focusedBlock) return;

    // Schedule serialization (reads from DOM)
      this.scheduleSerialization();

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
        
        // A2: Order derived from DOM position (loop index), not cached index
        const blockIndex = i;
        
        // For paragraph blocks, check if we're over a line break area
        if (blockType === 'paragraph') {
          const splitPoint = this.findSplitPointInBlock(block, clientY);
          if (splitPoint) {
            return {
              position: 'split',
              element: block,
              index: blockIndex,
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
          // A2: Order derived from DOM position (loop index)
          const blockIndex = i;
          
          // Insert after the current block (in the gap)
          return { position: 'after', element: block, index: blockIndex + 1, splitBlock: null };
        }
      }
    }

    // After last block - use DOM position
    const lastBlock = blocks[blocks.length - 1];
    const lastIndex = blocks.length - 1;
    return { position: 'after', element: lastBlock, index: lastIndex + 1, splitBlock: null };
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
        // A2: Order derived from DOM position, not cached index
        insertIndex = this.getBlockCount();
      }
    }

    // Get editor reference
    const editor = document.querySelector('#stack-post-body-editor');
    if (!editor) return;

    // Validate insertIndex - clamp to valid range
    const blockCount = this.getBlockCount();
    if (insertIndex < 0) {
      insertIndex = blockCount;
    } else if (insertIndex > blockCount) {
      // If index is beyond document length, clamp to end
      insertIndex = blockCount;
    }

    // If we need to split a block, do it first in DOM
    if (needsBlockSplit && splitInfo && blockToSplitIndex >= 0 && blockToSplitIndex < blockCount) {
      const allBlocks = Array.from(editor.querySelectorAll('[data-block-id]'));
      const blockToSplitEl = allBlocks[blockToSplitIndex];
      if (blockToSplitEl && blockToSplitEl.getAttribute('data-block-type') === 'paragraph') {
        if (blockToSplitEl) {
        // Update the original block with text before the split
          blockToSplitEl.textContent = splitInfo.beforeText.trim();
          
          // Create a new paragraph block with text after the split in DOM
          const afterBlockEl = document.createElement('p');
          const afterBlockId = generateBlockId(this.getBlockCount());
          afterBlockEl.setAttribute('data-block-id', afterBlockId);
          afterBlockEl.setAttribute('data-block-type', 'paragraph');
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

    // Create image element in DOM
    const imageElement = document.createElement('figure');
    const imageBlockId = generateBlockId(this.getBlockCount());
    imageElement.setAttribute('data-block-id', imageBlockId);
    imageElement.setAttribute('data-block-type', 'image');
    imageElement.className = 'stack-image-block';
    imageElement.contentEditable = false;

    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.alt = file.name || '';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.margin = '0 auto';
    imageElement.appendChild(img);

    // Create new paragraph element in DOM
    const newParagraphElement = document.createElement('p');
    const newParagraphId = generateBlockId(this.getBlockCount() + 1);
    newParagraphElement.setAttribute('data-block-id', newParagraphId);
    newParagraphElement.setAttribute('data-block-type', 'paragraph');
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

    // Check if there's meaningful content (read from DOM)
    const editor = document.querySelector('#stack-post-body-editor');
    let hasContent = false;
    if (editor) {
      const blockElements = editor.querySelectorAll('[data-block-id]');
      for (const blockEl of blockElements) {
        const blockType = blockEl.getAttribute('data-block-type');
        if (blockType === 'paragraph' || blockType === 'heading' || blockType === 'list-item' || blockType === 'blockquote') {
          const text = (blockEl.textContent || '').replace(/\u200B/g, '').trim();
          if (text.length > 0) {
            hasContent = true;
            break;
          }
        } else if (blockType === 'image') {
          hasContent = true;
          break;
        } else if (blockType === 'rawhtml') {
          const html = (blockEl.innerHTML || '').trim();
          if (html.length > 0) {
            hasContent = true;
            break;
          }
        }
      }
    }

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
      if (!targetBlock && this.getBlockCount() === 0) {
        const { generateBlockId } = require('../post-document');
        const newParagraphEl = document.createElement('p');
        const newParagraphId = generateBlockId(0);
        newParagraphEl.setAttribute('data-block-id', newParagraphId);
        newParagraphEl.setAttribute('data-block-type', 'paragraph');
        newParagraphEl.contentEditable = 'true';
        newParagraphEl.textContent = '';
        newParagraphEl.appendChild(document.createTextNode('\u200B'));
        editor.appendChild(newParagraphEl);
        
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
    const content = editor ? this.serializeDOMToMarkdown() : '';

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

    // Update placeholder visibility
    this.updatePlaceholderVisibility();
    
    // If still no block, create a new empty paragraph in DOM
    if (!targetElement) {
        const { generateBlockId } = require('../post-document');
      const newParagraphEl = document.createElement('p');
      const newParagraphId = generateBlockId(this.getBlockCount());
      newParagraphEl.setAttribute('data-block-id', newParagraphId);
      newParagraphEl.setAttribute('data-block-type', 'paragraph');
      newParagraphEl.contentEditable = 'true';
      newParagraphEl.textContent = '';
      newParagraphEl.appendChild(document.createTextNode('\u200B'));
      editor.appendChild(newParagraphEl);
      targetElement = newParagraphEl;
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
          const markdown = this.serializeDOMToMarkdown();
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
    const content = this.serializeDOMToMarkdown();
    
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

