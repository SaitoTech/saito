function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function keyPreviewHTML(you) {
  if (!you || !you.publicKey) {
    return '';
  }
  const icon = you.identicon
    ? `<div class="saito-identicon-box"><img class="saito-identicon" src="${escapeHTML(you.identicon)}" alt=""></div>`
    : '';
  return `
    <div class="key-preview key-preview--enter-active" data-key-preview>
      <div class="saito-user">
        ${icon}
        <div class="saito-address" title="${escapeHTML(you.publicKey)}">${escapeHTML(you.publicKey)}</div>
        <div class="saito-userline">${escapeHTML(you.email || you.name || '')}</div>
      </div>
    </div>
  `;
}

module.exports = { escapeHTML, keyPreviewHTML };
