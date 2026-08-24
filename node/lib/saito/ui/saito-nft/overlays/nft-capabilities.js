/**
 * NFT capability registry — actions in the floating toolbar over artwork.
 *
 * Built-ins live here. Modules may:
 *   - call overlay.capabilities.register({ id, icon, label, description, visible, onActivate })
 *   - or respondTo('saito-nft-capabilities') with one capability object, or
 *     { capabilities: [ ... ] } for several
 *
 * Each capability renders as `.saito-nft-capability[data-capability="<id>"]`
 * inside `.saito-nft-capabilities`. Action hooks keep legacy class names
 * (send-nft, sell-nft, …) for wiring.
 *
 * DOWNLOAD asks respondTo('saito-nft-download') first; otherwise falls back to
 * nft.image or the serialized NFT transaction.
 */

function triggerBrowserDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename || 'download';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const BUILTIN_CAPABILITIES = [
  {
    id: 'transfer',
    icon: 'fa-solid fa-paper-plane',
    label: 'Transfer',
    description: 'Transfer this NFT to another wallet.',
    className: 'send-nft',
    visible: () => true
  },
  {
    id: 'list',
    icon: 'fa-solid fa-cart-shopping',
    label: 'Sell',
    description: 'List this NFT for sale in the Saito Store.',
    className: 'sell-nft',
    visible: (ctx) => Boolean(ctx.app.modules?.returnFirstRespondTo?.('saito-sell-nft'))
  },
  {
    id: 'download',
    icon: 'fa-solid fa-download',
    label: 'Download',
    description: 'Download the media associated with this NFT.',
    className: 'download-nft',
    visible: () => true,
    onActivate: async (ctx) => {
      const { app, nft } = ctx;
      if (!nft) {
        return;
      }

      const handler = app.modules.returnFirstRespondTo('saito-nft-download', nft);
      if (typeof handler?.download === 'function') {
        await handler.download(app, nft);
        return;
      }

      if (nft.image) {
        let filename = String(nft.title || 'nft-image').replace(/[^\w.-]+/g, '_') || 'nft-image';
        const mimeMatch = String(nft.image).match(/^data:([^;,]+)/);
        if (mimeMatch && !filename.includes('.')) {
          const ext = mimeMatch[1].split('/')[1]?.split('+')[0] || 'bin';
          filename = `${filename}.${ext}`;
        }
        triggerBrowserDownload(nft.image, filename);
        return;
      }

      if (nft.tx && typeof nft.tx.serialize_to_web === 'function') {
        const json = nft.tx.serialize_to_web(app);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const sig = String(nft.tx.signature || nft.tx_sig || 'unknown')
          .replace(/[^\w.-]+/g, '_')
          .slice(0, 12);
        triggerBrowserDownload(url, `nft-${sig}.saito`);
        URL.revokeObjectURL(url);
        return;
      }

      siteMessage('Nothing available to download', 2000);
    }
  },
  {
    id: 'details',
    icon: 'fa-solid fa-circle-info',
    label: 'Details',
    description: 'View NFT metadata, slips, and advanced options.',
    className: 'details-nft',
    visible: () => true,
    onActivate: (ctx) => {
      const p = document.querySelector('.saito-nft-overlay.panels');
      if (!p) {
        return;
      }
      if (p.classList.contains('saito-nft-mode-info')) {
        p.classList.remove('saito-nft-mode-info');
        ctx.overlay?.capabilities?.setActive('');
      } else {
        p.classList.add('saito-nft-mode-info');
        p.classList.remove('saito-nft-mode-send');
      }
    }
  },
  {
    id: 'enable',
    icon: 'fa-solid fa-toggle-on',
    label: 'Enable',
    description: 'Enable this NFT as a theme or script on your wallet.',
    className: 'enable-nft',
    visible: (ctx) => {
      if (!(ctx.nft?.css || ctx.nft?.js)) {
        return false;
      }
      const enabled = ctx.app.options?.permissions?.nfts || [];
      return !enabled.includes(ctx.nft.tx_sig);
    }
  },
  {
    id: 'disable',
    icon: 'fa-solid fa-toggle-off',
    label: 'Disable',
    description: 'Disable this NFT theme or script on your wallet.',
    className: 'disable-nft',
    visible: (ctx) => {
      if (!(ctx.nft?.css || ctx.nft?.js)) {
        return false;
      }
      const enabled = ctx.app.options?.permissions?.nfts || [];
      return enabled.includes(ctx.nft.tx_sig);
    }
  }
];

class NFTCapabilities {
  constructor(app, mod, overlay) {
    this.app = app;
    this.mod = mod;
    this.overlay = overlay;
    /** @type {Array<object>} */
    this.registered = [];
    this.active_id = '';
  }

  /**
   * Register an extra capability (e.g. from a specialized NFT type).
   * Replaces an existing entry with the same id.
   */
  register(capability = {}) {
    if (!capability.id || !capability.icon || !capability.label) {
      return;
    }

    this.registered = this.registered.filter((c) => c.id !== capability.id);
    this.registered.push(capability);
  }

