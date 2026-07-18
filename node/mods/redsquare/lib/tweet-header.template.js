/**
 * Reusable tweet header.
 *
 * Modes (layout only — markup stays shared):
 *   compact  — one line identity group: Username · time
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
      ? `<span class="secondary saito-userline">${secondary}</span>`
      : '';

    return `
    <header class="header compose">
      <span class="primary saito-address">${name}</span>
      ${secondaryHtml}
    </header>
  `;
  }

  if (resolvedMode === 'expanded') {
    const handleHtml = handle
      ? `<span class="handle saito-userline">${handle}</span>`
      : '';

    return `
    <header class="header expanded">
      <span class="primary saito-address">${name}</span>
      ${handleHtml}
    </header>
  `;
  }

  // compact — identity group: Username · time
  const parts = [];

  parts.push(`<span class="primary saito-address">${name}</span>`);

  if (time) {
    parts.push(`<span class="sep time" aria-hidden="true">·</span>`);
    parts.push(`<time class="time saito-userline">${time}</time>`);
  }

  return `
    <header class="header compact">
      ${parts.join('\n      ')}
    </header>
  `;
};

module.exports.resolveMode = resolveMode;
