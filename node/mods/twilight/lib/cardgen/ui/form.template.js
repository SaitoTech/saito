const actionBar = require('./action-bar.template');

function selected(current, value) {
  return String(current) === String(value) ? ' selected' : '';
}

function checked(condition) {
  return condition ? ' checked' : '';
}

function cardType(card) {
  if (card.non_card) {
    return 'programmable';
  }
  if (card.scoring) {
    return 'scoring';
  }
  return 'normal';
}

module.exports = (card) => {
  const font_sizes = [20, 19, 18, 17, 16, 15, 14];
  const player = card.player || 'both';
  const has_image = Boolean(card.image_url || card.image);
  const photo_border = card.image_style !== 'logo';
  const type = cardType(card);

  return `
    <form class="ts-form" autocomplete="off">
      <div class="ts-form-sections">
        <section class="ts-section" aria-labelledby="ts-section-identity">
          <h2 id="ts-section-identity" class="ts-section-title">Identity</h2>
          <div class="ts-identity-grid">
            <select class="ts-input" name="deck" aria-label="Deck">
              <option value="" disabled${card.deck === '' || card.deck == null ? ' selected' : ''}>Deck</option>
              <option value="0"${selected(card.deck, 0)}>Early War</option>
              <option value="1"${selected(card.deck, 1)}>Mid War</option>
              <option value="2"${selected(card.deck, 2)}>Late War</option>
            </select>
            <select class="ts-input" name="player" aria-label="Player">
              <option value="" disabled${!player ? ' selected' : ''}>Player</option>
              <option value="us"${selected(player, 'us')}>U.S.</option>
              <option value="ussr"${selected(player, 'ussr')}>U.S.S.R.</option>
              <option value="both"${selected(player, 'both')}>Neutral</option>
            </select>
            <select class="ts-input" name="card_type" aria-label="Type">
              <option value="" disabled${!type ? ' selected' : ''}>Type</option>
              <option value="normal"${selected(type, 'normal')}>Normal Card</option>
              <option value="scoring"${selected(type, 'scoring')}>Scoring Card</option>
              <option value="programmable"${selected(type, 'programmable')}>Programmable Event</option>
            </select>
            <label class="ts-field ts-identity-title">
              <input class="ts-input" name="title" type="text" value="${escapeAttr(card.title)}" placeholder="Title" aria-label="Title" />
            </label>
            <div class="ts-identity-metrics">
              <label class="ts-field">
                <span class="ts-label">Number</span>
                <input class="ts-input" name="card_id" type="text" maxlength="8" value="${escapeAttr(card.card_id)}" placeholder="100" />
              </label>
              <label class="ts-field">
                <span class="ts-label">Ops</span>
                <input class="ts-input" name="ops" type="text" maxlength="2" value="${escapeAttr(card.ops)}" placeholder="4" />
              </label>
            </div>
          </div>
        </section>

        <section class="ts-section" aria-labelledby="ts-section-attributes">
          <h2 id="ts-section-attributes" class="ts-section-title">Attributes &amp; Artwork</h2>
          <div class="ts-attr-art">
            <div class="ts-flag-stack">
              <label class="ts-check ts-check-plain">
                <input type="checkbox" name="removed"${checked(card.removed)} />
                <span>remove card after play</span>
              </label>
              <label class="ts-check ts-check-plain">
                <input type="checkbox" name="permanent"${checked(card.permanent)} />
                <span>card is permanent event</span>
              </label>
              <label class="ts-check ts-check-plain">
                <input type="checkbox" name="photo_border"${checked(photo_border)} />
                <span>Add border to image</span>
              </label>
            </div>
            <div class="ts-image-action">
              <button type="button" class="saito-button-secondary ts-add-image">
                ${has_image ? 'Change Image' : 'Add Image'}
              </button>
            </div>
          </div>
        </section>

        <section class="ts-section" aria-labelledby="ts-section-content">
          <h2 id="ts-section-content" class="ts-section-title">Card Content</h2>
          <div class="ts-field">
            <div class="ts-pre-event-row">
              <label class="ts-label" for="ts-pre-text">Pre-Event Text</label>
              <select class="ts-input ts-font-size" name="font_size" aria-label="Event font size">
                ${font_sizes
                  .map((size) => `<option value="${size}"${selected(card.font_size, size)}>${size}px</option>`)
                  .join('')}
              </select>
            </div>
            <input id="ts-pre-text" class="ts-input" name="pre_text" type="text" value="${escapeAttr(card.pre_text)}" placeholder="optional italic text" />
          </div>
          <label class="ts-field">
            <span class="ts-label">Event Text</span>
            <textarea class="ts-input ts-textarea" name="event" rows="3" placeholder="what does the card do?">${escapeText(card.event)}</textarea>
          </label>
          <label class="ts-field">
            <span class="ts-label">Event Paragraph 2</span>
            <textarea class="ts-input ts-textarea" name="event2" rows="2" placeholder="optional text">${escapeText(card.event2)}</textarea>
          </label>
          <label class="ts-field">
            <span class="ts-label">Event Paragraph 3</span>
            <textarea class="ts-input ts-textarea" name="event3" rows="2" placeholder="optional text">${escapeText(card.event3)}</textarea>
          </label>
          <label class="ts-field">
            <span class="ts-label">Post-Event Text</span>
            <input class="ts-input" name="post_text" type="text" value="${escapeAttr(card.post_text)}" placeholder="optional italic text" />
          </label>
        </section>
      </div>

      ${actionBar(`
        <button type="button" class="ts-action-btn ts-action-primary ts-download-png">Download Image</button>
      `)}
    </form>
  `;
};

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
