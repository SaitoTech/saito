const { escapeHTML } = require('./publish.escape');

function methodsTemplate(methods, activeId) {
  const items = methods
    .map((method) => {
      const verified = method.status === 'verified';
      const selected = method.id === activeId ? ' selected' : '';
      const tone = verified ? ' verified' : method.required ? ' required' : '';
      const mark = verified || method.required
        ? '<i class="fa-solid fa-check" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
      const status = verified ? 'Verified' : method.required ? 'Required' : 'Not required';
      return `
        <button type="button" class="verify-method${selected}${tone}" data-publish-action="method" data-method="${escapeHTML(method.id)}">
          <span class="verify-mark" aria-hidden="true">${mark}</span>
          <span class="verify-copy">
            <span class="verify-name">${escapeHTML(method.title)}</span>
            <span class="verify-status">${status}</span>
          </span>
        </button>
      `;
    })
    .join('');

  return `<div class="verify-methods" role="list">${items}</div>`;
}

module.exports = methodsTemplate;
