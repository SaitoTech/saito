const WorkspaceTemplate = require('./workspace.template');
const FieldOverlay = require('./overlays/field');
const SignerOverlay = require('./overlays/signer');
const PublishOverlay = require('./overlays/publish');
const {
  ACTION_TYPES,
  addUser,
  resolveSigner,
  renameUser,
  removeUser,
  addAction,
  actionById,
  removeAction,
  actionsOnPage,
  stripSignatures
} = require('../document');
const { addInitial, addSignature, verifiedEmail, verifiedMethods, verifyActionSignature } = require('../auth');

function walletKeys(app) {
  const raw = String(app.wallet?.publicKey || '').trim();
  const keys = [];
  if (raw) {
    keys.push(raw);
  }
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length >= 64 && app.crypto?.compressPublicKey) {
    const compressed = app.crypto.compressPublicKey(raw);
    if (compressed && !keys.includes(compressed)) {
      keys.push(compressed);
    }
  }
  return keys;
}

function canConfigure(app, record) {
  if (!record || record.finalized || !record.creator || !record.creatorProof?.signature) {
    return false;
  }
  return walletKeys(app).includes(String(record.creator).trim());
}

function canSignAction(app, action, user) {
  if (!action || !user) {
    return false;
  }
  if (action.type !== 'signature' && action.type !== 'initial') {
    return false;
  }
  if (verifyActionSignature(app, action, user)) {
    return false;
  }
  const theirs = String(user.publickey || '').trim();
  if (!theirs || !walletKeys(app).includes(theirs)) {
    return false;
  }
  return Boolean(verifiedEmail(app, user));
}

const MIN_DRAG = 12;
const CLICK_WIDTH = 0.26;
const CLICK_HEIGHT = 0.05;
const MIN_BOX_WIDTH = 0.08;
const MIN_BOX_HEIGHT = 0.03;
const ZOOM_MIN = 1;
const SIGNER_COLORS = ['#e85d04', '#1d7874', '#315a9b', '#9b2226', '#6a4c93', '#0a7ea4', '#bc6c25', '#2d6a4f'];
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.35;

