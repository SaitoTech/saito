<<<<<<< HEAD
module.exports = () => {
  return `
<main class="rustscript rs-workspace-locked">
  <section class="rustscript-body">
    <div id="rustscript-editor-create" class="rustscript-editor rustscript-editor-locking"></div>
    <div id="rustscript-editor-test" class="rustscript-editor rustscript-editor-unlocking" hidden></div>
    <aside id="rustscript-panel" class="rustscript-panel"></aside>
  </section>

  <footer class="rs-command-bar" role="toolbar" aria-label="RustScript workflow">
    <div class="rs-command-bar-region rs-command-bar-left">
      <button type="button" class="rs-cmd-btn rs-cmd-secondary rs-new-script">New Script</button>
    </div>

    <div class="rs-command-bar-region rs-command-bar-center">
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

    <div class="rs-command-bar-region rs-command-bar-right">
      <div class="rs-command-bar-right-cluster">
        <div class="rs-mode-switch rs-workspace-toggle" role="group" aria-label="Editing mode">
          <button type="button" class="rs-mode-btn rs-mode-guided is-active" data-mode="guided">Guided</button>
          <span class="rs-mode-sep" aria-hidden="true">/</span>
          <button type="button" class="rs-mode-btn rs-mode-expert" data-mode="expert">Expert</button>
        </div>
        <div class="rs-publish-slot" aria-hidden="true">
          <button type="button" class="rs-cmd-btn rs-cmd-primary rs-publish-script" tabindex="-1">Publish</button>
        </div>
      </div>
    </div>
  </footer>
</main>
=======
module.exports = RustscriptMainTemplate = (app, mod) => {
  return `
<div class="saito-rustscript">

  <header class="rs-toolbar">
    <div class="rs-toolbar-left">
      <select class="rs-template-select">
        <option value="" disabled selected>Choose Template...</option>
      </select>
    </div>
    <div class="rs-toolbar-right">
      <button class="rs-mode-btn rs-mode-basic">basic</button>
      <button class="rs-mode-btn rs-mode-expert active">expert</button>
    </div>
  </header>

  <section class="rs-layout">
    <div class="rs-main">
      <div class="rs-editor rs-script-panel">
        <div class="rs-editor-header">Expert Script (symbolic)</div>
        <textarea class="rs-textarea rs-script" spellcheck="false" placeholder="( A AND B ) THEN C"></textarea>
        <div class="rs-structured-script"></div>
      </div>

      <div class="rs-editor rs-witness-panel">
        <div class="rs-editor-header">AST (JSON)</div>
        <textarea class="rs-textarea rs-witness rs-readonly" readonly spellcheck="false" placeholder="{ }"></textarea>
        <div class="rs-structured-witness"></div>
      </div>
    </div>

    <aside class="rs-sidebar">
      <div class="rs-helper rs-tutorial">
        <h3>Symbolic Script Prototype</h3>
        <div class="rs-tutorial-content">
          <p>Experimental parser for AND / OR / NOT / THEN, opcodes like <code>CHECKSIG[publickey="alice"]</code>, and namespace refs like <code>tx.to</code> or <code>witness.sig</code>. Use <b>Generate Expert Script</b> to tokenize, parse, and render AST output. No execution or validation yet.</p>
        </div>
      </div>

      <div class="rs-helper rs-opcodes">
        <h3>Opcode Reference (preview)</h3>
        <div class="rs-opcode-list">
          <p><code>CHECKSIG</code>, <code>IMPORTFIELD</code>, <code>CHECKRECIPIENT</code>, …</p>
          <p>Params: <code>key=value</code>, exports: <code>field=tx.to AS name</code></p>
        </div>
      </div>
    </aside>
  </section>

  <section class="rs-tools">
    <div class="rs-tools-title">
      <h3>Tools</h3>
    </div>
    <div class="rs-tools-content">
      <div class="rs-tools-actions">
        <button class="rs-tool-btn rs-sign-msg" disabled title="Not in prototype">Sign Message</button>
        <button class="rs-tool-btn rs-generate-hash" disabled title="Not in prototype">Generate Hash</button>
        <button class="rs-tool-btn rs-verify-sig" disabled title="Not in prototype">Verify Signature</button>
        <button class="rs-tool-btn rs-generate-expert">Generate Expert Script</button>
        <button class="rs-tool-btn rs-list-nfts" disabled title="Not in prototype">List NFTs</button>
      </div>
      <div class="rs-tools-right">
        <div class="rs-eval-panel">
          <div class="rs-eval-panel-item rs-eval-script" data-label="Script">Script</div>
          <div class="rs-eval-panel-item rs-eval-witness" data-label="AST">AST</div>
          <div class="rs-eval-panel-item rs-eval-eval" data-label="Parse">Parse</div>
        </div>
      </div>
    </div>
  </section>
</div>
>>>>>>> 47390b7b (fix: rustscript refactor start)
`;
};
