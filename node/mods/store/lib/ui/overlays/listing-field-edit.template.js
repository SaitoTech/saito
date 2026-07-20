module.exports = ({ title = '', value = '', multiline = false, inputType = 'text', placeholder = '' } = {}) => {
	const safeTitle = String(title)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
	const safeValue = String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
	const safePlaceholder = String(placeholder)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;');

	const field = multiline
		? `<textarea id="saito-overlay-form-input" class="saito-textarea text-input" rows="6" placeholder="${safePlaceholder}">${safeValue}</textarea>`
		: `<input id="saito-overlay-form-input" class="saito-input text-input" type="${inputType}" value="${safeValue}" placeholder="${safePlaceholder}" />`;

	return `
    <form class="saito-overlay-form store-listing-field-edit">
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">${safeTitle}</div>
      </div>
      ${field}
      <div class="saito-button-row">
        <button type="button" class="saito-button-secondary" data-action="cancel">Cancel</button>
        <button type="submit" class="saito-button-primary saito-overlay-form-submit" id="saito-overlay-submit">Save</button>
      </div>
    </form>
  `;
};