class Workspace {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.page = 1;
    this.notice = '';
    this.placing = false;
    this.adding_signer = false;
    this.focus_name = false;
    this.draft = null;
    this.intent = null;
    this.arming = false;
    this.drag = null;
    this.resize = null;
    this.arrived = null;
    this.overlay = null;
    this.publish = new PublishOverlay(app, mod);
    this.listening = false;
    this.pending_scroll = false;
    this.scroll_field = null;
    this.suspend_scroll = false;
    this.zoom = ZOOM_MIN;
    this.reader_moved = false;
    this.reader_x = 16;
    this.reader_y = 16;
    this.reader_drag = null;
  }

  show() {
    this.page = 1;
    this.notice = '';
    this.placing = false;
    this.adding_signer = false;
    this.focus_name = false;
    this.draft = null;
    this.intent = null;
    this.arming = false;
    this.drag = null;
    this.resize = null;
    this.arrived = null;
    this.pending_scroll = false;
    this.scroll_field = null;
    this.zoom = ZOOM_MIN;
    this.reader_moved = false;
    this.reader_x = 16;
    this.reader_y = 16;
    this.render();
  }

  render() {
    const container = document.querySelector('.saito-container');
    const doc = this.mod.document;
    if (!container || !doc.document.pdf) {
      return;
    }

    container.classList.add('saitosign');

    let root = container.querySelector(':scope > .workspace');
    if (!root || root.dataset.src !== doc.document.url) {
      container.innerHTML = WorkspaceTemplate(this.view());
      root = container.querySelector(':scope > .workspace');
      root.dataset.src = doc.document.url;
      this.attachEvents(root);
    } else {
      this.update(root);
      return;
    }

    this.fitSheet(root);
    root.querySelector('.reader').innerHTML = WorkspaceTemplate.reader(this.view());
    this.loadPages(root);
    this.listen();
  }

  update(root) {
    const view = this.view();
    root.querySelector('.rail').innerHTML = WorkspaceTemplate.rail(view);
    this.paintActions(root, view);
    this.paintFields(root, view);

    if (this.focus_name) {
      root.querySelector('[data-signer-name]')?.focus();
      this.focus_name = false;
    }

    this.fitSheet(root);
    root.querySelector('.reader').innerHTML = WorkspaceTemplate.reader(this.view());
    this.loadPages(root);
    if (this.pending_scroll) {
      this.pending_scroll = false;
      const fieldId = this.scroll_field;
      this.scroll_field = null;
      if (fieldId) {
        this.scrollToField(root, fieldId);
      } else {
        this.scrollToPage(root, this.page);
      }
    }
  }

  attachEvents(root) {
    root.addEventListener('click', (event) => {
      if (this.suppress_click) {
        this.suppress_click = false;
        return;
      }

      const doc = this.mod.document;
      if (!doc) {
        return;
      }

      if (event.target.closest('[data-add-signer]')) {
        if (!canConfigure(this.app, doc)) return;
        this.adding_signer = true;
        this.focus_name = true;
        this.placing = false;
        this.update(root);
        return;
      }

      if (this.adding_signer && !event.target.closest('.add-signer')) {
        this.adding_signer = false;
        this.update(root);
        return;
      }

      const signer_row = event.target.closest('[data-open-signer]');
      if (signer_row) {
        this.openSigner(Number(signer_row.dataset.openSigner));
        return;
      }

      if (event.target.closest('[data-add-field]')) {
        if (!canConfigure(this.app, doc)) return;
        this.openNewAction(root);
        return;
      }

      const listed = event.target.closest('[data-open-field]');
      if (listed) {
        this.openExisting(actionById(doc, listed.dataset.openField), root);
        return;
      }

      const placed = event.target.closest('[data-field-id]');
      if (placed) {
        this.openExisting(actionById(doc, placed.dataset.fieldId), root);
        return;
      }

      if (event.target.closest('[data-page="prev"]')) {
        this.page = Math.max(1, this.page - 1);
        this.pending_scroll = true;
        this.update(root);
        return;
      }

      if (event.target.closest('[data-page="next"]')) {
        this.page = Math.min(doc.document.page_count, this.page + 1);
        this.pending_scroll = true;
        this.update(root);
        return;
      }

      const zoom = event.target.closest('[data-zoom]');
      if (zoom && !zoom.disabled) {
        this.changeZoom(zoom.dataset.zoom === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP, root);
        return;
      }

      if (event.target.closest('[data-export]')) {
        const pending = (doc.actions || []).some((action) => !doc.users[action.user]);
        if (!(doc.actions || []).length || pending) {
          this.notice = pending
            ? 'Confirm who signs each box before finalizing.'
            : this.notice;
          this.update(root);
          return;
        }
        this.notice = '';
        this.publish.render();
      }
    });

    root.addEventListener('submit', (event) => {
      const form = event.target.closest('.add-signer');
      if (!form) {
        return;
      }
      event.preventDefault();
      const doc = this.mod.document;
      if (!canConfigure(this.app, doc)) return;
      const name = form.querySelector('[data-signer-name]')?.value.trim();
      if (!doc || !name) {
        return;
      }
      const decision = resolveSigner(doc, name);
      if (decision.action === 'existing') {
        if (decision.conflict) {
          duplicateSignerNotice();
        }
        this.arrived = decision.index;
        this.adding_signer = false;
        this.update(root);
        return;
      }
      this.arrived = addUser(doc, decision.name, this.app.wallet?.publicKey);
      this.adding_signer = false;
      this.update(root);
    });

    root.addEventListener('change', (event) => {
      const page_input = event.target.closest('[data-page-input]');
      if (!page_input || !this.mod.document) {
        return;
      }
      this.page = clampPage(page_input.value, this.mod.document.document.page_count, this.page);
      this.pending_scroll = true;
      this.update(root);
    });

    const reader = root.querySelector('.reader');
    reader.addEventListener('pointerdown', (event) => this.beginReaderDrag(event));
    reader.addEventListener('pointermove', (event) => this.moveReader(event, root));
    reader.addEventListener('pointerup', (event) => this.endReaderDrag(event));
    reader.addEventListener('pointercancel', (event) => this.endReaderDrag(event));

    const sheet = root.querySelector('.sheet');
    sheet.addEventListener('pointerdown', (event) => this.beginSelection(event, root));
    sheet.addEventListener('pointermove', (event) => this.moveSelection(event, root));
    sheet.addEventListener('pointerup', (event) => this.endSelection(event, root));
    sheet.addEventListener('pointercancel', (event) => this.endSelection(event, root));

    root.querySelector('.sheet-wrap').addEventListener(
      'scroll',
      () => this.onScroll(root),
      { passive: true }
    );
  }

  beginSelection(event) {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest('[data-resize]')) {
      this.beginResize(event);
      return;
    }

    const doc = this.mod.document;
    const direct = Boolean(doc && !doc.finalized && canConfigure(this.app, doc));
    if (!this.placing && !direct) {
      return;
    }
    if (event.target.closest('[data-field-id]')) {
      return;
    }

    const stage = event.target.closest('.fields');
    const page = stage?.closest('.pdf-page');
    if (!stage || !page) {
      return;
    }

    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) {
      return;
    }

    this.drag = {
      pointer: event.pointerId,
      box,
      page: Number(page.dataset.page),
      stage,
      x0: event.clientX,
      y0: event.clientY
    };
    this.draft = null;
    stage.setPointerCapture(event.pointerId);
  }

  moveSelection(event, root) {
    if (this.resize && this.resize.pointer === event.pointerId) {
      this.applyResize(event);
      return;
    }

    if (!this.drag || this.drag.pointer !== event.pointerId) {
      return;
    }

    const rect = rectangle(this.drag, event.clientX, event.clientY);
    if (!rect) {
      return;
    }

    const intent = this.intent || {};
    this.draft = {
      page: this.drag.page,
      type: intent.type || 'signature',
      user: Number.isInteger(intent.user) ? intent.user : -1,
      pendingName: intent.newName || '',
      ...rect
    };
    paintDraft(this.drag.stage, this.draft);
  }

  endSelection(event, root) {
    if (this.resize && this.resize.pointer === event.pointerId) {
      this.finishResize(event);
      return;
    }

    if (!this.drag || this.drag.pointer !== event.pointerId) {
      return;
    }

    const stage = this.drag.stage;
    const page = this.drag.page;
    const drag = this.drag;
    if (stage?.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }

    const rect = rectangle(drag, event.clientX, event.clientY);
    const direct = !this.placing;
    this.drag = null;

    if (direct) {
      const box = !rect || rect.pixels < MIN_DRAG
        ? signatureBoxAt(drag, drag.x0, drag.y0)
        : fitBox(rect);
      this.placeSignature(page, box, root);
      return;
    }

    if (!rect || rect.pixels < MIN_DRAG) {
      this.draft = null;
      this.update(root);
      return;
    }

    const doc = this.mod.document;
    const intent = this.intent;
    if (!canConfigure(this.app, doc)) {
      this.draft = null;
      this.placing = false;
      this.intent = null;
      this.update(root);
      return;
    }
    this.page = page;

    if (!doc || !intent) {
      this.placing = false;
      this.draft = null;
      this.intent = null;
      this.update(root);
      return;
    }

    let user = intent.user;
    if (intent.newName) {
      const decision = resolveSigner(doc, intent.newName);
      if (decision.action === 'existing') {
        if (decision.conflict) {
          duplicateSignerNotice();
        }
        user = decision.index;
      } else {
        user = addUser(doc, decision.name, this.app.wallet?.publicKey);
      }
      this.arrived = user;
    }
    if (!doc.users[user]) {
      this.draft = null;
      this.update(root);
      return;
    }

    addAction(doc, {
      type: intent.type,
      user,
      page,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }, this.app.wallet?.publicKey);
    this.intent = null;
    this.placing = false;
    this.draft = null;
    this.update(root);
  }

  placeSignature(page, box, root) {
    const doc = this.mod.document;
    this.draft = null;
    this.placing = false;
    if (!doc || doc.finalized || !canConfigure(this.app, doc) || !box) {
      this.update(root);
      return;
    }

    const placed = addAction(doc, {
      type: 'signature',
      user: -1,
      page,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    }, this.app.wallet?.publicKey);
    if (!placed) {
      this.update(root);
      return;
    }
    this.page = page;
    this.suppress_click = true;
    setTimeout(() => {
      this.suppress_click = false;
    }, 0);
    this.openExisting(placed, root);
  }

  beginResize(event) {
    const handle = event.target.closest('[data-resize]');
    const fieldEl = handle?.closest('[data-field-id]');
    const stage = handle?.closest('.fields');
    const doc = this.mod.document;
    const action = fieldEl ? actionById(doc, fieldEl.dataset.fieldId) : null;
    if (!handle || !stage || !action || !canConfigure(this.app, doc)) {
      return;
    }
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) {
      return;
    }
    this.resize = {
      pointer: event.pointerId,
      edge: handle.dataset.resize,
      box,
      stage,
      action,
      x: action.x,
      y: action.y,
      width: action.width,
      height: action.height,
      next: null
    };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  applyResize(event) {
    const resize = this.resize;
    const point = pointerFraction(resize.box, event.clientX, event.clientY);
    const next = resizeBox(resize, resize.edge, point.x, point.y);
    resize.next = next;
    const el = resize.stage.querySelector(`[data-field-id="${CSS.escape(String(resize.action.id))}"]`);
    if (!el) {
      return;
    }
    el.style.left = `${(next.x * 100).toFixed(2)}%`;
    el.style.top = `${(next.y * 100).toFixed(2)}%`;
    el.style.width = `${(next.width * 100).toFixed(2)}%`;
    el.style.height = `${(next.height * 100).toFixed(2)}%`;
  }

  finishResize(event) {
    const resize = this.resize;
    if (resize.stage?.hasPointerCapture(event.pointerId)) {
      resize.stage.releasePointerCapture(event.pointerId);
    }
    const next = resize.next;
    const doc = this.mod.document;
    if (next && canConfigure(this.app, doc)) {
      const action = resize.action;
      const changed = action.x !== next.x || action.y !== next.y || action.width !== next.width || action.height !== next.height;
      if (changed) {
        action.x = next.x;
        action.y = next.y;
        action.width = next.width;
        action.height = next.height;
        stripSignatures(doc);
        doc.edited = true;
        if (this.draft && Number(this.draft.id) === Number(action.id)) {
          this.draft.x = next.x;
          this.draft.y = next.y;
          this.draft.width = next.width;
          this.draft.height = next.height;
        }
      }
    }
    this.resize = null;
    const moved = Boolean(next);
    if (moved) {
      this.suppress_click = true;
      setTimeout(() => {
        this.suppress_click = false;
      }, 0);
    }
  }

  openSigner(index) {
    const user = this.mod.document.users[index];
    if (!user) {
      return;
    }

    const overlay = new SignerOverlay(this.app, this.mod);
    this.overlay = overlay;
    const identity = userIdentity(user);
    overlay.render(
      {
        name: identity.name,
        email: identity.email,
        publickey: user.publickey || '',
        verified: verifiedMethods(this.app, user).length > 0,
        signed: user.signed === true,
        editable: canConfigure(this.app, this.mod.document)
      },
      {
        onUpdate: (fields) => this.saveUser(index, fields),
        onRemove: () => {
          if (!canConfigure(this.app, this.mod.document)) return;
          removeUser(this.mod.document, index, this.app.wallet?.publicKey);
          overlay.close();
        },
        onClose: () => {
          if (this.overlay === overlay) {
            this.overlay = null;
          }
          const current = document.querySelector('.saito-container > .workspace');
          if (current) {
            this.update(current);
          }
        }
      }
    );
  }

  saveUser(index, fields) {
    const doc = this.mod.document;
    if (!canConfigure(this.app, doc)) return;
    const user = doc.users[index];
    if (!fields || !user) {
      return;
    }

    const nextEmail = String(fields.email || '').trim();
    if (nextEmail && nextEmail !== String(user.email || '').trim()) {
      const decision = resolveSigner(doc, nextEmail, fields.name || user.name, index);
      if (decision.action === 'existing') {
        if (decision.conflict) {
          duplicateSignerNotice();
        }
        return;
      }
    }

    if (fields.name) {
      renameUser(doc, index, fields.name, this.app.wallet?.publicKey);
    }
    if ((user.email || '') !== fields.email) {
      user.email = fields.email;
      doc.edited = true;
    }
    this.overlay.close();
  }

  openNewAction(root) {
    const doc = this.mod.document;
    if (!canConfigure(this.app, doc)) {
      return;
    }
    this.placing = false;
    this.draft = null;
    if (!this.intent) {
      this.intent = {
        type: 'signature',
        user: doc.users.length ? 0 : null,
        newName: ''
      };
    }
    this.openField(root);
  }

  openExisting(field, root) {
    if (!field || (!canConfigure(this.app, this.mod.document) && !this.mod.document?.finalized)) {
      return;
    }
    this.placing = false;
    this.intent = null;
    this.page = field.page;
    this.pending_scroll = true;
    this.scroll_field = field.id;
    this.draft = {
      id: field.id,
      page: field.page,
      type: field.type,
      user: field.user,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height
    };
    this.update(root);
    this.openField(root);
  }

  openField(root) {
    if (this.overlay) {
      this.replacing = true;
      this.overlay.close();
      this.replacing = false;
    }

    const overlay = new FieldOverlay(this.app, this.mod);
    this.overlay = overlay;
    overlay.render(this.fieldView(), {
      onPreview: (form) => this.previewField(form),
      onRemove: () => {
        if (!canConfigure(this.app, this.mod.document)) return;
        removeAction(this.mod.document, this.draft.id, this.app.wallet?.publicKey);
        overlay.close();
      },
      onSave: (form) => {
        if (this.draft?.id) {
          return this.saveField(form);
        }
        return this.armPlacement(form);
      },
      onSign: () => this.signField(),
      onClose: () => {
        if (this.replacing) {
          return;
        }
        const started = this.arming;
        this.arming = false;
        if (!started) {
          this.intent = null;
          this.placing = false;
        }
        this.draft = null;
        if (this.overlay === overlay) {
          this.overlay = null;
        }
        const current = document.querySelector('.saito-container > .workspace');
        if (current) {
          this.update(current);
        }
      }
    });
  }

  armPlacement(form) {
    const doc = this.mod.document;
    if (!canConfigure(this.app, doc)) {
      return false;
    }

    const type = form.querySelector('[data-field-type]')?.value;
    const chosen = form.querySelector('[data-field-signer]')?.value;
    if (!ACTION_TYPES[type]) {
      return false;
    }

    if (chosen === 'new') {
      const newName = form.querySelector('[data-new-signer]')?.value.trim() || '';
      if (!newName) {
        return false;
      }
      const decision = resolveSigner(doc, newName);
      if (decision.action === 'existing') {
        const select = form.querySelector('[data-field-signer]');
        if (select) {
          select.value = String(decision.index);
        }
        const extra = form.querySelector('.new-signer');
        if (extra) {
          extra.hidden = true;
        }
        if (decision.conflict) {
          duplicateSignerNotice();
          return false;
        }
        this.intent = { type, user: decision.index, newName: '' };
      } else {
        this.intent = { type, user: null, newName: decision.name };
      }
    } else {
      const user = Number(chosen);
      if (!doc.users[user]) {
        return false;
      }
      this.intent = { type, user, newName: '' };
    }

    this.placing = true;
    this.draft = null;
    this.arming = true;
    this.overlay.close();
    return true;
  }

  saveField(form) {
    const doc = this.mod.document;
    const draft = this.draft;
    if (!canConfigure(this.app, doc) || !draft) {
      return false;
    }

    const type = form.querySelector('[data-field-type]').value;
    const chosen = form.querySelector('[data-field-signer]').value;
    if (!ACTION_TYPES[type]) {
      return false;
    }

    let userIndex = Number(chosen);
    if (chosen === 'new') {
      const name = form.querySelector('[data-signer-name]')?.value.trim() || '';
      const email = form.querySelector('[data-signer-email]')?.value.trim() || '';
      if (!name || !isEmailAddress(email)) {
        return false;
      }
      const decision = resolveSigner(doc, email, name);
      if (decision.action === 'existing') {
        if (decision.conflict) {
          duplicateSignerNotice();
          return false;
        }
        userIndex = decision.index;
      } else if (decision.action === 'create') {
        userIndex = addUser(doc, decision.name, this.app.wallet?.publicKey);
        if (!doc.users[userIndex]) {
          return false;
        }
        doc.users[userIndex].email = email;
        this.arrived = userIndex;
      } else {
        return false;
      }
    }

    const user = doc.users[userIndex];
    if (!user) {
      return false;
    }

    if (draft.id) {
      const action = actionById(doc, draft.id);
      if (action && (action.type !== type || action.user !== userIndex)) {
        action.type = type;
        action.user = userIndex;
        stripSignatures(doc);
        doc.edited = true;
      }
    } else {
      addAction(doc, {
        type,
        user: userIndex,
        page: draft.page,
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height
      }, this.app.wallet?.publicKey);
    }

    this.notice = '';
    this.overlay.close();
    return true;
  }

  previewField(form) {
    const draft = this.draft;
    const doc = this.mod.document;
    if (!draft?.id || !doc) {
      return;
    }
    const chosen = form.querySelector('[data-field-signer]')?.value;
    const type = form.querySelector('[data-field-type]')?.value || 'signature';
    const index = chosen === 'new' ? doc.users.length : Number(chosen);
    const el = document.querySelector(`.workspace .field[data-field-id="${CSS.escape(String(draft.id))}"]`);
    if (!el) {
      return;
    }
    const color = signerColor(index);
    el.style.background = color;
    el.style.borderColor = color;
    const name = chosen === 'new' ? '' : doc.users[index]?.name || '';
    const text = el.querySelector('.text');
    if (text) {
      text.textContent = name ? `${typeLabel(type)} - ${name}` : typeLabel(type);
    }
  }

  async signField() {
    const doc = this.mod.document;
    const draft = this.draft;
    if (!doc?.finalized || !draft?.id) {
      return false;
    }
    const action = actionById(doc, draft.id);
    const user = action ? doc.users[action.user] : null;
    if (!action || !user || !canSignAction(this.app, action, user)) {
      return false;
    }
    const form = document.querySelector('.saitosign-field');
    const type = form?.querySelector('[data-field-type]')?.value;
    if (doc.finalized && type !== action.type) {
      return false;
    }
    if (!doc.finalized && (type === 'signature' || type === 'initial')) {
      action.type = type;
    }
    const privateKey = await this.app.wallet.getPrivateKey();
    const signed = action.type === 'initial'
      ? addInitial(this.app, action, privateKey)
      : addSignature(this.app, action, privateKey);
    const kept = (Array.isArray(user.signatures) ? user.signatures : []).filter((entry) => {
      return Number(entry?.id) !== Number(action.id);
    });
    kept.push(signed);
    user.signatures = kept;
    doc.edited = true;
    this.overlay.close();
    return true;
  }

  fieldView() {
    const doc = this.mod.document;
    const draft = this.draft;
    const intent = this.intent;
    const existing = Boolean(draft?.id);
    let type = 'signature';
    let signer_index = doc.users.length ? 0 : null;
    let new_name = '';
    let choose_new = doc.users.length === 0;

    if (existing) {
      type = draft.type || 'signature';
      const known = Number.isInteger(draft.user) && Boolean(doc.users[draft.user]);
      signer_index = known ? draft.user : null;
      choose_new = !known;
    } else if (intent) {
      type = intent.type || 'signature';
      new_name = intent.newName || '';
      if (new_name) {
        choose_new = true;
        signer_index = null;
      } else if (Number.isInteger(intent.user) && doc.users[intent.user]) {
        signer_index = intent.user;
        choose_new = false;
      }
    }

    const signer = existing ? doc.users[signer_index] : null;
    const action = existing ? actionById(doc, draft.id) : null;
    const can_sign = Boolean(doc.finalized && action && signer && canSignAction(this.app, action, signer));

    return {
      existing,
      editable: canConfigure(this.app, doc),
      defer_signer: !existing,
      type,
      signer_index,
      choose_new,
      new_name,
      can_sign,
      already_signed: Boolean(action && signer && verifyActionSignature(this.app, action, signer)),
      sign_index: can_sign ? signer_index : null,
      signers: doc.users.map((user, index) => ({
        index,
        name: user.name
      }))
    };
  }

  view() {
    const doc = this.mod.document;
    if (this.page > doc.document.page_count) {
      this.page = doc.document.page_count;
    }
    if (this.page < 1) {
      this.page = 1;
    }

    const draft = this.draft && !this.draft.id
      ? {
          page: this.draft.page,
          type: this.draft.type || 'signature',
          name: doc.users[this.draft.user]?.name || this.draft.pendingName || '',
          x: this.draft.x,
          y: this.draft.y,
          width: this.draft.width,
          height: this.draft.height
        }
      : null;

    return {
      file_name: doc.document.name || 'Document',
      can_edit: canConfigure(this.app, doc),
      page: this.page,
      page_count: doc.document.page_count,
      notice: this.notice || '',
      placing: this.placing,
      adding_signer: this.adding_signer,
      edited: doc.edited,
      zoom: this.zoom,
      zoom_min: this.zoom_floor || ZOOM_MIN,
      zoom_max: ZOOM_MAX,
      reader_x: this.reader_x,
      reader_y: this.reader_y,
      signers: doc.users.map((user, index) => {
        const mine = (doc.actions || []).filter((action) => {
          return action.user === index && (action.type === 'signature' || action.type === 'initial');
        });
        const complete = mine.length > 0 && mine.every((action) => verifyActionSignature(this.app, action, user));
        return {
          index,
          name: user.name,
          arrived: index === this.arrived,
          complete
        };
      }),
      field_list: doc.actions.map((action) => {
        const name = doc.users[action.user]?.name || '';
        const kind = typeLabel(action.type);
        return {
          id: action.id,
          page: action.page,
          type: action.type,
          name,
          color: signerColor(doc.users[action.user] ? action.user : doc.users.length),
          label: name ? `${kind} - ${name} - page ${action.page}` : `${kind} - page ${action.page}`,
          signed: verifyActionSignature(this.app, action, doc.users[action.user])
        };
      }),
      pages: Array.from({ length: doc.document.page_count }, (_, index) => {
        const page = index + 1;
        return {
          page,
          editable: canConfigure(this.app, doc),
          fields: actionsOnPage(doc, page).map((action) => {
            const name = doc.users[action.user]?.name || '';
            const kind = typeLabel(action.type);
            return {
              id: action.id,
              type: action.type,
              name,
              label: name ? `${kind} - ${name}` : kind,
              color: signerColor(doc.users[action.user] ? action.user : doc.users.length),
              x: action.x,
              y: action.y,
              width: action.width,
              height: action.height
            };
          }),
          draft: draft && draft.page === page ? draft : null
        };
      })
    };
  }

  paintFields(root, view) {
    view.pages.forEach((page) => {
      const layer = root.querySelector(`.pdf-page[data-page="${page.page}"] .fields`);
      if (!layer) {
        return;
      }
      layer.classList.toggle('placing', view.placing);
      layer.classList.toggle('marking', view.can_edit);
      layer.innerHTML = WorkspaceTemplate.fields(page);
    });
  }

  paintActions(root, view) {
    const existing = root.querySelector(':scope > .actions-col');
    if (!view.field_list.length) {
      if (existing) {
        existing.remove();
      }
      return;
    }
    if (!existing) {
      root.insertAdjacentHTML('beforeend', WorkspaceTemplate.actions(view));
      return;
    }
    existing.innerHTML = WorkspaceTemplate.actionsInner(view);
  }

  // Each page is its own sheet. The plugin is loaded once, after the sheet has
  // a size, and is never torn down to change pages. Reloading one iframe with
  // `#page=N&zoom=page-fit` left the newly opened page blank: Chrome ignores
  // `zoom=page-fit` and paints a fragment target only after a resize, which
  // the old path never sent. Page numbers in the fragment are 1-based.
  loadPages(root) {
    const doc = this.mod.document;
    const wrap = root.querySelector('.sheet-wrap');
    if (!doc?.document?.url || !wrap) {
      return;
    }

    const wrapBox = wrap.getBoundingClientRect();
    const margin = wrapBox.height || 400;
    root.querySelectorAll('.pdf-page').forEach((pageEl) => {
      const frame = pageEl.querySelector('.page');
      if (!frame || frame.dataset.loaded) {
        return;
      }

      const box = pageEl.getBoundingClientRect();
      const page = Number(pageEl.dataset.page);
      const near = box.bottom >= wrapBox.top - margin && box.top <= wrapBox.bottom + margin;
      if (!near && page !== this.page) {
        return;
      }
      if (box.width < 40 || box.height < 40) {
        return;
      }

      frame.dataset.loaded = '1';
      frame.src = `${doc.document.url}#page=${page}&view=FitH&toolbar=0&navpanes=0`;
      frame.addEventListener(
        'load',
        () => {
          const width = frame.getBoundingClientRect().width;
          if (!width) {
            return;
          }
          frame.style.width = `${Math.floor(width) - 1}px`;
          requestAnimationFrame(() => {
            frame.style.width = '';
          });
        },
        { once: true }
      );
    });
  }

  onScroll(root) {
    this.loadPages(root);
    if (this.suspend_scroll) {
      return;
    }

    const page = visiblePage(root);
    if (!page || page === this.page) {
      return;
    }

    this.page = page;
    if (document.activeElement?.matches('[data-page-input]')) {
      return;
    }
    root.querySelector('.reader').innerHTML = WorkspaceTemplate.reader(this.view());
  }

  scrollToField(root, id) {
    const wrap = root.querySelector('.sheet-wrap');
    const el = root.querySelector(`.pdf-page .field[data-field-id="${CSS.escape(String(id))}"]`);
    if (!wrap || !el) {
      this.scrollToPage(root, this.page);
      return;
    }

    const wrapBox = wrap.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const margin = 32;
    const viewTop = wrapBox.top + margin;
    const viewBottom = wrapBox.bottom - margin;
    const viewLeft = wrapBox.left + margin;
    const viewRight = wrapBox.right - margin;

    let deltaY = 0;
    if (box.height >= viewBottom - viewTop) {
      deltaY = box.top - viewTop;
    } else if (box.top < viewTop) {
      deltaY = box.top - viewTop;
    } else if (box.bottom > viewBottom) {
      deltaY = box.bottom - viewBottom;
    }

    let deltaX = 0;
    if (box.left < viewLeft) {
      deltaX = box.left - viewLeft;
    } else if (box.right > viewRight) {
      deltaX = box.right - viewRight;
    }

    if (!deltaX && !deltaY) {
      return;
    }

    this.suspend_scroll = true;
    wrap.scrollTop += deltaY;
    wrap.scrollLeft += deltaX;
    this.loadPages(root);
    requestAnimationFrame(() => {
      this.suspend_scroll = false;
    });
  }

  scrollToPage(root, page) {
    const wrap = root.querySelector('.sheet-wrap');
    const el = root.querySelector(`.pdf-page[data-page="${page}"]`);
    if (!wrap || !el) {
      return;
    }

    this.suspend_scroll = true;
    const top = el.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    wrap.scrollTop += top;
    this.loadPages(root);
    requestAnimationFrame(() => {
      this.suspend_scroll = false;
    });
  }

  changeZoom(factor, root) {
    const wrap = root.querySelector('.sheet-wrap');
    const sheet = root.querySelector('.sheet');
    if (!wrap || !sheet) {
      return;
    }

    const next = clampZoom(this.zoom * factor, this.zoom_floor || ZOOM_MIN);
    if (next === this.zoom) {
      return;
    }

    const wrapBox = wrap.getBoundingClientRect();
    const before = sheet.getBoundingClientRect();
    const focusX = before.width ? (wrapBox.left + wrapBox.width / 2 - before.left) / before.width : 0.5;
    const focusY = before.height ? (wrapBox.top + wrapBox.height / 2 - before.top) / before.height : 0.5;
    this.zoom = next;
    this.fitSheet(root);

    const after = sheet.getBoundingClientRect();
    wrap.scrollLeft += after.left + after.width * focusX - (wrapBox.left + wrapBox.width / 2);
    wrap.scrollTop += after.top + after.height * focusY - (wrapBox.top + wrapBox.height / 2);
    root.querySelector('.reader').innerHTML = WorkspaceTemplate.reader(this.view());
  }

  fitSheet(root) {
    const stage = root.querySelector('.stage');
    const sheet = root.querySelector('.sheet');
    const doc = this.mod.document;
    if (!stage || !sheet || !doc?.document?.page_width || !doc?.document?.page_height) {
      return;
    }

    const style = window.getComputedStyle(stage);
    const boundsW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const boundsH = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (boundsW < 40 || boundsH < 40) {
      return;
    }

    const ratio = doc.document.page_width / doc.document.page_height;
    const available = Math.max(40, boundsW - 40);
    const widthFit = Math.min(available, 1280);
    const containWidth = Math.min(widthFit, Math.max(40, boundsH * ratio));
    this.zoom_floor = widthFit > 0 ? Math.min(1, containWidth / widthFit) : 1;
    if (this.zoom < this.zoom_floor) {
      this.zoom = this.zoom_floor;
    }

    const pageHeight = Math.floor((widthFit / ratio) * this.zoom);
    sheet.style.width = `${Math.floor(widthFit * this.zoom)}px`;
    sheet.style.height = 'auto';
    sheet.querySelectorAll('.pdf-page').forEach((page) => {
      page.style.height = `${pageHeight}px`;
    });
    this.seatReader(root);
  }

  seatReader(root) {
    const stage = root.querySelector('.stage');
    const sheet = root.querySelector('.sheet');
    const reader = root.querySelector('.reader');
    if (!stage || !sheet || !reader) {
      return;
    }

    if (!this.reader_moved) {
      reader.style.left = '';
      reader.style.top = '';
      reader.style.right = '';
      return;
    }

    const maxX = Math.max(8, stage.clientWidth - reader.offsetWidth - 8);
    const maxY = Math.max(8, stage.clientHeight - reader.offsetHeight - 8);
    this.reader_x = Math.min(maxX, Math.max(8, this.reader_x));
    this.reader_y = Math.min(maxY, Math.max(8, this.reader_y));
    reader.style.right = 'auto';
    reader.style.left = `${this.reader_x}px`;
    reader.style.top = `${this.reader_y}px`;
  }

  beginReaderDrag(event) {
    if (event.button !== 0 || event.target.closest('button, input, label')) {
      return;
    }
    const reader = event.currentTarget;
    this.reader_drag = {
      pointer: event.pointerId,
      dx: event.clientX - reader.offsetLeft,
      dy: event.clientY - reader.offsetTop
    };
    reader.setPointerCapture(event.pointerId);
    reader.classList.add('moving');
  }

  moveReader(event, root) {
    if (!this.reader_drag || this.reader_drag.pointer !== event.pointerId) {
      return;
    }
    this.reader_moved = true;
    this.reader_x = event.clientX - this.reader_drag.dx;
    this.reader_y = event.clientY - this.reader_drag.dy;
    this.seatReader(root);
  }

  endReaderDrag(event) {
    if (!this.reader_drag || this.reader_drag.pointer !== event.pointerId) {
      return;
    }
    this.reader_drag = null;
    event.currentTarget.classList.remove('moving');
  }

  listen() {
    if (this.listening || typeof window === 'undefined') {
      return;
    }
    this.listening = true;
    window.addEventListener('resize', () => {
      const root = document.querySelector('.saito-container > .workspace');
      if (root) {
        this.fitSheet(root);
        this.loadPages(root);
      }
    });
  }
}

