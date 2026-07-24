module.exports = ({
	title = '',
	body = '',
	actionLabel = '',
	actionIcon = '',
	action = ''
} = {}) => {
	const icon = actionIcon
		? `<i class="fa-solid ${actionIcon} action-icon" aria-hidden="true"></i>`
		: '';
	const cta = actionLabel
		? `<button type="button" class="saito-button-primary" data-action="${action || 'sell'}"><span>${actionLabel}</span>${icon}</button>`
		: '';
	const copy = body ? `<p>${body}</p>` : '';

	return `
    <div class="empty">
      <h2>${title}</h2>
      ${copy}
      ${cta}
    </div>
  `;
};
