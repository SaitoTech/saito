const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const { isPlaceholder } = require('./placeholder_utils');
const { findSignableMessage, validateForApply } = require('./field_validation');
const {
  LOGICAL_OPERATORS,
  normalizeLogicalOperator,
  explainLogicalOperator,
  isLogicalOperator
} = require('./logical_operators');

class PlaceholderPrompt {
  constructor(app, mod, options = {}) {
    this.app = app;
    this.mod = mod;
    this.getLockingScript = options.getLockingScript || (() => ({}));
    this.overlay = new SaitoOverlay(app, mod, false);
    this.liveHash = '';
    this.activeRoot = null;
  }

  open(options, onSubmit) {
    const meta = options?.meta || {};
    const action = meta.action || options?.fieldKind || 'text';
    const currentValue = isPlaceholder(options?.currentValue) ? '' : String(options?.currentValue ?? '');

    const path = options?.context?.path;
    const onOpField = Array.isArray(path) && path[path.length - 1] === 'op';
    if (action === 'logical' || (onOpField && isLogicalOperator(currentValue))) {
      this.openLogicalOperator({ currentValue, path }, onSubmit);
      return;
    }

    if (action === 'hash') {
      this.openHash({ currentValue }, onSubmit);
      return;
    }

    if (action === 'publickey') {
      this.openPublicKey({ currentValue }, onSubmit);
      return;
    }

    if (action === 'signature') {
      this.openSignature(options, onSubmit);
      return;
    }

    if (action === 'timestamp') {
      this.openTimestamp(options, onSubmit);
      return;
    }

    this.openGeneric(options, onSubmit);
  }

  showOverlay(html) {
    this.overlay.show(html);
    this.activeRoot = document.querySelector('.rs-prompt-overlay:last-of-type') || document.querySelector('.rs-prompt-overlay');
  }

  ensureValidationEl(root) {
    let el = root?.querySelector('.rs-prompt-validation');
    if (!el && root) {
      const actions = root.querySelector('.overlay-actions');
      el = document.createElement('p');
      el.className = 'rs-prompt-validation';
      el.hidden = true;
      if (actions) {
        root.insertBefore(el, actions);
      } else {
        root.appendChild(el);
      }
    }
    return el;
  }