function duplicateSignerNotice() {
  if (typeof siteMessage === 'function') {
    siteMessage('Adding multiple users with the same email address is not permitted.', 3000);
  }
}

function clampZoom(value, floor = ZOOM_MIN) {
  const zoom = Math.round(value * 100) / 100;
  return Math.min(ZOOM_MAX, Math.max(floor, zoom));
}

function signerColor(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) {
    return '#6b625b';
  }
  return SIGNER_COLORS[n % SIGNER_COLORS.length];
}

function typeLabel(type) {
  if (type === 'date') {
    return 'date';
  }
  if (type === 'initial') {
    return 'initial';
  }
  return 'date and signature';
}

function pointerFraction(box, clientX, clientY) {
  return {
    x: (clientX - box.left) / box.width,
    y: (clientY - box.top) / box.height
  };
}

function resizeBox(start, edge, px, py) {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  const x = clamp01(px);
  const y = clamp01(py);
  if (String(edge).includes('w')) {
    left = x;
  }
  if (String(edge).includes('e')) {
    right = x;
  }
  if (String(edge).includes('n')) {
    top = y;
  }
  if (String(edge).includes('s')) {
    bottom = y;
  }
  return fitBox({
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top)
  });
}

function signatureBoxAt(drag, clientX, clientY) {
  const box = drag.box;
  const cx = (clientX - box.left) / box.width;
  const cy = (clientY - box.top) / box.height;
  return fitBox({
    x: cx - CLICK_WIDTH / 2,
    y: cy - CLICK_HEIGHT / 2,
    width: CLICK_WIDTH,
    height: CLICK_HEIGHT
  });
}

