module.exports = (actions = []) => {
  let cards = actions
    .map((action) => {
      let image = action.image || '/nwasm/img/add_game.png';
      return `
          <button type="button" class="choice" data-action="${action.id}">
            <div class="art">
              <img src="${image}" alt="" />
            </div>
            <div class="meta">
              <div class="lede">${action.title}</div>
              <div class="text">${action.description || ''}</div>
            </div>
          </button>`;
    })
    .join('');

  return `
    <div class="nwasm-library saito-overlay-form">
      <div class="body">
        <div class="choices" data-count="${actions.length}">
          ${cards}
        </div>

        <div class="state" hidden>
          <div class="result">
            <div class="saito-spinner" aria-hidden="true"></div>
            <div class="mark" aria-hidden="true"></div>
            <div class="lede">Working…</div>
            <div class="status">Preparing…</div>
          </div>
        </div>
      </div>
    </div>
  `;
};
