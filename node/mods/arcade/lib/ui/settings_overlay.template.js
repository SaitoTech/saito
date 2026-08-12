module.exports = () => {
  return `
    <div class="arcade-settings saito-overlay-panel">
      <div class="title">Settings</div>
      <div class="body">
        <p>
          Saito Arcade is an open-source game engine built for provably fair,
          peer-to-peer play.
        </p>
        <p>
          Enjoy the games — or, if you are a developer, help us build them.
        </p>
        <p>
          Looking for more titles? Visit the Saito Store or the Saito Wiki to
          discover and install additional games.
        </p>
      </div>
      <div class="actions">
        <a class="saito-button-secondary" data-action="store" href="/store">
          Visit Saito Store
        </a>
        <a
          class="saito-button-secondary"
          data-action="wiki"
          href="https://wiki.saito.io"
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit Saito Wiki
        </a>
      </div>
    </div>
  `;
};
