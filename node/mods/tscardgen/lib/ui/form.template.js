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
      <div class="ts-form-grid">
        <label class="ts-field ts-field-span">
          <span class="ts-label">Title</span>
          <input class="ts-input" name="title" type="text" value="${escapeAttr(card.title)}" placeholder="Wargames" />
        </label>

        <div class="ts-field ts-field-span ts-row-three">
          <label class="ts-field">
            <span class="ts-label">Deck</span>
            <select class="ts-input" name="deck">
              <option value="0"${selected(card.deck, 0)}>Early War</option>
              <option value="1"${selected(card.deck, 1)}>Mid War</option>
              <option value="2"${selected(card.deck, 2)}>Late War</option>
            </select>
          </label>

          <label class="ts-field">
            <span class="ts-label">Player</span>
            <select class="ts-input" name="player">
              <option value="us"${selected(player, 'us')}>U.S.</option>
              <option value="ussr"${selected(player, 'ussr')}>U.S.S.R.</option>
              <option value="both"${selected(player, 'both')}>Neutral</option>
            </select>
          </label>

          <label class="ts-field">
            <span class="ts-label">Type</span>
            <select class="ts-input" name="card_type">
              <option value="normal"${selected(type, 'normal')}>Normal Card</option>
              <option value="scoring"${selected(type, 'scoring')}>Scoring Card</option>
              <option value="programmable"${selected(type, 'programmable')}>Programmable Event</option>
            </select>
          </label>
        </div>

        <div class="ts-field ts-field-span ts-row-controls">
          <label class="ts-field ts-field-compact">
            <span class="ts-label">Number</span>
            <input class="ts-input ts-input-compact" name="card_id" type="text" maxlength="8" value="${escapeAttr(card.card_id)}" placeholder="100" />
          </label>

          <label class="ts-field ts-field-compact">
            <span class="ts-label">Ops</span>
            <input class="ts-input ts-input-compact" name="ops" type="text" maxlength="2" value="${escapeAttr(card.ops)}" placeholder="4" />
          </label>

          <div class="ts-image-action">
            <button type="button" class="saito-button-secondary ts-add-image">
              ${has_image ? 'Change Image' : 'Add Image'}
            </button>
            <label class="ts-check ts-check-plain">
              <input type="checkbox" name="photo_border"${checked(photo_border)} />
              <span>Add border to image</span>
            </label>
          </div>

          <div class="ts-flag-stack">
            <label class="ts-check ts-check-plain">
              <input type="checkbox" name="removed"${checked(card.removed)} />
              <span>Remove after play</span>
            </label>
            <label class="ts-check ts-check-plain">
              <input type="checkbox" name="permanent"${checked(card.permanent)} />
              <span>Permanent event</span>
            </label>
          </div>
        </div>

        <label class="ts-field">
          <span class="ts-label">Event Font Size</span>
          <select class="ts-input" name="font_size">
            ${font_sizes
              .map((size) => `<option value="${size}"${selected(card.font_size, size)}>${size}px</option>`)
              .join('')}
          </select>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Pre-Event Text</span>
          <input class="ts-input" name="pre_text" type="text" value="${escapeAttr(card.pre_text)}" placeholder="optional italic text" />
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Event</span>
          <textarea class="ts-input ts-textarea" name="event" rows="3" placeholder="what does the card do?">${escapeText(card.event)}</textarea>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Event Paragraph 2</span>
          <textarea class="ts-input ts-textarea" name="event2" rows="2" placeholder="optional text">${escapeText(card.event2)}</textarea>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Event Paragraph 3</span>
          <textarea class="ts-input ts-textarea" name="event3" rows="2" placeholder="optional text">${escapeText(card.event3)}</textarea>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Post-Event Text</span>
          <input class="ts-input" name="post_text" type="text" value="${escapeAttr(card.post_text)}" placeholder="optional italic text" />
        </label>
      </div>

      <footer class="ts-form-footer">
        <button type="button" class="saito-button-secondary ts-download-png">Download PNG</button>
        <button type="button" class="saito-button-primary ts-create-nft">Create NFT</button>
      </footer>
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
