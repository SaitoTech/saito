module.exports = ({ images = [] } = {}) => {
  if (!Array.isArray(images) || images.length === 0) {
    return '';
  }

  const count = Math.min(images.length, 4);
  const items = images
    .slice(0, 4)
    .map((img) => `<figure class="item"><img src="${img}" alt="" loading="lazy" /></figure>`)
    .join('');

  return `
    <div class="gallery count-${count}">
      <div class="grid">
        ${items}
      </div>
    </div>
  `;
};
