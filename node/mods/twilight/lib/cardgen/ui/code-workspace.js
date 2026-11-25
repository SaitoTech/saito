const CodeWorkspaceTemplate = require('./code-workspace.template');

class CodeWorkspace {
  constructor(app, mod, main, container = '.tscardgen-controls') {
    this.app = app;
    this.mod = mod;
    this.main = main;
    this.container = container;
    this.editor = null;
  }

  render() {
    const host = document.querySelector(this.container);
    if (!host) {
      return;
    }

    this.teardownEditor();
    host.innerHTML = '';
    this.app.browser.addElementToSelector(CodeWorkspaceTemplate(), this.container);
    this.ensureEvents();
    this.renderTabs();
    this.renderEditor();
    this.attachEvents();
  }

  ensureEvents() {
    this.mod.card.ensureCodeEvents();
  }

  teardownEditor() {
    try {
      this.editor?.getWrapperElement()?.remove();
    } catch (_) {
      // Editor may already be detached with the host.
    }
    this.editor = null;
  }

  renderTabs() {
    const host = document.querySelector(`${this.container} [data-role="event-tabs"]`);
    if (!host) {
      return;
    }

    const events = this.mod.card.events || [];
    const active = this.mod.card.active_event_index || 0;
    const can_close = events.length > 1;
    const title = String(this.mod.card.title || '').trim() || 'Event';

    host.innerHTML =
      events
        .map((event, index) => {
          const label = `${escapeHtml(title)} [${index}]`;
          const close = can_close
            ? `<span class="ts-event-tab-close" data-close-index="${index}" title="Close panel" aria-label="Close ${label}">×</span>`
            : '';
          return `
            <button
              type="button"
              class="ts-event-tab${index === active ? ' active' : ''}"
              data-event-index="${index}"
              title="Double-click to rename"
            ><span class="ts-event-tab-label">${label}</span>${close}</button>
          `;
        })
        .join('') +
      `<button type="button" class="ts-event-tab-add" data-action="add-event" title="Add event" aria-label="Add event">+</button>`;

    host.querySelectorAll('[data-event-index]').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (event.target.closest('[data-close-index]')) {
          return;
        }
        event.preventDefault();
        this.selectEvent(Number(button.getAttribute('data-event-index')));
      });
      button.addEventListener('dblclick', (event) => {
        if (event.target.closest('[data-close-index]')) {
          return;
        }
        event.preventDefault();
        this.renameEvent(Number(button.getAttribute('data-event-index')));
      });
    });

    host.querySelectorAll('[data-close-index]').forEach((close) => {
      close.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.removeEvent(Number(close.getAttribute('data-close-index')));
      });
    });

    host.querySelector('[data-action="add-event"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.addEvent();
    });
  }

  selectEvent(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.mod.card.events.length) {
      return;
    }
    if (index === this.mod.card.active_event_index) {
      return;
    }
    this.syncToCard();
    this.mod.card.active_event_index = index;
    this.renderTabs();
    this.loadActiveCodeIntoEditor();
    this.updateTestCodeButton();
    this.main.scheduleCardSave({ immediate: true });
  }

  addEvent() {
    this.syncToCard();
    this.mod.card.addCodeEvent();
    this.renderTabs();
    this.loadActiveCodeIntoEditor();
    this.main.scheduleCardSave({ immediate: true });
  }

  removeEvent(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.mod.card.events.length) {
      return;
    }
    if (this.mod.card.events.length <= 1) {
      return;
    }
    this.syncToCard();
    this.mod.card.removeCodeEvent(index);
    this.renderTabs();
    this.loadActiveCodeIntoEditor();
    this.main.scheduleCardSave({ immediate: true });
  }

  renameEvent(index) {
    const event = this.mod.card.events[index];
    if (!event) {
      return;
    }
    const next = window.prompt('Rename event', event.label || event.id || '');
    if (next == null) {
      return;
    }
    const trimmed = String(next).trim();
    if (!trimmed) {
      return;
    }
    this.syncToCard();
    this.mod.card.renameCodeEvent(index, trimmed);
    this.renderTabs();
    this.main.scheduleCardSave({ immediate: true });
  }

  renderEditor() {
    const parent = document.querySelector(`${this.container} .ts-code-editor`);
    if (!parent) {
      return;
    }

    const value = this.mod.card.getActiveCode();

    if (typeof window.CodeMirror !== 'function') {
      parent.innerHTML = `
        <textarea class="ts-input ts-textarea ts-code" data-role="fallback-editor" rows="22">${escapeText(
          value
        )}</textarea>
      `;
      const fallback = parent.querySelector('[data-role="fallback-editor"]');
      fallback?.addEventListener('input', () => {
        this.mod.card.setActiveCode(fallback.value);
        this.updateTestCodeButton();
        this.main.scheduleCardSave();
      });
      this.updateTestCodeButton();
      return;
    }

    this.editor = window.CodeMirror(parent, {
      value,
      mode: 'javascript',
      lineNumbers: false,
      gutters: [],
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true
    });

    this.editor.on('change', () => {
      this.mod.card.setActiveCode(this.editor.getValue());
      this.updateTestCodeButton();
      this.main.scheduleCardSave();
    });

    this.updateTestCodeButton();

    requestAnimationFrame(() => {
      this.editor?.refresh();
      requestAnimationFrame(() => this.editor?.refresh());
    });
  }

  updateTestCodeButton() {
    const button = document.querySelector(`${this.container} [data-action="test-code"]`);
    if (!button) {
      return;
    }
    const ready = String(this.mod.card.events?.[0]?.code || '').trim().length > 0;
    button.hidden = !ready;
    button.title = 'Test the first event';
  }

  loadActiveCodeIntoEditor() {
    const value = this.mod.card.getActiveCode();
    if (this.editor) {
      const cursor = this.editor.getCursor();
      this.editor.setValue(value);
      try {
        this.editor.setCursor(cursor);
      } catch (_) {
        // Cursor may be out of range after switching scripts.
      }
      this.editor.focus();
      return;
    }
    const fallback = document.querySelector(`${this.container} [data-role="fallback-editor"]`);
    if (fallback) {
      fallback.value = value;
    }
  }

  syncToCard() {
    if (this.editor) {
      this.mod.card.setActiveCode(this.editor.getValue());
      return;
    }
    const fallback = document.querySelector(`${this.container} [data-role="fallback-editor"]`);
    if (fallback) {
      this.mod.card.setActiveCode(fallback.value);
    }
  }

  attachEvents() {
    const root = document.querySelector(`${this.container} .ts-code-workspace`);
    if (!root) {
      return;
    }

    root.querySelector('[data-action="create-nft"]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      this.syncToCard();
      await this.main.requestCreateNft();
    });

    root.querySelector('[data-action="test-code"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (event.currentTarget.hidden) {
        return;
      }
      this.syncToCard();
      this.requestTestCode();
    });
  }

  requestTestCode() {
    if (typeof this.mod.startCustomCardTest === 'function') {
      this.mod.startCustomCardTest();
      return;
    }
    const game = this.app.modules?.returnModule?.('Twilight');
    if (!game || typeof game.startCustomCardTest !== 'function') {
      salert('Open this editor from a Twilight Struggle game to test card code');
      return;
    }
    game.startCustomCardTest(this.mod.card);
  }
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = CodeWorkspace;
