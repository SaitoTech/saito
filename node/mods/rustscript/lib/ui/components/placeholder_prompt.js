const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const { isPlaceholder } = require('./placeholder_utils');
const { findSignableMessage } = require('./field_validation');

class PlaceholderPrompt {
  constructor(app, mod, options = {}) {
    this.app = app;
    this.mod = mod;
    this.getLockingScript = options.getLockingScript || (() => ({}));
    this.overlay = new SaitoOverlay(app, mod, false);
    this.pendingHash = null;
  }

  open(options, onSubmit) {
    const meta = options?.meta || {};
    const action = meta.action || options?.fieldKind || 'text';
    const title = meta.label || 'Edit value';
    const hint = meta.hint || '';
    const currentValue = isPlaceholder(options?.currentValue) ? '' : String(options?.currentValue ?? '');
    const context = options?.context || {};
    const script = context.script || {};
    const lockingScript = typeof context.lockingScript === 'object' ? context.lockingScript : this.getLockingScript();

    this.pendingHash = null;
    const signableMsg = action === 'signature' ? findSignableMessage(script, lockingScript) : '';

    let body = '';

    if (action === 'signature') {
      body = `
        <label>Message to sign</label>
        <textarea class="rs-prompt-msg" spellcheck="false" placeholder="Message that was signed">${this.escape(signableMsg || 'hello world')}</textarea>
        ${signableMsg ? '<p class="rs-prompt-note">Detected from your script — adjust if needed.</p>' : ''}
        <div class="rs-prompt-sign-row">
          <button type="button" class="rs-prompt-sign-wallet rs-prompt-primary">Sign With My Key</button>
        </div>
        <label>Signature (hex)</label>
        <textarea class="rs-prompt-value" spellcheck="false" placeholder="hex signature">${this.escape(currentValue)}</textarea>
        <div class="rs-prompt-preview rs-prompt-preview-sig" hidden>
          <label>Generated signature</label>
          <textarea class="rs-prompt-preview-value" readonly spellcheck="false"></textarea>
          <button type="button" class="rs-prompt-use-preview">Use this signature</button>
        </div>
      `;
    } else if (action === 'hash') {
      body = `
        <label>Input to hash</label>
        <textarea class="rs-prompt-msg" spellcheck="false" placeholder="secret or preimage"></textarea>
        <div class="rs-prompt-hash-row">
          <button type="button" class="rs-prompt-generate-hash rs-prompt-primary">Generate Hash</button>
        </div>
        <div class="rs-prompt-preview rs-prompt-preview-hash" hidden>
          <label>Generated hash (Blake3)</label>
          <textarea class="rs-prompt-preview-value" readonly spellcheck="false"></textarea>
          <button type="button" class="rs-prompt-use-preview">Use this hash</button>
        </div>
        <label>Hash value</label>
        <textarea class="rs-prompt-value" spellcheck="false" placeholder="64-char hex">${this.escape(currentValue)}</textarea>
      `;
    } else if (action === 'timestamp') {
      body = `
        <label>Timestamp (unix ms)</label>
        <input type="text" class="rs-prompt-value" value="${this.escape(currentValue)}" />
        <button type="button" class="rs-prompt-now">Use now</button>
      `;
    } else if (action === 'publickey') {
      body = `
        <label>Public key</label>
        <input type="text" class="rs-prompt-value rs-prompt-publickey" value="${this.escape(currentValue)}" placeholder="hex public key" autocomplete="off" />
        <button type="button" class="rs-prompt-use-wallet">Use my wallet public key</button>
      `;
    } else {
      body = `
        <label>Value</label>
        <textarea class="rs-prompt-value" spellcheck="false">${this.escape(currentValue)}</textarea>
      `;
    }

    const html = `
      <div class="rustscript-overlay rs-prompt-overlay" data-action="${action}">
        <h2>${title}</h2>
        <p class="rs-overlay-hint">${hint}</p>
        ${body}
        <p class="rs-prompt-validation" hidden></p>
        <div class="overlay-actions">
          <button type="button" class="rs-prompt-apply rs-prompt-primary">Apply</button>
          <button type="button" class="rs-prompt-cancel">Cancel</button>
        </div>
      </div>
    `;

    this.overlay.show(html);
    this.bindCommon(action, onSubmit);

    if (action === 'publickey') {
      this.bindPublicKeyOverlay(currentValue);
    } else if (action === 'signature') {
      this.bindSignatureOverlay();
    } else if (action === 'hash') {
      this.bindHashOverlay();
    }
  }

  bindCommon(action, onSubmit) {
    document.querySelector('.rs-prompt-cancel')?.addEventListener('click', () => {
      this.overlay.hide();
    });

    document.querySelector('.rs-prompt-now')?.addEventListener('click', () => {
      const el = document.querySelector('.rs-prompt-value');
      if (el) {
        el.value = String(Date.now());
        this.refreshValidation(action);
      }
    });

    const valueEl = document.querySelector('.rs-prompt-value');
    valueEl?.addEventListener('input', () => this.refreshValidation(action));

    document.querySelector('.rs-prompt-apply')?.addEventListener('click', async () => {
      try {
        const value = await this.resolveValue(action);
        onSubmit(value);
        this.overlay.hide();
      } catch (err) {
        this.showValidation(err.message || String(err));
      }
    });
  }

