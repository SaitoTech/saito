module.exports = (model = {}) => {
  let options = model.options || [];
  let cards = options
    .map((option) => {
      let image = option.image || '/saito/img/dreamscape.png';
      let otitle = option.title || '';
      let description = option.description || '';
      let id = option.id || '';
      return `
          <button type="button" class="choice" data-action="${id}">
            <div class="art">
              <img src="${image}" alt="" />
            </div>
            <div class="meta">
              <div class="lede">${otitle}</div>
              <div class="text">${description}</div>
            </div>
          </button>`;
    })
    .join('');

  return `
    <div class="arcade-add-game saito-overlay-form" data-view="home">
      <div class="body">
        <div class="choices" data-count="${options.length}">
          ${cards}
        </div>
      </div>
    </div>
  `;
};
