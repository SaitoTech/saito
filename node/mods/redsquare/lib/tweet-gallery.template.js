module.exports = ({ presentation = 'timeline', images = [] } = {}) => {
  if (!Array.isArray(images) || images.length === 0) {
    return '';
  }

  const count = Math.min(images.length, 4);
  const items = images
    .slice(0, 4)
    .map((img) => `<figure class="tweet-gallery-item"><img src="${img}" alt="" loading="lazy" /></figure>`)
    .join('');

  return `
    <div class="tweet-gallery ${presentation} count-${count}">
      <div class="tweet-gallery-grid">
        ${items}
      </div>
    </div>
  `;
};
