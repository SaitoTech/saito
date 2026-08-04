function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = ({ images = [] } = {}) => {
  if (!Array.isArray(images) || images.length === 0) {
    return '';
  }

  const count = Math.min(images.length, 4);
  const items = images
    .slice(0, 4)
    .map(
      (img, index) => `
        <figure class="item">
          <img
            src="${escapeAttribute(img)}"
            alt="Tweet image ${index + 1} of ${count}"
            loading="lazy"
            data-index="${index}"
            role="button"
            tabindex="0"
          />
        </figure>`
    )
    .join('');

  return `
    <div class="gallery count-${count}">
      <div class="grid">
        ${items}
      </div>
    </div>
  `;
};
