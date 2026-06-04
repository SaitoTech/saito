const SaitoOverlay = require('./../../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const SignatureFieldTemplate = require('./signature.template');
const { isPlaceholder } = require('../../script_build');

function pickPublicKey(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const s = value.trim();
  if (!s || isPlaceholder(s)) {
    return '';
  }
  return s;
}

function pickMessage(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const s = value.trim();
  if (!s || isPlaceholder(s)) {
    return '';
  }
  return s;
}

function getAtPath(root, pathParts) {
  let cursor = root;
  for (const key of pathParts) {
    if (cursor == null) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

function findSignatureContext(script, dotPath) {
  if (!script || !dotPath) {
    return { message: '', requiredPublicKeys: [] };
  }

  const pathParts = String(dotPath).split('.');
  let nodePath = pathParts.slice();
  const last = nodePath[nodePath.length - 1];

  if (last === 'signature') {
    nodePath.pop();
    if (nodePath[nodePath.length - 1] === 'witness' || nodePath[nodePath.length - 1] === 'required') {
      nodePath.pop();
    }
  } else if (typeof last === 'number' && nodePath[nodePath.length - 2] === 'signatures') {
    nodePath.pop();
    nodePath.pop();
    if (nodePath[nodePath.length - 1] === 'witness' || nodePath[nodePath.length - 1] === 'required') {
      nodePath.pop();
    }
  } else if (last === 'signatures') {
    nodePath.pop();
    if (nodePath[nodePath.length - 1] === 'witness' || nodePath[nodePath.length - 1] === 'required') {
      nodePath.pop();
    }
  }

  const node = getAtPath(script, nodePath);
  const requiredPublicKeys = [];

  if (node && typeof node === 'object') {
    const pk = pickPublicKey(node.publickey);
    if (pk) {
      requiredPublicKeys.push(pk);
    }
    if (Array.isArray(node.publickeys)) {
      for (const key of node.publickeys) {
        const k = pickPublicKey(key);
        if (k && !requiredPublicKeys.includes(k)) {
          requiredPublicKeys.push(k);
        }
      }
    }
  }

  const message = (node && pickMessage(node.msg ?? node.message)) || pickMessage(script?.msg ?? script?.message);

  return { message, requiredPublicKeys };
}

async function walletOwnsRequiredKey(app, requiredPublicKeys) {
  if (!Array.isArray(requiredPublicKeys) || requiredPublicKeys.length === 0) {
    return false;
  }
  try {
    let mine = '';
    if (typeof app.wallet?.getPublicKey === 'function') {
      mine = String((await app.wallet.getPublicKey()) || '').trim();
    } else if (typeof app.wallet?.returnPublicKey === 'function') {
      mine = String(app.wallet.returnPublicKey() || '').trim();
    }
    if (!mine) {
      return false;
    }
    return requiredPublicKeys.some((pk) => pk === mine);
  } catch (err) {
    return false;
  }
}

class SignatureFieldOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.path = '';
    this.currentValue = '';
    this.onApply = null;
  }

  async render() {
    const currentValue = isPlaceholder(this.currentValue) ? '' : String(this.currentValue ?? '');
    const sigCtx = findSignatureContext(this.mod.getScript(), this.path);
    const canAutoSign = await walletOwnsRequiredKey(this.app, sigCtx.requiredPublicKeys);
    const pkDisplay = sigCtx.requiredPublicKeys.length ? sigCtx.requiredPublicKeys.join(', ') : '—';
    const msgDisplay = sigCtx.message || '—';

    this.overlay.show(
      SignatureFieldTemplate({
        pkDisplay,
        msgDisplay,
        canAutoSign,
        currentValue
      })
    );
    this.attachEvents({ canAutoSign, message: sigCtx.message });
  }

  attachEvents(options = {}) {
    const host = this.overlay.overlay || document;
    const root = host.querySelector('.rs-prompt-signature');
    const valueEl = root?.querySelector('.rs-prompt-signature-value');
    const canAutoSign = options.canAutoSign === true;
    const message = String(options.message ?? '').trim();

    const validation = root?.querySelector('.rs-prompt-validation');

    const showError = (msg) => {
      if (!validation) {
        siteMessage(msg);
        return;
      }
      validation.hidden = false;
      validation.textContent = msg;
    };

    const clearError = () => {
      if (validation) {
        validation.hidden = true;
        validation.textContent = '';
      }
    };

    valueEl?.addEventListener('input', clearError);

    const signAndApply = async () => {
      try {
        if (!message) {
          showError('No signable message found for this opcode');
          return;
        }
        let sig = '';
        if (typeof this.app.wallet?.signMessage === 'function') {
          sig = await this.app.wallet.signMessage(message);
        } else if (typeof this.app.crypto?.signMessage === 'function') {
          const privateKey = await this.app.wallet.getPrivateKey();
          sig = await this.app.crypto.signMessage(message, privateKey);
        }
        clearError();
        if (typeof this.onApply === 'function') {
          this.onApply(sig);
        }
        this.overlay.hide();
      } catch (err) {
        showError(err.message || String(err));
      }
    };

    root?.querySelector('.rs-prompt-sign-wallet')?.addEventListener('click', () => {
      signAndApply();
    });

    if (!canAutoSign) {
      root?.querySelector('.rs-prompt-apply')?.addEventListener('click', () => {
        const next = String(valueEl?.value ?? '').trim();
        if (!next || isPlaceholder(next)) {
          showError('A value is required');
          return;
        }
        const ok = /^[0-9a-fA-F]+$/.test(next) && next.length >= 128;
        if (!ok) {
          showError('Expected hex signature bytes');
          return;
        }
        clearError();
        if (typeof this.onApply === 'function') {
          this.onApply(next);
        }
        this.overlay.hide();
      });
    }
  }
}

module.exports = SignatureFieldOverlay;
