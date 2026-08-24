module.exports = () => {
  return `
<main class="rustscript rs-workspace-locked">
  <section class="rustscript-body">
    <div id="rustscript-editor-create" class="rustscript-editor rustscript-editor-locking"></div>
    <div id="rustscript-editor-test" class="rustscript-editor rustscript-editor-unlocking" hidden></div>
    <aside id="rustscript-panel" class="rustscript-panel"></aside>
  </section>

  <footer class="rs-command-bar" role="toolbar" aria-label="RustScript workflow">
    <div class="rs-command-bar-left">
      <button type="button" class="rs-cmd-btn rs-cmd-secondary rs-new-script">New Script</button>
    </div>

    <div class="rs-command-bar-center">
      <div class="rs-progress-track" aria-label="Contract lifecycle status">
        <div class="rs-progress-step rs-status-script" data-state="idle" title="Locking script definition">
          <span class="rs-progress-dot" aria-hidden="true"></span>
          <span class="rs-progress-label rs-status-reactor-label">Script Complete</span>
        </div>
        <span class="rs-progress-connector rs-progress-connector-1" data-state="idle" aria-hidden="true"></span>
        <div class="rs-progress-step rs-status-required" data-state="idle" title="Witness fields">
          <span class="rs-progress-dot" aria-hidden="true"></span>
          <span class="rs-progress-label rs-status-reactor-label">Witness Complete</span>
        </div>
        <span class="rs-progress-connector rs-progress-connector-2" data-state="idle" aria-hidden="true"></span>
        <div class="rs-progress-step rs-status-valid" data-state="idle" title="Script execution result">
          <span class="rs-progress-dot" aria-hidden="true"></span>
          <span class="rs-progress-label rs-status-reactor-label">Script Valid</span>
        </div>
      </div>
    </div>

    <div class="rs-command-bar-right">
      <div class="rs-publish-slot" aria-hidden="true">
        <button type="button" class="rs-cmd-btn rs-cmd-primary rs-publish-script" tabindex="-1">Publish</button>
      </div>
      <div class="rs-mode-switch" role="group" aria-label="Editing mode">
        <button type="button" class="rs-mode-btn rs-mode-guided is-active" data-mode="guided">Guided</button>
        <span class="rs-mode-sep" aria-hidden="true">/</span>
        <button type="button" class="rs-mode-btn rs-mode-expert" data-mode="expert">Expert</button>
      </div>
    </div>
  </footer>
</main>
`;
};
