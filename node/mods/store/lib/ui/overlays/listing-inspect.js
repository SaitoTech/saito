const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const jsonTree = require('json-tree-viewer');

const COLLAPSE_KEYS = new Set([
  'image',
  'file',
  'js',
  'css',
  'rom',
  'zip',
  'wasm',
  'binary',
  'access_script'
]);
const LARGE_STRING = 4096;

function cloneForInspect(value, key = '') {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'string') {
    const collapse =
      value.length > LARGE_STRING ||
      (COLLAPSE_KEYS.has(String(key).toLowerCase()) && value.length > 200);
    if (collapse) {
      return {
        length: value.length,
        preview: `${value.slice(0, 120)}…`,
        value
      };
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => cloneForInspect(item, String(i)));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [nested_key, nested] of Object.entries(value)) {
      out[nested_key] = cloneForInspect(nested, nested_key);
    }
    return out;
  }
  return value;
}

function shouldCollapse(node) {
  const label = String(node?.label || '').toLowerCase();
  if (COLLAPSE_KEYS.has(label)) {
    return true;
  }
  const child_labels = (node?.childNodes || []).map((child) => String(child.label || ''));
  return child_labels.includes('preview') && child_labels.includes('value');
}

function expandFiltered(node) {
  if (!node?.isComplex) {
    return;
  }
  if (shouldCollapse(node)) {
    return;
  }
  if (typeof node.expand === 'function') {
    node.expand();
  }
  (node.childNodes || []).forEach((child) => expandFiltered(child));
}

class ListingInspectOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
  }

  open(summary) {
    if (!summary) {
      return;
    }

    this.overlay.show(`
      <div class="listing-inspect">
        <h2 class="listing-inspect-title">Inspect listing</h2>
        <p class="listing-inspect-status" data-inspect-status>Loading transaction…</p>
        <div class="listing-inspect-tree" data-inspect-tree></div>
      </div>
    `);

    const finish = (tx) => {
      const status = document.querySelector('.listing-inspect [data-inspect-status]');
      const host = document.querySelector('.listing-inspect [data-inspect-tree]');
      if (!host) {
        return;
      }

      const txmsg =
        (typeof tx?.returnMessage === 'function' ? tx.returnMessage() : tx?.msg) || null;
      if (!txmsg) {
        if (status) {
          status.textContent = 'Listing transaction message is unavailable.';
        }
        return;
      }

      if (status) {
        status.hidden = true;
      }

      let payload = {};
      try {
        payload = cloneForInspect(txmsg);
      } catch (err) {
        host.textContent = String(err?.message || err);
        return;
      }

      try {
        const tree = jsonTree.create(payload, host);
        if (tree?.rootNode) {
          expandFiltered(tree.rootNode);
        } else if (typeof tree?.expand === 'function') {
          tree.expand();
        }
      } catch (err) {
        host.textContent = String(err?.message || err);
      }
    };

    if (summary.listing_tx) {
      finish(summary.listing_tx);
      return;
    }

    if (typeof summary.ensureListingTransaction !== 'function') {
      finish(null);
      return;
    }

    summary
      .ensureListingTransaction()
      .then((loaded) => finish(loaded?.listing_tx || summary.listing_tx || null))
      .catch((err) => {
        const status = document.querySelector('.listing-inspect [data-inspect-status]');
        if (status) {
          status.textContent = err?.message || 'Unable to load listing transaction.';
        }
        if (typeof siteMessage === 'function') {
          siteMessage(err?.message || 'Unable to load listing transaction.', 4000);
        }
      });
  }
}

module.exports = ListingInspectOverlay;
