module.exports = ({ title = '', body = '', actionLabel = '', action = '' } = {}) => {
	const cta = actionLabel
		? `<button type="button" class="saito-button-primary" data-action="${action || 'sell'}">${actionLabel}</button>`
		: '';

	return `
    <div class="empty">
      <h2>${title}</h2>
      <p>${body}</p>
      ${cta}
    </div>
  `;
};
