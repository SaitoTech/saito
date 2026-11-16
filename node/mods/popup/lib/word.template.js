module.exports = (lesson, word, popup_self) => {
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

  const play = audio
    ? `<button type="button" class="popup-vocab-play" onclick="playWordAudio('${escapeAttr(audio)}', this)" aria-label="Play pronunciation"><img src="/popup/img/buttons/play_button.gif" alt=""></button>`
    : '<span class="popup-vocab-play"></span>';

  return `
    <li class="popup-vocab-entry word">
      <div class="popup-vocab-text">
        <div class="popup-vocab-head">
          <span class="lesson_word_field1 field1"${hide('field1', traditional)}>${word.field1 || ''}</span>
          <span class="lesson_word_field2 field2"${hide('field2', !traditional)}>${word.field2 || ''}</span>
        </div>
        <div class="lesson_word_field3 field3"${hide('field3', false)}>${escapeText(pinyin)}</div>
        <div class="lesson_word_field4 field4"${hide('field4', false)}>${escapeText(word.field4 || '')}</div>
        <div class="lesson_word_field5 field5"${hide('field5', false)}>${escapeText(word.field5 || '')}</div>
      </div>
      <div class="popup-vocab-actions">
        ${play}
        <button type="button" class="popup-vocab-save" data-field1="${escapeAttr(word.field1)}" data-field2="${escapeAttr(word.field2)}" data-field3="${escapeAttr(word.field3)}" data-field4="${escapeAttr(word.field4)}" data-field5="${escapeAttr(word.field5)}">Save</button>
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
