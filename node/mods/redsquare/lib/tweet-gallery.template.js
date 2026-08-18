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

  const safeImages = images.filter((img) => {
    if (typeof img !== 'string' || !img.trim()) {
      return false;
    }
    const trimmed = img.trim();
    if (/[\s<>]/.test(trimmed)) {
      return false;
    }
    if (/^(javascript|vbscript):/i.test(trimmed)) {
      return false;
    }
    if (/^data:/i.test(trimmed)) {
      return /^data:image\//i.test(trimmed) && !/^data:image\/svg/i.test(trimmed);
    }
    return /^(https?:\/\/|\/(?!\/))/i.test(trimmed);
  });
  if (!safeImages.length) {
    return '';
  }
  const count = Math.min(safeImages.length, 4);
  const items = safeImages
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
