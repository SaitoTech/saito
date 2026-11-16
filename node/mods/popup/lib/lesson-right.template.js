module.exports = (lesson, popup_self) => {
  const display = (popup_self && popup_self.app.options.popup && popup_self.app.options.popup.display) || {};
  const simplified = display.traditional == 1 ? '' : ' checked';
  const traditional = display.traditional == 1 ? ' checked' : '';
  const pinyin = display.pinyin == 1 ? ' checked' : '';
  const english = display.english == 1 ? ' checked' : '';

  return `
    <div class="lesson-sidebar">
      <img id="podcast_photo" src="https://popupchinese.com/data/${lesson.id}/image.jpg" class="podcast_photo" alt="">
      <audio controls>
        <source src="https://popupchinese.com/data/${lesson.id}/audio.mp3" type="audio/mpeg">
      </audio>
      <fieldset class="popup-display-controls">
        <legend>Display</legend>
        <label><input class="saito-radio" type="radio" name="display_select" onclick="switch_display_mode('simplified')" value="simplified"${simplified}> Simplified</label>
        <label><input class="saito-radio" type="radio" name="display_select" onclick="switch_display_mode('traditional')" value="traditional"${traditional}> Traditional</label>
        <label><input class="saito-checkbox" type="checkbox" id="display_pinyin" data-popup-toggle="pinyin" onclick="switch_display_mode('pinyin')"${pinyin}> Pinyin</label>
        <label><input class="saito-checkbox" type="checkbox" id="display_english" data-popup-toggle="english" onclick="switch_display_mode('english')"${english}> English</label>
      </fieldset>
    </div>
  `;
};
