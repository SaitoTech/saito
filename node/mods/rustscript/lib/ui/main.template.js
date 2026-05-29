module.exports = RustscriptMainTemplate = (app, mod) => {
  return `
<div class="saito-rustscript rs-workspace-locked">

  <header class="rs-workspace-header">
    <div class="rs-workspace-actions">
      <button type="button" class="rs-action-btn rs-new-script">New Script</button>
      <button type="button" class="rs-action-btn rs-expert-only rs-welcome-tour">Welcome</button>
      <button type="button" class="rs-action-btn rs-expert-only rs-import-script">Import Script</button>
      <button type="button" class="rs-action-btn rs-expert-only rs-templates">Templates</button>
      <button type="button" class="rs-action-btn rs-expert-only rs-expert-syntax">Expert Syntax</button>
      <button type="button" class="rs-action-btn rs-expert-only rs-run-validate">Validate</button>
      <button type="button" class="rs-action-btn rs-expert-only rs-run-execute">Execute</button>
      <input type="file" class="rs-import-file rs-expert-only" accept=".json,.txt,application/json" hidden />
    </div>

    <div class="rs-workspace-header-right">
      <div class="rs-workspace-status" aria-label="Contract lifecycle status">
        <div class="rs-status-reactor rs-status-script" data-state="idle" title="Script definition">
          <span class="rs-status-reactor-label">SCRIPT</span>
        </div>
        <div class="rs-status-reactor rs-status-witness" data-state="idle" title="Witness data">
          <span class="rs-status-reactor-label">WITNESS</span>
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
          <span class="rs-workspace-toggle-thumb">GUIDED</span>
        </span>
      </button>
    </div>
  </header>

  <div class="rs-template-menu" hidden>
    <div class="rs-template-menu-inner"></div>
  </div>

  <section class="rs-layout">
    <div class="rs-main">
      <div class="rs-editor rs-create-pane rs-locking-pane" id="rs-locking-panel-mount"></div>
      <div class="rs-editor rs-test-pane rs-unlocking-pane" id="rs-unlocking-panel-mount"></div>
    </div>
  </section>
</div>
`;
};