  context() {
    return {
      app: this.app,
      mod: this.mod,
      overlay: this.overlay,
      nft: this.overlay?.nft
    };
  }

  /**
   * Ordered visible capabilities for the current NFT.
   */
  list() {
    const ctx = this.context();
    const peers = this.app.modules?.getRespondTos?.('saito-nft-capabilities', ctx) || [];
    const peerList = [];
    for (const p of peers) {
      if (Array.isArray(p?.capabilities)) {
        peerList.push(...p.capabilities);
      } else if (p?.id && p?.icon && p?.label) {
        peerList.push(p);
      }
    }

    const merged = [];
    const seen = new Set();

    for (const cap of [...BUILTIN_CAPABILITIES, ...this.registered, ...peerList]) {
      if (!cap?.id || seen.has(cap.id)) {
        continue;
      }
      const visible = typeof cap.visible === 'function' ? cap.visible(ctx) : cap.visible !== false;
      if (!visible) {
        continue;
      }
      seen.add(cap.id);
      merged.push(cap);
    }

    return merged;
  }

  renderHtml() {
    return this.list()
      .map((cap) => {
        const actionClass = cap.className ? ` ${cap.className}` : '';
        return `
        <button
          type="button"
          class="saito-nft-capability saito-large-square-button saito-glass${actionClass}"
          data-capability="${cap.id}"
          data-description="${String(cap.description || cap.label).replace(/"/g, '&quot;')}"
          aria-label="${cap.label}"
          aria-pressed="false"
        >
          <span class="saito-icon-button">
            <i class="${cap.icon}" aria-hidden="true"></i>
          </span>
          <span class="saito-nft-capability-label">${cap.label}</span>
        </button>
      `;
      })
      .join('');
  }

  footerMetaHtml(nft) {
    const type = nft?.returnType?.() || nft?.nft_type || 'NFT';
    const creator = nft?.creator || '—';
    const id = nft?.id || '—';
    const shortId = id.length > 18 ? `${id.slice(0, 18)}…` : id;
    const shortCreator =
      creator.length > 14 ? `${creator.slice(0, 8)}…${creator.slice(-4)}` : creator;

    return `
      <div class="meta-col">
        <span class="meta-label">Type</span>
        <span class="meta-value">${type}</span>
      </div>
      <div class="meta-col">
        <span class="meta-label">Creator</span>
        <span class="meta-value">${shortCreator}</span>
      </div>
      <div class="meta-col">
        <span class="meta-label">ID</span>
        <span class="meta-value">${shortId}</span>
      </div>
    `;
  }

  showDescription(text = '') {
    const desc = document.querySelector('.saito-nft-panel-view .saito-nft-capability-desc');
    if (!desc) {
      return;
    }
    desc.textContent = text || '';
    desc.classList.toggle('is-empty', !text);
  }

  setActive(id = '') {
    const root = document.querySelector('.saito-nft-panel-view .saito-nft-capabilities');
    if (!root) {
      return;
    }

    this.active_id = id || '';

    root.querySelectorAll('.saito-nft-capability').forEach((btn) => {
      const on = btn.getAttribute('data-capability') === this.active_id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (this.active_id) {
      const btn = root.querySelector(`[data-capability="${this.active_id}"]`);
      this.showDescription(btn?.getAttribute('data-description') || '');
    } else {
      this.showDescription('');
    }
  }

  attachEvents() {
    const root = document.querySelector('.saito-nft-panel-view .saito-nft-capabilities');
    if (!root || root.dataset.capabilitiesBound === '1') {
      return;
    }

    root.dataset.capabilitiesBound = '1';

    root.addEventListener('pointerover', (e) => {
      const btn = e.target.closest('.saito-nft-capability');
      if (!btn || !root.contains(btn)) {
        return;
      }
      this.showDescription(btn.getAttribute('data-description') || '');
    });

    root.addEventListener('pointerleave', () => {
      if (this.active_id) {
        const btn = root.querySelector(`[data-capability="${this.active_id}"]`);
        this.showDescription(btn?.getAttribute('data-description') || '');
      } else {
        this.showDescription('');
      }
    });

    root.addEventListener('focusin', (e) => {
      const btn = e.target.closest('.saito-nft-capability');
      if (!btn || !root.contains(btn)) {
        return;
      }
      this.showDescription(btn.getAttribute('data-description') || '');
    });

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.saito-nft-capability');
      if (!btn || !root.contains(btn)) {
        return;
      }

      const id = btn.getAttribute('data-capability');
      this.setActive(id);

      const cap = this.list().find((c) => c.id === id);
      if (typeof cap?.onActivate === 'function') {
        e.preventDefault();
        cap.onActivate(this.context());
      }
    });
  }
}

module.exports = NFTCapabilities;
