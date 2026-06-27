/**
 * Shared pending confirmation waiting overlay — publish and spend flows.
 */
module.exports = {
  pendingConfirmationOverlay({ extraClass = '' } = {}) {
    return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-publish-waiting rs-confirmation-waiting is-pending ${extraClass}">
  <div class="rs-publish-workspace-inner rs-publish-waiting-inner">
    <div class="rs-confirmation-stack">
      <div class="rs-publish-spinner" aria-hidden="true">
        <span class="rs-publish-spinner-box"></span>
        <span class="rs-publish-spinner-box"></span>
        <span class="rs-publish-spinner-box"></span>
        <span class="rs-publish-spinner-box"></span>
      </div>
      <h2 class="rs-publish-title rs-confirmation-title">Waiting for Confirmation</h2>
      <div class="rs-confirmation-subtitle rs-publish-lead rs-publish-waiting-lead" aria-live="polite">please be patient...</div>
      <div class="rs-confirmation-timer">
        <span class="rs-confirmation-timer-label">expected time to next block</span>
        <span class="rs-confirmation-countdown" aria-live="polite">—</span>
        <span class="rs-confirmation-timer-unit">seconds</span>
      </div>
    </div>
  </div>
</div>`;
  }
};