  showInlineError(root, message) {
    const el = this.ensureValidationEl(root);
    if (!el) {
      siteMessage(message);
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  clearInlineError(root) {
    const el = root?.querySelector('.rs-prompt-validation');
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  applyValidated(root, onSubmit, kind, rawValue) {
    const result = validateForApply(kind, rawValue);
    if (!result.ok) {
      this.showInlineError(root, result.message);
      return false;
    }
    this.clearInlineError(root);
    onSubmit(result.value);
    this.overlay.hide();
    this.activeRoot = null;
    return true;
  }

  openLogicalOperator(options, onSubmit) {
    const current = normalizeLogicalOperator(options?.currentValue || 'AND');
    const explain = explainLogicalOperator(current);

    const optionsHtml = LOGICAL_OPERATORS.map(
      (op) => `<option value="${op}"${op === current ? ' selected' : ''}>${op}</option>`
    ).join('');

    const html = `
      <div class="rustscript-overlay rs-prompt-overlay rs-prompt-logical" data-action="logical">
        <h2 class="rs-prompt-title">${current}</h2>
        <label class="rs-prompt-label" for="rs-prompt-logical-select">Operator</label>
        <select id="rs-prompt-logical-select" class="rs-prompt-logical-select">${optionsHtml}</select>
        <p class="rs-prompt-logical-explain">${this.escape(explain)}</p>
        <p class="rs-prompt-validation" hidden></p>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
        </div>
      </div>
    `;

    this.showOverlay(html);
    const root = document.querySelector('.rs-prompt-logical');

    const select = root?.querySelector('.rs-prompt-logical-select');
    const title = root?.querySelector('.rs-prompt-title');
    const explainEl = root?.querySelector('.rs-prompt-logical-explain');

    const updateExplain = () => {
      const op = normalizeLogicalOperator(select?.value);
      if (title) {
        title.textContent = op;
      }
      if (explainEl) {
        explainEl.textContent = explainLogicalOperator(op);
      }
    };

    select?.addEventListener('change', updateExplain);

    root?.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      const op = normalizeLogicalOperator(select?.value);
      this.clearInlineError(root);
      onSubmit(op);
      this.overlay.hide();
    });
  }

  openHash(options, onSubmit) {
    this.liveHash = '';

    const html = `
      <div class="rustscript-overlay rs-prompt-overlay rs-prompt-hash" data-action="hash">
        <h2 class="rs-prompt-title">Provide Text to Hash</h2>
        <textarea class="rs-prompt-hash-input" spellcheck="false" placeholder="Enter text to hash"></textarea>
        <div class="rs-prompt-hash-output-row">
          <output class="rs-prompt-hash-output" aria-live="polite">—</output>
          <button type="button" class="rs-prompt-copy-hash" title="Copy hash" aria-label="Copy hash">⎘</button>
        </div>
        <p class="rs-prompt-validation" hidden></p>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
        </div>
      </div>
    `;

    this.showOverlay(html);
    this.bindHash(onSubmit);
  }

  bindHash(onSubmit) {
    const root = document.querySelector('.rs-prompt-hash');
    const input = root?.querySelector('.rs-prompt-hash-input');
    const output = root?.querySelector('.rs-prompt-hash-output');

    const refreshHash = () => {
      const text = input?.value ?? '';
      if (!text.trim() || !this.app?.crypto?.hash) {
        this.liveHash = '';
        if (output) {
          output.textContent = '—';
        }
        return;
      }
      this.liveHash = this.app.crypto.hash(text);
      if (output) {
        output.textContent = this.liveHash;
      }
    };

    input?.addEventListener('input', () => {
      this.clearInlineError(root);
      refreshHash();
    });
    refreshHash();
    input?.focus();

    root?.querySelector('.rs-prompt-copy-hash')?.addEventListener('click', async () => {
      if (!this.liveHash) {
        return;
      }
      try {
        await navigator.clipboard.writeText(this.liveHash);
        siteMessage('Hash copied');
      } catch (err) {
        siteMessage('Could not copy hash');
      }
    });

    root?.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      refreshHash();
      if (!this.liveHash) {
        this.showInlineError(root, 'Enter text to hash — a digest will be generated above');
        return;
      }
      this.applyValidated(root, onSubmit, 'hash', this.liveHash);
    });
  }

  openPublicKey(options, onSubmit) {
    const currentValue = isPlaceholder(options?.currentValue) ? '' : String(options?.currentValue ?? '');

    const html = `
      <div class="rustscript-overlay rs-prompt-overlay rs-prompt-publickey-panel" data-action="publickey">
        <h2 class="rs-prompt-title">Provide Publickey</h2>
        <div class="rs-prompt-publickey-field">
          <input
            type="text"
            class="rs-prompt-value rs-prompt-publickey-input"
            value="${this.escape(currentValue)}"
            placeholder="hex public key"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="rs-prompt-publickey-actions">
            <button type="button" class="rs-prompt-use-mine">Use Mine</button>
          </div>
        </div>
        <p class="rs-prompt-validation" hidden></p>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
        </div>
      </div>
    `;

    this.showOverlay(html);
    this.bindPublicKey(onSubmit);
  }

  bindPublicKey(onSubmit) {
    const root = document.querySelector('.rs-prompt-publickey-panel');
    const input = root?.querySelector('input.rs-prompt-publickey-input');
    if (!input) {
      return;
    }

    input.focus();
    if (input.value) {
      input.select();
    }

    input.addEventListener('input', () => this.clearInlineError(root));

    root?.querySelector('.rs-prompt-use-mine')?.addEventListener('click', async () => {
      try {
        const pk = await this.app.wallet.getPublicKey();
        input.value = String(pk || '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this.clearInlineError(root);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (err) {
        this.showInlineError(root, err.message || 'Could not read wallet public key');
      }
    });

    root?.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      this.applyValidated(root, onSubmit, 'publickey', input.value);
    });
  }

  openSignature(options, onSubmit) {
    const meta = options?.meta || {};
    const currentValue = isPlaceholder(options?.currentValue) ? '' : String(options?.currentValue ?? '');
    const context = options?.context || {};
    const script = context.script || {};
    const lockingScript = typeof context.lockingScript === 'object' ? context.lockingScript : this.getLockingScript();
    const signableMsg = findSignableMessage(script, lockingScript);

    const html = `
      <div class="rustscript-overlay rs-prompt-overlay rs-prompt-signature" data-action="signature">
        <h2 class="rs-prompt-title">${meta.label || 'Signature'}</h2>
        <p class="rs-overlay-hint">${meta.hint || ''}</p>
        <label>Message to sign</label>
        <textarea class="rs-prompt-msg" spellcheck="false" placeholder="Message that was signed">${this.escape(signableMsg)}</textarea>
        <button type="button" class="rs-prompt-sign-wallet">Sign With My Key</button>
        <label>Signature (hex)</label>
        <textarea class="rs-prompt-value rs-prompt-signature-value" spellcheck="false" placeholder="hex signature">${this.escape(currentValue)}</textarea>
        <p class="rs-prompt-validation" hidden></p>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
        </div>
      </div>
    `;

    this.showOverlay(html);
    this.bindSignature(onSubmit);
  }

  bindSignature(onSubmit) {
    const root = document.querySelector('.rs-prompt-signature');
    const valueEl = root?.querySelector('.rs-prompt-signature-value');

    valueEl?.addEventListener('input', () => this.clearInlineError(root));

    root?.querySelector('.rs-prompt-sign-wallet')?.addEventListener('click', async () => {
      try {
        const msg = root?.querySelector('.rs-prompt-msg')?.value?.trim();
        if (!msg) {
          this.showInlineError(root, 'Enter a message to sign');
          return;
        }
        const privateKey = await this.app.wallet.getPrivateKey();
        const sig = await this.app.crypto.signMessage(msg, privateKey);
        if (valueEl) {
          valueEl.value = sig;
        }
        this.clearInlineError(root);
      } catch (err) {
        this.showInlineError(root, err.message || String(err));
      }
    });

    root?.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      this.applyValidated(root, onSubmit, 'signature', valueEl?.value);
    });
  }

  openTimestamp(options, onSubmit) {
    const meta = options?.meta || {};
    const currentValue = isPlaceholder(options?.currentValue) ? '' : String(options?.currentValue ?? '');

    const html = `
      <div class="rustscript-overlay rs-prompt-overlay rs-prompt-timestamp" data-action="timestamp">
        <h2 class="rs-prompt-title">${meta.label || 'Timestamp'}</h2>
        <p class="rs-overlay-hint">${meta.hint || ''}</p>
        <label>Timestamp (unix ms)</label>
        <input type="text" class="rs-prompt-value" value="${this.escape(currentValue)}" />
        <button type="button" class="rs-prompt-now">Use now</button>
        <p class="rs-prompt-validation" hidden></p>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
        </div>
      </div>
    `;

    this.showOverlay(html);
    const root = document.querySelector('.rs-prompt-timestamp');
    const input = root?.querySelector('.rs-prompt-value');

    input?.addEventListener('input', () => this.clearInlineError(root));

    root?.querySelector('.rs-prompt-now')?.addEventListener('click', () => {
      if (input) {
        input.value = String(Date.now());
        this.clearInlineError(root);
      }
    });

    root?.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      this.applyValidated(root, onSubmit, 'timestamp', input?.value);
    });
  }

  openGeneric(options, onSubmit) {
    const meta = options?.meta || {};
    const action = meta.action || options?.fieldKind || 'text';
    const title = meta.label || 'Edit value';
    const hint = meta.hint || '';
    const currentValue = isPlaceholder(options?.currentValue) ? '' : String(options?.currentValue ?? '');
    const kind = action === 'text' ? options?.fieldKind || 'text' : action;

    const html = `
      <div class="rustscript-overlay rs-prompt-overlay rs-prompt-generic" data-action="${action}">
        <h2 class="rs-prompt-title">${title}</h2>
        <p class="rs-overlay-hint">${hint}</p>
        <label>Value</label>
        <textarea class="rs-prompt-value" spellcheck="false">${this.escape(currentValue)}</textarea>
        <p class="rs-prompt-validation" hidden></p>
        <div class="overlay-actions overlay-actions-apply-only">
          <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
        </div>
      </div>
    `;

    this.showOverlay(html);
    const root = document.querySelector('.rs-prompt-generic');
    const input = root?.querySelector('.rs-prompt-value');

    input?.addEventListener('input', () => this.clearInlineError(root));

    root?.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
      const applyKind = ['publickey', 'hash', 'signature', 'timestamp'].includes(kind) ? kind : 'text';
      if (applyKind === 'text') {
        const s = String(input?.value ?? '').trim();
        if (!s || isPlaceholder(s)) {
          this.showInlineError(root, 'A value is required');
          return;
        }
        this.clearInlineError(root);
        onSubmit(s);
        this.overlay.hide();
        return;
      }
      this.applyValidated(root, onSubmit, applyKind, input?.value);
    });
  }

  escape(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

module.exports = PlaceholderPrompt;
