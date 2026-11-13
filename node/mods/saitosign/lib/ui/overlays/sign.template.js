function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function signTemplate(view) {
  return `
    <form class="saitosign-sign">
      <p class="title">You are signing as:</p>
      <p class="name">${escapeHTML(view.name || '')}</p>
      <p class="email">${escapeHTML(view.email || '')}</p>
      <p class="sign-error" data-sign-error role="alert"></p>
      <div class="actions${view.signAll ? ' split' : ''}">
        ${view.signAll ? '<button type="button" class="secondary" data-sign-all>Sign All Pages</button>' : ''}
        <button type="submit" class="primary" data-sign-button>Sign</button>
      </div>
    </form>
  `;
}

module.exports = signTemplate;
