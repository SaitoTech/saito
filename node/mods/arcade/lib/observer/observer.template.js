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

function renderLoading(observer) {
  const o = observer || {};
  const downloaded = (o.fetch_progress && o.fetch_progress.downloaded) || 0;
  const total = (o.fetch_progress && o.fetch_progress.total) || 0;
  const pct = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;
  return `
<div class="arcade-observer-loading">
  <div class="arcade-observer-loading-inner">
    <div class="arcade-observer-spinner"></div>
    <div class="arcade-observer-message">
      Reconstructing Game...
    </div>
    <div class="arcade-observer-progress-bar">
      <div class="arcade-observer-progress-fill" style="width: ${pct}%"></div>
    </div>
    <div class="arcade-observer-progress-text">
      Downloaded ${downloaded} transactions
    </div>
  </div>
</div>`;
}

module.exports = mainTemplate;
module.exports.renderLoading = renderLoading;
