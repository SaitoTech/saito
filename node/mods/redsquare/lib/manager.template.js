module.exports = () => {
  return `
    <section class="manager">
      <header class="manager-header">
        <div class="manager-header-start">
          <button
            type="button"
            class="manager-header-back"
            aria-label="Back"
            hidden
          >
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h2 class="manager-header-title">Home</h2>
        </div>
        <div class="manager-header-actions">
          <button class="new-post-button saito-button-primary" type="button">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            <span>New Post</span>
          </button>
        </div>
      </header>
      <div class="manager-body">
        <div class="manager-list manager-timeline"></div>
        <div class="manager-list manager-thread manager-panel-hidden"></div>
        <div class="manager-list manager-notifications manager-panel-hidden"></div>
        <div class="manager-list manager-profile manager-panel-hidden"></div>
      </div>
    </section>
  `;
};
