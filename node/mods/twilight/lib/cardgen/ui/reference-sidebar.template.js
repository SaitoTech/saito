module.exports = (card = {}) => {
  const title = String(card.title || '').trim() || 'Untitled Card';
  const card_id = typeof card.generatedId === 'function' ? card.generatedId() : '';

  return `
  <aside class="ts-reference-sidebar" aria-label="Card reference">
    <section class="ts-card-info" aria-label="Card details">
      <dl class="ts-card-info-list">
        <div class="ts-card-info-row">
          <dt>Title:</dt>
          <dd>${escapeHtml(title)}</dd>
        </div>
        <div class="ts-card-info-row">
          <dt>Card ID:</dt>
          <dd><code>${escapeHtml(card_id)}</code></dd>
        </div>
      </dl>
    </section>
    <nav class="ts-reference-nav" aria-label="Reference topics">
      <a
        class="ts-reference-link"
        href="https://wiki.saito.io/applications/twilight/api/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Programming API
      </a>
      <a
        class="ts-reference-link"
        href="https://wiki.saito.io/applications/twilight/api/queue"
        target="_blank"
        rel="noopener noreferrer"
      >
        Queue Commands
      </a>
    </nav>
  </aside>
`;
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
