module.exports = RustscriptMainTemplate = (app, mod) => {
  return `
<div class="saito-rustscript rs-workspace-locked">

  <header class="rs-workspace-header">
    <div class="rs-workspace-actions">
      <button type="button" class="rs-action-btn rs-new-script">New Script</button>
      <button type="button" class="rs-action-btn rs-import-script">Import Script</button>
      <button type="button" class="rs-action-btn rs-templates">Templates</button>
      <button type="button" class="rs-action-btn rs-expert-syntax">Expert Syntax</button>
      <button type="button" class="rs-action-btn rs-run-validate">Validate</button>
      <button type="button" class="rs-action-btn rs-run-execute">Execute</button>
      <input type="file" class="rs-import-file" accept=".json,.txt,application/json" hidden />
    </div>

    <div class="rs-workspace-status" aria-label="Contract lifecycle status">
      <div class="rs-status-reactor rs-status-script" data-state="idle" title="Script definition">
        <span class="rs-status-reactor-label">SCRIPT</span>
        <span class="rs-status-reactor-led" aria-hidden="true"></span>
      </div>
      <div class="rs-status-reactor rs-status-witness" data-state="idle" title="Witness data">
        <span class="rs-status-reactor-label">WITNESS</span>
        <span class="rs-status-reactor-led" aria-hidden="true"></span>
      </div>
      <div class="rs-status-reactor rs-status-valid" data-state="idle" title="Execution result">
        <span class="rs-status-reactor-label">VALID</span>
        <span class="rs-status-reactor-led" aria-hidden="true"></span>
      </div>
    </div>

    <button
      type="button"
      class="rs-workspace-toggle is-locked"
      role="switch"
      aria-checked="false"
      aria-label="Guided mode — assisted semantic editing. Click for Expert raw JSON mode."
    >
      <span class="rs-workspace-toggle-track">
        <span class="rs-workspace-toggle-thumb">GUIDED</span>
      </span>
    </button>
  </header>

  <div class="rs-guided-strip" hidden>
    <span class="rs-guided-label"></span>
    <div class="rs-guided-actions">
      <button type="button" class="rs-guided-btn rs-guided-restart">Start over</button>
    </div>
  </div>

  <div class="rs-template-menu" hidden>
    <div class="rs-template-menu-inner"></div>
  </div>

  <section class="rs-layout">
    <div class="rs-main">
      <div class="rs-editor rs-locking-pane" id="rs-locking-panel-mount"></div>
      <div class="rs-editor rs-unlocking-pane rs-unlock-gated" id="rs-unlocking-panel-mount"></div>
    </div>

    <aside class="rs-sidebar">
      <div id="rs-opcode-reference-mount" class="rs-sidebar-reference"></div>
    </aside>
  </section>
</div>
`;
};
