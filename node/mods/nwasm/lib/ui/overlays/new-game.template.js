module.exports = (opts = {}) => {
  return `
    <div class="nwasm-new-game saito-overlay-form">
      <div class="body">
        <div class="choices">
          <button type="button" class="choice" data-action="play">
            <div class="art">
              <img src="/nwasm/img/play_now.png" alt="" />
            </div>
            <div class="meta">
              <div class="lede">Play Game Now</div>
              <div class="text">Start the game immediately.</div>
            </div>
          </button>

          <button type="button" class="choice" data-action="library">
            <div class="art">
              <img src="/nwasm/img/add_game.png" alt="" />
            </div>
            <div class="meta">
              <div class="lede">Add to Library</div>
              <div class="text">Save ROM for instant future access</div>
            </div>
          </button>
        </div>

        <div class="state" hidden>
          <div class="saito-spinner" aria-hidden="true"></div>
          <div class="status">Preparing…</div>
        </div>
      </div>
    </div>
  `;
};
