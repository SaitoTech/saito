module.exports = () => {
  // Injected into `.main > .manager` — no outer `.manager` wrapper.
  // Header chrome is mounted separately when the active view requires it.
  // Panels are identified by data-panel for JS; visibility via hidden.
  return `
      <div class="body">
        <div class="list" data-panel="timeline"></div>
        <div class="list" data-panel="thread" hidden></div>
        <div class="list" data-panel="notifications" hidden></div>
        <div class="list" data-panel="profile" hidden></div>
      </div>
  `;
};
