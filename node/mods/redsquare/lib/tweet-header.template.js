/**
 * Reusable tweet header.
 *
 * Modes (layout only — markup stays shared):
 *   compact  — timeline scan line: Username · time
 *   expanded — detail identity block:
 *                row 1: Username                    Timestamp
 *                row 2: Public key
 *   compose  — stacked name + instructional secondary (compose overlay)
 *
 * Callers should not need to know layout internals.
 */
function resolveMode({ mode, presentation } = {}) {
  if (mode === 'compact' || mode === 'expanded' || mode === 'compose') {
    return mode;
  }

  if (presentation === 'focused') {
    return 'expanded';
  }

  if (presentation === 'compose') {
    return 'compose';
  }

  return 'compact';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({
  mode,
  presentation,
  publicKey = '',
  name = '',
  handle = '',
  time = '',
  secondary = ''
} = {}) => {
  const resolvedMode = resolveMode({ mode, presentation });

  if (resolvedMode === 'compose') {
    const secondaryHtml = secondary
      ? `<span class="secondary saito-userline">${escapeHtml(secondary)}</span>`
      : '';

    return `
    <header class="header compose">
      <span class="primary saito-address" data-id="${escapeHtml(publicKey)}">${escapeHtml(name)}</span>
      ${secondaryHtml}
    </header>
  `;
  }

  if (resolvedMode === 'expanded') {
    const timeHtml = time ? `<time class="time saito-userline">${escapeHtml(time)}</time>` : '';
    const handleHtml = handle
      ? `<span class="handle saito-userline saito-add-user-menu" data-id="${escapeHtml(publicKey)}">${escapeHtml(handle)}</span>`
      : '';

    // Identity owns name, time, and key. Body is a sibling — never a time host.
    return `
    <header class="header expanded">
      <span class="primary saito-address" data-id="${escapeHtml(publicKey)}">${escapeHtml(name)}</span>
      ${timeHtml}
      ${handleHtml}
    </header>
  `;
  }

  // compact — Username · time (no public key on the timeline)
  const parts = [];

  parts.push(`<span class="primary saito-address" data-id="${escapeHtml(publicKey)}">${escapeHtml(name)}</span>`);

  if (time) {
    parts.push(`<span class="sep" aria-hidden="true">·</span>`);
    parts.push(`<time class="time saito-userline">${escapeHtml(time)}</time>`);
  }

  return `
    <header class="header compact">
      ${parts.join('\n      ')}
    </header>
  `;
};

module.exports.resolveMode = resolveMode;
