const TRANSITION_MS = 200;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transitionView(viewEl, renderFn) {
  if (!viewEl) {
    renderFn();
    return;
  }

  viewEl.classList.add('explorer-view-exit');
  await wait(TRANSITION_MS);
  renderFn();
  viewEl.classList.remove('explorer-view-exit');
  viewEl.classList.add('explorer-view-enter');
  requestAnimationFrame(() => {
    viewEl.classList.remove('explorer-view-enter');
  });
}

module.exports = {
  TRANSITION_MS,
  transitionView
};
