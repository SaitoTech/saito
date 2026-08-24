module.exports = {
  /**
   * @param {{ listingTitle?: string, stageTitle?: string, stageDetail?: string }} opts
   */
  panel({ listingTitle = '', stageTitle = 'Preparing purchase', stageDetail = '' } = {}) {
    const lead = listingTitle
      ? `Preparing your purchase of <strong>${listingTitle}</strong>.`
      : 'Preparing your purchase.';

    return `
<article class="purchase monitor saito-overlay-panel retain-surface" aria-labelledby="purchase-monitor-title" aria-live="polite" aria-busy="true">
  <div class="stack">
    <div class="saito-spinner" aria-hidden="true"></div>
    <h2 class="title" id="purchase-monitor-title" data-monitor-stage-title>${stageTitle}</h2>
    <p class="lead">${lead}</p>
    <p class="subtitle" data-monitor-stage-detail>${stageDetail}</p>
  </div>
</article>`;
  }
};
