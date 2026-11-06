function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function identityTemplate(name) {
  const who = name ? `<p class="who">${escapeHTML(name)}</p>` : '';
  return `
    <form class="saitosign-identity">
      <p class="title">Is this you?</p>
      ${who}
      <div class="actions">
        <button type="button" data-identity="no">No</button>
        <button type="button" class="primary" data-identity="yes">Yes</button>
      </div>
    </form>
  `;
}

module.exports = identityTemplate;
