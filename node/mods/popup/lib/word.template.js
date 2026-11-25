module.exports = (lesson, word, popup_self, saved = false) => {
  let audio = '';
  if (word.audio_source) {
    audio = `https://popupchinese.com/data/${lesson.id}/mp3/vocab/${word.audio_source}`;
  }

  const display = popup_self.app.options.popup.display || {};
  const vocab = popup_self.app.options.popup.vocab || {};
  const traditional = display.traditional == 1;
  const hide = (field, scriptHidden) => {
    if (vocab[field] == 0 || scriptHidden) {
      return ' hidden';
    }
    return '';
  };

  let pinyin = word.field3 || '';
  try {
    if (pinyin && typeof convert_pinyin === 'function') {
      pinyin = convert_pinyin(pinyin);
    }
  } catch (err) {}

  const chinese = `
          <span class="lesson_word_field1 field1"${hide('field1', traditional)}>${word.field1 || ''}</span>
          <span class="lesson_word_field2 field2"${hide('field2', !traditional)}>${word.field2 || ''}</span>`;
  const head = audio
    ? `<button type="button" class="popup-vocab-chinese" data-audio="${escapeAttr(audio)}">${chinese}</button>`
    : `<div class="popup-vocab-head">${chinese}</div>`;

  return `
    <li class="popup-vocab-entry word${saved ? ' is-saved' : ''}" role="button" tabindex="0" aria-pressed="${saved ? 'true' : 'false'}" data-field1="${escapeAttr(word.field1)}" data-field2="${escapeAttr(word.field2)}" data-field3="${escapeAttr(word.field3)}" data-field4="${escapeAttr(word.field4)}" data-field5="${escapeAttr(word.field5)}">
      <span class="popup-vocab-mark" aria-hidden="true"></span>
      <div class="popup-vocab-text">
        ${head}
        <div class="lesson_word_field3 field3"${hide('field3', false)}>${escapeText(pinyin)}</div>
        <div class="lesson_word_field4 field4"${hide('field4', false)}>${escapeText(word.field4 || '')}</div>
        <div class="lesson_word_field5 field5"${hide('field5', false)}>${escapeText(word.field5 || '')}</div>
      </div>
    </li>
  `;
};

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