  bindPublicKeyOverlay(currentValue) {
    const input = document.querySelector('.rs-prompt-value.rs-prompt-publickey');
    if (!input) {
      return;
    }

    const applyWalletDefault = async () => {
      if (currentValue?.trim() && !isPlaceholder(currentValue)) {
        return;
      }
      try {
        const pk = await this.app.wallet?.getPublicKey?.();
        if (pk && !input.value.trim()) {
          input.value = pk;
        }
      } catch (err) {
        /* optional */
      }
    };

    applyWalletDefault().then(() => {
      input.focus();
      input.select();
    });

    document.querySelector('.rs-prompt-use-wallet')?.addEventListener('click', async () => {
      try {
        const pk = await this.app.wallet.getPublicKey();
        input.value = pk;
        input.focus();
        this.refreshValidation('publickey');
      } catch (err) {
        siteMessage(err.message || 'Could not read wallet public key');
      }
    });
  }

  bindSignatureOverlay() {
    document.querySelector('.rs-prompt-sign-wallet')?.addEventListener('click', async () => {
      try {
        const msgEl = document.querySelector('.rs-prompt-msg');
        const msg = msgEl?.value?.trim();
        if (!msg) {
          throw new Error('Enter a message to sign');
        }
        const privateKey = await this.app.wallet.getPrivateKey();
        const sig = await this.app.crypto.signMessage(msg, privateKey);

        const preview = document.querySelector('.rs-prompt-preview-sig');
        const previewVal = preview?.querySelector('.rs-prompt-preview-value');
        const valueEl = document.querySelector('.rs-prompt-value');

        if (previewVal) {
          previewVal.value = sig;
        }
        if (valueEl) {
          valueEl.value = sig;
        }
        preview?.removeAttribute('hidden');
        this.refreshValidation('signature');
        siteMessage('Signature generated — review and Apply');
      } catch (err) {
        siteMessage(err.message || String(err));
      }
    });

    document.querySelector('.rs-prompt-preview-sig .rs-prompt-use-preview')?.addEventListener('click', () => {
      const previewVal = document.querySelector('.rs-prompt-preview-sig .rs-prompt-preview-value');
      const valueEl = document.querySelector('.rs-prompt-value');
      if (previewVal && valueEl) {
        valueEl.value = previewVal.value;
        valueEl.focus();
        this.refreshValidation('signature');
      }
    });
  }

  bindHashOverlay() {
    document.querySelector('.rs-prompt-generate-hash')?.addEventListener('click', () => {
      try {
        const msgEl = document.querySelector('.rs-prompt-msg');
        const input = msgEl?.value?.trim();
        if (!input) {
          throw new Error('Enter input to hash');
        }
        if (!this.app?.crypto?.hash) {
          throw new Error('Hashing is not available');
        }

        const hash = this.app.crypto.hash(input);
        this.pendingHash = hash;

        const preview = document.querySelector('.rs-prompt-preview-hash');
        const previewVal = preview?.querySelector('.rs-prompt-preview-value');
        if (previewVal) {
          previewVal.value = hash;
        }
        preview?.removeAttribute('hidden');
        siteMessage('Hash generated — review, then Use or Apply');
      } catch (err) {
        siteMessage(err.message || String(err));
      }
    });

    document.querySelector('.rs-prompt-preview-hash .rs-prompt-use-preview')?.addEventListener('click', () => {
      const previewVal = document.querySelector('.rs-prompt-preview-hash .rs-prompt-preview-value');
      const valueEl = document.querySelector('.rs-prompt-value');
      if (previewVal && valueEl) {
        valueEl.value = previewVal.value;
        valueEl.focus();
        this.refreshValidation('hash');
      }
    });
  }

  refreshValidation(action) {
    const valueEl = document.querySelector('.rs-prompt-value');
    const raw = valueEl?.value ?? '';
    if (!raw.trim()) {
      this.showValidation('', false);
      valueEl?.classList.remove('rs-prompt-invalid');
      return;
    }

    const { validateField } = require('./field_validation');
    const result = validateField(action, raw);
    valueEl?.classList.toggle('rs-prompt-invalid', result.state === 'warn');
    if (result.state === 'warn') {
      this.showValidation(result.message || 'Value may be malformed', true);
    } else {
      this.showValidation('', false);
    }
  }

  showValidation(message, show = true) {
    const el = document.querySelector('.rs-prompt-validation');
    if (!el) {
      return;
    }
    if (!show || !message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  async resolveValue(action) {
    const valueEl = document.querySelector('.rs-prompt-value');
    const msgEl = document.querySelector('.rs-prompt-msg');

    if (action === 'hash') {
      const raw = valueEl?.value?.trim();
      if (!raw) {
        throw new Error('Hash value is required — generate or paste');
      }
      return raw;
    }

    if (action === 'signature') {
      const pasted = valueEl?.value?.trim();
      if (pasted && !isPlaceholder(pasted)) {
        return pasted;
      }
      throw new Error('Provide or generate a signature');
    }

    const raw = valueEl?.value ?? '';
    if (!String(raw).trim()) {
      throw new Error('Value is required');
    }

    if (action === 'timestamp' && msgEl) {
      /* timestamp uses value only */
    }

    return raw.trim();
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
