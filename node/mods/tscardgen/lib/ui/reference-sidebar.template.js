module.exports = (card = {}) => {
  const title = String(card.title || '').trim() || 'Untitled Card';
  const card_id = typeof card.generatedId === 'function' ? card.generatedId() : '';

  return `
  <aside class="ts-reference-sidebar" aria-label="Programming reference">
    <section class="ts-card-info" aria-label="Your new card">
      <h2 class="ts-card-info-title">Your New Card</h2>
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
    <h2 class="ts-reference-title">Programming Reference</h2>
    <nav class="ts-reference-nav" aria-label="Reference topics">
      <button type="button" class="ts-reference-link" data-ref="api">
        Programming API
      </button>
      <button type="button" class="ts-reference-link" data-ref="howto">
        How to Program a Card
      </button>
    </nav>
    <p class="ts-reference-note">
      Full documentation will live on the Saito Wiki. These entries open temporary reference material for now.
    </p>
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
