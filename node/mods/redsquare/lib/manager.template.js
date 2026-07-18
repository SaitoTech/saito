module.exports = () => {
  // Injected into `.main > .manager` — no outer `.manager` wrapper.
  // Panels are identified by data-panel for JS; visibility via hidden.
  return `
      <header class="header">
        <div class="start">
          <button
            type="button"
            class="back"
            aria-label="Back"
            hidden
          >
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h2 class="title">Home</h2>
        </div>
        <div class="actions">
          <button class="new-post saito-button-primary" type="button">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            <span>New Post</span>
          </button>
        </div>
      </header>
      <div class="body">
        <div class="list" data-panel="timeline"></div>
        <div class="list" data-panel="thread" hidden></div>
        <div class="list" data-panel="notifications" hidden></div>
        <div class="list" data-panel="profile" hidden></div>
      </div>
  `;
};
