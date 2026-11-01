function selected(current, value) {
  return Number(current) === Number(value) ? ' selected' : '';
}

function checked(condition) {
  return condition ? ' checked' : '';
}

module.exports = (card) => {
  const font_sizes = [20, 19, 18, 17, 16, 15, 14];

  return `
    <form class="ts-form" autocomplete="off">
      <header class="ts-form-header">
        <p class="ts-form-kicker">Twilight Struggle</p>
        <h1 class="ts-form-title">Card Generator</h1>
        <p class="ts-form-copy">Compose custom Early, Mid, and Late War cards. Preview updates as you edit.</p>
      </header>

      <div class="ts-form-grid">
        <label class="ts-field">
          <span class="ts-label">Card Number</span>
          <input class="ts-input" name="card_id" type="text" maxlength="8" value="${escapeAttr(card.card_id)}" placeholder="100" />
        </label>

        <label class="ts-field">
          <span class="ts-label">Ops</span>
          <input class="ts-input ts-input-narrow" name="ops" type="text" maxlength="2" value="${escapeAttr(card.ops)}" placeholder="4" />
        </label>

        <label class="ts-field">
          <span class="ts-label">Deck</span>
          <select class="ts-input" name="deck">
            <option value="0"${selected(card.deck, 0)}>Early War</option>
            <option value="1"${selected(card.deck, 1)}>Mid War</option>
            <option value="2"${selected(card.deck, 2)}>Late War</option>
          </select>
        </label>

        <label class="ts-field">
          <span class="ts-label">Association</span>
          <select class="ts-input" name="association">
            <option value="0"${selected(card.association, 0)}>USSR</option>
            <option value="1"${selected(card.association, 1)}>USA</option>
            <option value="2"${selected(card.association, 2)}>Neutral</option>
          </select>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Title</span>
          <input class="ts-input" name="title" type="text" value="${escapeAttr(card.title)}" placeholder="Wargames" />
        </label>

        <fieldset class="ts-field ts-field-span ts-fieldset">
          <legend class="ts-label">Image</legend>
          <input class="ts-file" name="image" type="file" accept="image/*" />
          <div class="ts-radio-row">
            <label class="ts-radio">
              <input type="radio" name="image_style" value="photo"${checked(card.image_style !== 'logo')} />
              <span>Photo border</span>
            </label>
            <label class="ts-radio">
              <input type="radio" name="image_style" value="logo"${checked(card.image_style === 'logo')} />
              <span>Logo</span>
            </label>
          </div>
          <p class="ts-hint">Images larger than 298×150 are scaled to fit.</p>
        </fieldset>

        <label class="ts-field">
          <span class="ts-label">Event Font Size</span>
          <select class="ts-input" name="font_size">
            ${font_sizes
              .map((size) => `<option value="${size}"${selected(card.font_size, size)}>${size}px</option>`)
              .join('')}
          </select>
        </label>

        <div class="ts-field ts-checks">
          <span class="ts-label">Flags</span>
          <label class="ts-check"><input type="checkbox" name="optional"${checked(card.optional)} /> Optional</label>
          <label class="ts-check"><input type="checkbox" name="removed"${checked(card.removed)} /> Removed</label>
          <label class="ts-check"><input type="checkbox" name="permanent"${checked(card.permanent)} /> Permanent</label>
        </div>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Pre-Event Text</span>
          <input class="ts-input" name="pre_text" type="text" value="${escapeAttr(card.pre_text)}" placeholder="Optional italic text" />
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Event</span>
          <textarea class="ts-input ts-textarea" name="event" rows="3" placeholder="What does the card do?">${escapeText(card.event)}</textarea>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Event Paragraph 2</span>
          <textarea class="ts-input ts-textarea" name="event2" rows="2" placeholder="Optional text">${escapeText(card.event2)}</textarea>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Event Paragraph 3</span>
          <textarea class="ts-input ts-textarea" name="event3" rows="2" placeholder="Optional text">${escapeText(card.event3)}</textarea>
        </label>

        <label class="ts-field ts-field-span">
          <span class="ts-label">Post-Event Text</span>
          <input class="ts-input" name="post_text" type="text" value="${escapeAttr(card.post_text)}" placeholder="Optional italic text" />
        </label>
      </div>

      <footer class="ts-form-footer">
        <button type="button" class="saito-button-primary small ts-redraw">Redraw</button>
        <a class="ts-reference" href="https://twilightstrategy.com/card-list/" target="_blank" rel="noopener noreferrer">Card list reference</a>
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