function fitBox(box) {
  let x = box.x;
  let y = box.y;
  let width = Math.max(box.width, MIN_BOX_WIDTH);
  let height = Math.max(box.height, MIN_BOX_HEIGHT);
  if (width > 1) {
    width = 1;
  }
  if (height > 1) {
    height = 1;
  }
  x = Math.min(Math.max(0, x), 1 - width);
  y = Math.min(Math.max(0, y), 1 - height);
  return { x, y, width, height };
}

function rectangle(drag, clientX, clientY) {
  const box = drag.box;
  const x0 = (drag.x0 - box.left) / box.width;
  const y0 = (drag.y0 - box.top) / box.height;
  const x1 = (clientX - box.left) / box.width;
  const y1 = (clientY - box.top) / box.height;
  const left = clamp01(Math.min(x0, x1));
  const top = clamp01(Math.min(y0, y1));
  const right = clamp01(Math.max(x0, x1));
  const bottom = clamp01(Math.max(y0, y1));
  const width = right - left;
  const height = bottom - top;

  return {
    x: left,
    y: top,
    width,
    height,
    pixels: Math.max(Math.abs(clientX - drag.x0), Math.abs(clientY - drag.y0))
  };
}

function paintDraft(stage, draft) {
  let mark = stage.querySelector('.draft');
  if (!mark) {
    mark = document.createElement('div');
    mark.className = 'field draft';
    stage.appendChild(mark);
  }
  mark.style.left = `${(draft.x * 100).toFixed(2)}%`;
  mark.style.top = `${(draft.y * 100).toFixed(2)}%`;
  mark.style.width = `${(draft.width * 100).toFixed(2)}%`;
  mark.style.height = `${(draft.height * 100).toFixed(2)}%`;
}

function visiblePage(root) {
  const wrap = root.querySelector('.sheet-wrap');
  const pages = [...root.querySelectorAll('.pdf-page')];
  if (!wrap || !pages.length) {
    return 0;
  }

  const marker = wrap.getBoundingClientRect().top + Math.min(96, wrap.clientHeight * 0.28);
  let current = Number(pages[0].dataset.page);
  pages.forEach((page) => {
    if (page.getBoundingClientRect().top <= marker) {
      current = Number(page.dataset.page);
    }
  });
  return current;
}

function userIdentity(signer) {
  const name = String(signer?.name || '').trim();
  const email = String(signer?.email || '').trim();
  if (email || !isEmailAddress(name)) {
    return { name, email };
  }
  return {
    name: nameFromEmail(name),
    email: name
  };
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function nameFromEmail(email) {
  return email
    .split('@')[0]
    .replace(/[._+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampPage(value, count, fallback) {
  const page = Number(value);
  if (!Number.isFinite(page)) {
    return fallback;
  }
  return Math.min(count, Math.max(1, Math.round(page)));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

module.exports = Workspace;
