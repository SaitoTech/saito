module.exports = ({ title = '', body = '', actionLabel = '', action = '' } = {}) => {
  const bodyHtml = body ? `<p>${body}</p>` : '';
  const cta = actionLabel
    ? `<button type="button" class="saito-button-primary" data-action="${action || 'sell'}">${actionLabel}</button>`
    : '';

  return `
    <div class="empty">
      <h2>${title}</h2>
      ${bodyHtml}
      ${cta}
    </div>
  `;
};
