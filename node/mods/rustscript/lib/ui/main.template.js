module.exports = RustscriptMainTemplate = (app, mod) => {
  return `
<div class="saito-rustscript rs-mode-expert">

  <header class="rs-toolbar">
    <div class="rs-toolbar-left">
      <select class="rs-template-select">
        <option value="" disabled selected>Choose Opcode...</option>
      </select>
    </div>
    <div class="rs-toolbar-right">
      <button class="rs-mode-btn rs-mode-basic">basic</button>
      <button class="rs-mode-btn rs-mode-expert active">expert</button>
    </div>
  </header>

  <section class="rs-layout">
    <div class="rs-main">
      <div class="rs-editor rs-locking-pane">
        <div class="rs-editor-header">
          <span class="rs-editor-title">Locking Script</span>
          <span class="rs-editor-subtitle">canonical contract (symbolic refs)</span>
        </div>
        <textarea class="rs-textarea rs-locking-script" spellcheck="false" placeholder="{ &quot;op&quot;: &quot;CHECKSIG&quot;, &quot;args&quot;: {}, &quot;witness&quot;: {} }"></textarea>
      </div>

      <div class="rs-editor rs-unlocking-pane">
        <div class="rs-editor-header">
          <span class="rs-editor-title">Unlocking Script</span>
          <span class="rs-editor-subtitle">executable unlock payload (materialized witness)</span>
        </div>
        <textarea class="rs-textarea rs-unlocking-script" spellcheck="false" placeholder="{ &quot;op&quot;: &quot;CHECKSIG&quot;, &quot;args&quot;: {}, &quot;witness&quot;: { &quot;signature&quot;: &quot;&quot; } }"></textarea>
      </div>
    </div>

    <aside class="rs-sidebar">
      <div class="rs-helper rs-tutorial">
        <h3>P2SH Contract Tooling</h3>
        <div class="rs-tutorial-content">
          <p><b>LEFT</b> is the locking contract. <b>RIGHT</b> is the unlocking script (same structure, witness slots filled).</p>
          <p>Use <b>Generate Expert Script</b> to parse semantic syntax, then <b>Generate Unlocking</b> to refresh RIGHT from LEFT.</p>
        </div>
      </div>

      <div class="rs-helper rs-opcodes">
        <h3>Opcode Reference</h3>
        <div class="rs-opcode-list"></div>
      </div>
    </aside>
  </section>

  <section class="rs-tools">
    <div class="rs-tools-title">
      <h3>Tools</h3>
    </div>
    <div class="rs-tools-content">
      <div class="rs-tools-actions">
        <button class="rs-tool-btn rs-generate-expert">Generate Expert Script</button>
        <button class="rs-tool-btn rs-generate-unlocking">Generate Unlocking</button>
        <button class="rs-tool-btn rs-validate-script">Validate</button>
        <button class="rs-tool-btn rs-execute-script">Execute</button>
      </div>
      <div class="rs-tools-right">
        <div class="rs-eval-panel">
          <div class="rs-eval-panel-item rs-eval-lock" data-label="Lock">Lock</div>
          <div class="rs-eval-panel-item rs-eval-unlock" data-label="Unlock">Unlock</div>
          <div class="rs-eval-panel-item rs-eval-parse" data-label="Parse">Parse</div>
        </div>
      </div>
    </div>
  </section>
</div>
`;
};
