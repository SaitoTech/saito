/**
 * Reusable tweet header.
 *
 * Modes (layout only — markup stays shared):
 *   compact  — one line: Username · @publickey · time
 *   expanded — two lines: Username / @publickey
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

module.exports = ({
  mode,
  presentation,
  name = '',
  handle = '',
  time = '',
  secondary = ''
} = {}) => {
  const resolvedMode = resolveMode({ mode, presentation });

  if (resolvedMode === 'compose') {
    const secondaryHtml = secondary
      ? `<span class="tweet-header-secondary saito-userline">${secondary}</span>`
      : '';

    return `
    <header class="tweet-header compose">
      <span class="tweet-header-primary saito-address">${name}</span>
      ${secondaryHtml}
    </header>
  `;
  }

  if (resolvedMode === 'expanded') {
    const handleHtml = handle
      ? `<span class="tweet-header-handle saito-userline">${handle}</span>`
      : '';

    return `
    <header class="tweet-header expanded">
      <span class="tweet-header-primary saito-address">${name}</span>
      ${handleHtml}
    </header>
  `;
  }

  // compact — Username · @publickey · time (time pinned right; handle truncates)
  const parts = [];

  parts.push(`<span class="tweet-header-primary saito-address">${name}</span>`);

  if (handle) {
    parts.push(`<span class="tweet-header-sep" aria-hidden="true">·</span>`);
    parts.push(`<span class="tweet-header-handle saito-userline">${handle}</span>`);
  }

  if (time) {
    parts.push(`<span class="tweet-header-sep tweet-header-sep-time" aria-hidden="true">·</span>`);
    parts.push(`<time class="tweet-header-time saito-userline">${time}</time>`);
  }

  return `
    <header class="tweet-header compact">
      ${parts.join('\n      ')}
    </header>
  `;
};

module.exports.resolveMode = resolveMode;
