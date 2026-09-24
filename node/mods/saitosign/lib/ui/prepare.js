const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PrepareTemplate = require('./prepare.template');
const Field = require('../field');

const MIN_DRAG = 12;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.35;

class Prepare {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.page = 1;
    this.notice = '';
    this.placing = false;
    this.adding_signer = false;
    this.focus_name = false;
    this.draft = null;
    this.drag = null;
    this.arrived = null;
    this.overlay = null;
    this.listening = false;
    this.pending_scroll = false;
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
    this.drag = null;
    this.arrived = null;
    this.pending_scroll = false;
    this.zoom = ZOOM_MIN;
    this.reader_moved = false;
    this.reader_x = 16;
    this.reader_y = 16;
    this.render();
  }

  render() {
    const container = document.querySelector('.saito-container');
    const doc = this.mod.document;
    if (!container || !doc) {
      return;
    }

    container.classList.add('saitosign');

    let root = container.querySelector(':scope > .prepare');
    if (!root || root.dataset.src !== doc.url) {
      container.innerHTML = PrepareTemplate(this.view());
      root = container.querySelector(':scope > .prepare');
      root.dataset.src = doc.url;
      this.attachEvents(root);
    } else {
      this.update(root);
      return;
    }

    this.fitSheet(root);
    root.querySelector('.reader').innerHTML = PrepareTemplate.reader(this.view());
    this.loadPages(root);
    this.listen();
  }

  update(root) {
    const view = this.view();
    root.querySelector('.rail').innerHTML = PrepareTemplate.rail(view);
    this.paintFields(root, view);

    if (this.focus_name) {
      root.querySelector('[data-signer-name]')?.focus();
      this.focus_name = false;
    }

    this.fitSheet(root);
    root.querySelector('.reader').innerHTML = PrepareTemplate.reader(this.view());
    this.loadPages(root);
    if (this.pending_scroll) {
      this.pending_scroll = false;
      this.scrollToPage(root, this.page);
    }
  }

  attachEvents(root) {
    root.addEventListener('click', (event) => {
      const doc = this.mod.document;
      if (!doc) {
        return;
      }

      if (event.target.closest('[data-add-signer]')) {
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
        this.openSigner(doc.signers[Number(signer_row.dataset.openSigner)]);
        return;
      }

      if (event.target.closest('[data-add-field]')) {
        this.placing = !this.placing;
        if (!this.placing && this.draft && !this.draft.id) {
          this.draft = null;
        }
        this.update(root);
        return;
      }

      const listed = event.target.closest('[data-open-field]');
      if (listed) {
        this.openExisting(doc.fieldById(listed.dataset.openField), root);
        return;
      }

      const placed = event.target.closest('[data-field-id]');
      if (placed) {
        this.openExisting(doc.fieldById(placed.dataset.fieldId), root);
        return;
      }

      if (event.target.closest('[data-page="prev"]')) {
        this.page = Math.max(1, this.page - 1);
        this.pending_scroll = true;
        this.update(root);
        return;
      }

      if (event.target.closest('[data-page="next"]')) {
        this.page = Math.min(doc.page_count, this.page + 1);
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
        this.mod.exportDocument();
      }
    });

    root.addEventListener('submit', (event) => {
      const form = event.target.closest('.add-signer');
      if (!form) {
        return;
      }
      event.preventDefault();
      const doc = this.mod.document;
      const name = form.querySelector('[data-signer-name]')?.value.trim();
      if (!doc || !name) {
        return;
      }
      this.arrived = doc.addSigner(name);
      this.adding_signer = false;
      this.update(root);
    });

    root.addEventListener('change', (event) => {
      const page_input = event.target.closest('[data-page-input]');
      if (!page_input || !this.mod.document) {
        return;
      }
      this.page = clampPage(page_input.value, this.mod.document.page_count, this.page);
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
    if (!this.placing || event.button !== 0) {
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
    if (!this.drag || this.drag.pointer !== event.pointerId) {
      return;
    }

    const rect = rectangle(this.drag, event.clientX, event.clientY);
    if (!rect) {
      return;
    }

    const doc = this.mod.document;
    this.draft = {
      page: this.drag.page,
      type: 'signature',
      signer: doc.signers[0],
      ...rect
    };
    paintDraft(this.drag.stage, this.draft);
  }

  endSelection(event, root) {
    if (!this.drag || this.drag.pointer !== event.pointerId) {
      return;
    }

    const stage = this.drag.stage;
    const page = this.drag.page;
    if (stage?.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }

    const rect = rectangle(this.drag, event.clientX, event.clientY);
    this.drag = null;

    if (!rect || rect.pixels < MIN_DRAG) {
      this.draft = null;
      this.update(root);
      return;
    }

    const doc = this.mod.document;
    this.placing = false;
    this.page = page;
    this.draft = {
      page,
      type: 'signature',
      signer: doc.signers[0],
      ...rect
    };
    this.update(root);
    this.openField(root);
  }

  openSigner(signer) {
    if (!signer) {
      return;
    }

    const overlay = new SaitoOverlay(this.app, this.mod, true);
    overlay.class = 'saito-overlay saitosign-overlay saitosign-user-overlay';
    this.overlay = overlay;
    const identity = userIdentity(signer);
    overlay.show(
      PrepareTemplate.signerForm({
        name: identity.name,
        email: identity.email,
        publickey: signer.publicKey || signer.publickey || '',
        verified: signer.verified === true,
        signed: signer.signed === true
      }),
      () => {
        this.overlay = null;
        const current = document.querySelector('.saito-container > .prepare');
        if (current) {
          this.update(current);
        }
      }
    );

    const remove = document.querySelector('[data-remove-signer-confirm]');
    if (remove) {
      remove.onclick = () => {
        this.mod.document.removeSigner(signer);
        this.overlay.close();
      };
    }

    const update = document.querySelector('[data-update-user]');
    if (update) {
      update.onclick = () => {
        this.saveUser(signer);
      };
    }
  }

  saveUser(signer) {
    const nameInput = document.querySelector('[data-user-name]');
    const emailInput = document.querySelector('[data-user-email]');
    if (!nameInput || !emailInput || !this.mod.document) {
      return;
    }

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    if (name) {
      this.mod.document.renameSigner(signer, name);
    }
    if ((signer.email || '') !== email) {
      signer.email = email;
      this.mod.document.markEdited();
    }
    this.overlay.close();
  }

  openExisting(field, root) {
    if (!field) {
      return;
    }
    this.placing = false;
    this.page = field.page;
    this.pending_scroll = true;
    this.draft = {
      id: field.id,
      page: field.page,
      type: field.type,
      signer: field.signer,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height
    };
    this.update(root);
    this.openField(root);
  }

  openField(root) {
    const overlay = new SaitoOverlay(this.app, this.mod, true);
    overlay.class = 'saito-overlay saitosign-overlay';
    this.overlay = overlay;
    overlay.show(PrepareTemplate.fieldForm(this.fieldView()), () => {
      this.draft = null;
      this.overlay = null;
      const current = document.querySelector('.saito-container > .prepare');
      if (current) {
        this.update(current);
      }
    });
    this.bindFieldForm(root);
  }

  bindFieldForm(root) {
    const form = document.querySelector('.saitosign-field');
    if (!form) {
      return;
    }

    const signer_select = form.querySelector('[data-field-signer]');
    const extra = form.querySelector('.new-signer');
    signer_select.addEventListener('change', () => {
      extra.hidden = signer_select.value !== 'new';
      if (!extra.hidden) {
        form.querySelector('[data-new-signer]')?.focus();
      }
    });

    form.querySelector('[data-create-signer]').onclick = () => {
      const doc = this.mod.document;
      const name = form.querySelector('[data-new-signer]')?.value.trim();
      if (!doc || !name) {
        return;
      }
      const signer = doc.addSigner(name);
      this.arrived = signer;
      this.draft.signer = signer;
      signer_select.insertAdjacentHTML(
        'beforeend',
        `<option value="${doc.signers.length - 1}">${escapeHTML(signer.name)}</option>`
      );
      const added = signer_select.querySelector('option[value="new"]');
      signer_select.value = String(doc.signers.indexOf(signer));
      if (added) {
        signer_select.appendChild(added);
      }
      extra.hidden = true;
      form.querySelector('[data-new-signer]').value = '';
      this.update(root);
    };

    const remove = form.querySelector('[data-remove-field]');
    if (remove) {
      remove.onclick = () => {
        this.mod.document.removeField(this.draft.id);
        this.overlay.close();
      };
    }

    form.onsubmit = (event) => {
      event.preventDefault();
      this.saveField(form);
    };
  }

  saveField(form) {
    const doc = this.mod.document;
    const draft = this.draft;
    if (!doc || !draft) {
      return;
    }

    const type = form.querySelector('[data-field-type]').value;
    const chosen = form.querySelector('[data-field-signer]').value;
    if (chosen === 'new') {
      return;
    }

    const signer = doc.signers[Number(chosen)];
    if (!signer || !Field.types[type]) {
      return;
    }

    if (draft.id) {
      const field = doc.fieldById(draft.id);
      if (field && (field.type !== type || field.signer !== signer)) {
        field.type = type;
        field.signer = signer;
        doc.markEdited();
      }
    } else {
      doc.placeField(type, signer, draft.page, draft.x, draft.y, draft.width, draft.height);
    }

    this.overlay.close();
  }

  fieldView() {
    const doc = this.mod.document;
    const draft = this.draft;
    const signer_index = Math.max(0, doc.signers.indexOf(draft.signer));

    return {
      existing: Boolean(draft.id),
      type: draft.type || 'signature',
      signer_index,
      signers: doc.signers.map((signer, index) => ({
        index,
        name: signer.name
      }))
    };
  }

  view() {
    const doc = this.mod.document;
    if (this.page > doc.page_count) {
      this.page = doc.page_count;
    }
    if (this.page < 1) {
      this.page = 1;
    }

    const draft = this.draft && !this.draft.id
      ? {
          page: this.draft.page,
          type: this.draft.type || 'signature',
          name: this.draft.signer?.name || '',
          x: this.draft.x,
          y: this.draft.y,
          width: this.draft.width,
          height: this.draft.height
        }
      : null;

    return {
      file_name: doc.file?.name || 'Document',
      page: this.page,
      page_count: doc.page_count,
      notice: this.notice,
      placing: this.placing,
      adding_signer: this.adding_signer,
      edited: doc.edited,
      zoom: this.zoom,
      zoom_min: this.zoom_floor || ZOOM_MIN,
      zoom_max: ZOOM_MAX,
      reader_x: this.reader_x,
      reader_y: this.reader_y,
      signers: doc.signers.map((signer, index) => ({
        index,
        name: signer.name,
        arrived: signer === this.arrived
      })),
      field_list: doc.fields.map((field) => ({
        id: field.id,
        page: field.page,
        type: field.type,
        name: field.signer.name
      })),
      pages: Array.from({ length: doc.page_count }, (_, index) => {
        const page = index + 1;
        return {
          page,
          fields: doc.fieldsOnPage(page).map((field) => ({
            id: field.id,
            type: field.type,
            name: field.signer.name,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height
          })),
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
      layer.innerHTML = PrepareTemplate.fields(page);
    });
  }

  // Each page is its own sheet. The plugin is loaded once, after the sheet has
  // a size, and is never torn down to change pages. Reloading one iframe with
  // `#page=N&zoom=page-fit` left the newly opened page blank: Chrome ignores
  // `zoom=page-fit` and paints a fragment target only after a resize, which
  // the old path never sent. Page numbers in the fragment are 1-based.
  loadPages(root) {
    const doc = this.mod.document;
    const wrap = root.querySelector('.sheet-wrap');
    if (!doc?.url || !wrap) {
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
      frame.src = `${doc.url}#page=${page}&view=FitH&toolbar=0&navpanes=0`;
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
    root.querySelector('.reader').innerHTML = PrepareTemplate.reader(this.view());
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
    root.querySelector('.reader').innerHTML = PrepareTemplate.reader(this.view());
  }

  fitSheet(root) {
    const stage = root.querySelector('.stage');
    const sheet = root.querySelector('.sheet');
    const doc = this.mod.document;
    if (!stage || !sheet || !doc?.page_width || !doc?.page_height) {
      return;
    }

    const style = window.getComputedStyle(stage);
    const boundsW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const boundsH = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (boundsW < 40 || boundsH < 40) {
      return;
    }

    const ratio = doc.page_width / doc.page_height;
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
      const root = document.querySelector('.saito-container > .prepare');
      if (root) {
        this.fitSheet(root);
        this.loadPages(root);
      }
    });
  }
}

function clampZoom(value, floor = ZOOM_MIN) {
  const zoom = Math.round(value * 100) / 100;
  return Math.min(ZOOM_MAX, Math.max(floor, zoom));
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

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = Prepare;
