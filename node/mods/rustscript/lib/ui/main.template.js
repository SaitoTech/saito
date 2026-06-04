module.exports = () => {
  return `
<div class="rustscript rs-workspace-locked">
  <header class="rs-workspace-header">
    <div class="rs-workspace-actions">
      <button type="button" class="rs-action-btn rs-new-script">New Script</button>
    </div>

    <div class="rs-workspace-header-right">
      <div class="rs-workspace-status" aria-label="Contract lifecycle status">
        <div class="rs-status-reactor rs-status-script" data-state="idle" title="Script definition">
          <span class="rs-status-reactor-label">SCRIPT</span>
        </div>
        <div class="rs-status-reactor rs-status-required" data-state="idle" title="Required fields">
          <span class="rs-status-reactor-label">REQUIRED</span>
        </div>
        <div class="rs-status-reactor rs-status-valid" data-state="idle" title="Execution result">
          <span class="rs-status-reactor-label">VALID</span>
        </div>
      </div>

      <button
        type="button"
        class="rs-workspace-toggle is-guided"
        role="switch"
        aria-checked="true"
        aria-label="Guided mode — assisted semantic editing. Click for Expert raw JSON mode."
      >
        <span class="rs-workspace-toggle-track">
          <span class="rs-workspace-toggle-label rs-workspace-toggle-label-guided">GUIDED</span>
          <span class="rs-workspace-toggle-label rs-workspace-toggle-label-expert">EXPERT</span>
          <span class="rs-workspace-toggle-thumb" aria-hidden="true"></span>
        </span>
      </button>
    </div>
  </header>

  <section class="rustscript-body">
    <div id="rustscript-editor-create" class="rustscript-editor rustscript-editor-locking"></div>
    <div id="rustscript-editor-test" class="rustscript-editor rustscript-editor-unlocking" hidden></div>
    <aside id="rustscript-panel" class="rustscript-panel"></aside>
  </section>
</div>
`;
};
