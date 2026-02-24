"use strict";

function mainTemplate(observer) {
  return `
<div class="arcade-observer">
  <div class="arcade-observer-controls">
    <button class="arcade-observer-btn" id="observer-start" type="button">⏮</button>
    <button class="arcade-observer-btn" id="observer-prev" type="button">◀</button>
    <button class="arcade-observer-btn" id="observer-play" type="button">▶</button>
    <button class="arcade-observer-btn" id="observer-next" type="button">▶</button>
    <button class="arcade-observer-btn" id="observer-end" type="button">⏭</button>
    <div class="arcade-observer-progress">
      Step ${observer.step_current} / ${observer.step_max}
    </div>
  </div>
</div>`;
}

function renderLoading() {
  return `
<div class="arcade-observer-loading">
  <div class="arcade-observer-loading-inner">
    <div class="arcade-observer-spinner"></div>
    <div class="arcade-observer-message">
      Reconstructing Game...
    </div>
  </div>
</div>`;
}

module.exports = mainTemplate;
module.exports.renderLoading = renderLoading;
