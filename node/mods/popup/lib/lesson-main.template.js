module.exports = (lesson) => {
  const category =
    typeof history !== 'undefined' && history.state && history.state.popupCategory
      ? history.state.popupCategory
      : lesson.userslug || 'all';
  const intro = String(lesson.content || '')
    .replaceAll('\\', '')
    .replaceAll('\n\n', '<p></p>')
    .trim();

  return `
    <div class="lesson-container" data-return-category="${escapeAttr(category)}">
      <div class="lesson-header">
        <button type="button" class="popup-lesson-back saito-button-square" aria-label="Back to lessons">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="lesson-heading">
          <span class="user">${escapeAttr(lesson.username || '')}</span> <span class="title">${escapeAttr(lesson.title || '')}</span>
        </div>
      </div>
      ${intro ? `<div class="lesson-section discussion">${intro}</div>` : ''}
      <div class="lesson-section transcript"></div>
      <div class="lesson-section vocabulary"></div>
      <div class="lesson-section questions"></div>
      <audio id="audioPlayer" preload="auto">
        <source id="audioSource" type="audio/mp3">
      </audio>
    </div>
  `;
};

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
