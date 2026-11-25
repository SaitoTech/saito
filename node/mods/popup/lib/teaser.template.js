module.exports = (lesson) => {
  const description = excerpt(lesson && lesson.content);
  const text = description
    ? `<p class="popup-lesson-description">${escapeHtml(description)}</p>`
    : '';

  return `
    <div class="teaser" id="${lesson.id}">
      <div class="photo" style="background-image: url('https://popupchinese.com/data/${lesson.id}/teaser.jpg');"></div>
      <div class="title">
        <div class="black nonlink" href="/lessons/${lesson.userslug}/${lesson.slug}">${escapeHtml(lesson.title || '')}</div>
        <div class="level red">${escapeHtml(lesson.userslug || '')}</div>
        ${text}
      </div>
    </div>
  `;
};

function excerpt(content) {
  const text = String(content || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return '';
  }
  if (text.length <= 180) {
    return text;
  }
  return text.slice(0, 177).trim() + '…';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
