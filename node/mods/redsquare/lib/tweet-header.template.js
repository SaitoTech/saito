/**
 * Reusable tweet header.
 *
 * Callers pass opaque line content — no context branching here.
 * Presentation class (timeline | focused | root | reply | embedded | compose)
 * is styling only.
 */
module.exports = ({ presentation = 'timeline', name = '', secondary = '' } = {}) => {
  const secondaryHtml = secondary
    ? `<span class="tweet-header-secondary saito-userline">${secondary}</span>`
    : '';

  return `
    <header class="tweet-header ${presentation}">
      <span class="tweet-header-primary saito-address">${name}</span>
      ${secondaryHtml}
    </header>
  `;
};
