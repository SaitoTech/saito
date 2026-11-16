module.exports = (lesson, sentence, popup_mod) => {
  let source = sentence.sentence_text.replaceAll('\\', '');
  let pinyin = sentence.sentence_text.replaceAll('\\', '');
  let speaker = sentence.speaker_text.replaceAll('\\', '');
  const display = popup_mod.app.options.popup.display;

  try {
    pinyin = switch_display_mode_in_string(pinyin, 'pinyin', 'simplified');
    if (display.traditional == 1) {
      source = switch_display_mode_in_string(source, 'traditional', 'simplified');
      speaker = switch_display_mode_in_string(speaker, 'traditional', 'simplified');
    }
  } catch (err) {}

  const pinyinHidden = display.pinyin == 1 ? '' : ' hidden';
  const englishHidden = display.english == 1 ? '' : ' hidden';

  return `
    <article class="sentence">
      <div class="sentence-speaker">${speaker}</div>
      <div class="sentence-lines">
        <div class="lesson_sentence_source" id="lesson_sentence_source_${sentence.id}">${source}</div>
        <div class="lesson_sentence_pinyin" id="lesson_sentence_pinyin_${sentence.id}"${pinyinHidden}>${pinyin}</div>
        <div class="lesson_sentence_translation" id="lesson_sentence_translation_${sentence.id}"${englishHidden}>${sentence.sentence_translation || ''}</div>
      </div>
    </article>
  `;
};
