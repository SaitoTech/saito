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
      <p class="instruction">Click the button below to sign</p>
      <div class="actions">
        <button type="submit" class="primary">Sign</button>
      </div>
    </form>
  `;
}

module.exports = signTemplate;
