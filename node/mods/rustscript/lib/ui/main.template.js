module.exports = RustscriptMainTemplate = (app, mod) => {
  return `
<div class="saito-rustscript rs-mode-expert">

  <header class="rs-toolbar">
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
          <span class="rs-editor-subtitle">canonical AST / declarative contract</span>
        </div>
        <textarea class="rs-textarea rs-locking-script" spellcheck="false" placeholder="{ &quot;op&quot;: &quot;CHECKSIG&quot;, &quot;bindings&quot;: {} }"></textarea>
      </div>

      <div class="rs-editor rs-context-pane">
        <div class="rs-editor-header">
          <span class="rs-editor-title">Execution Context</span>
          <span class="rs-editor-subtitle">witness + tx + blk runtime payload</span>
        </div>
        <textarea class="rs-textarea rs-execution-context" spellcheck="false" placeholder="{ &quot;witness&quot;: {}, &quot;tx&quot;: {}, &quot;blk&quot;: {} }"></textarea>
      </div>
    </div>

    <aside class="rs-sidebar">
      <div class="rs-helper rs-tutorial">
        <h3>P2SH Contract Tooling</h3>
        <div class="rs-tutorial-content">
          <p><b>LEFT</b> is the locking contract (symbolic refs). <b>RIGHT</b> is the unlocking payload (witness, tx, blk).</p>
          <p>Use <b>Generate Expert Script</b> to parse semantic opcodes into locking JSON, then <b>Generate Context</b> for the right panel.</p>
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
        <button class="rs-tool-btn rs-generate-expert">Generate Expert Script</button>
        <button class="rs-tool-btn rs-generate-context">Generate Context</button>
        <button class="rs-tool-btn rs-validate-script">Validate</button>
        <button class="rs-tool-btn rs-execute-script">Execute</button>
      </div>
      <div class="rs-tools-right">
        <div class="rs-eval-panel">
          <div class="rs-eval-panel-item rs-eval-lock" data-label="Lock">Lock</div>
          <div class="rs-eval-panel-item rs-eval-ctx" data-label="Ctx">Ctx</div>
          <div class="rs-eval-panel-item rs-eval-parse" data-label="Parse">Parse</div>
        </div>
      </div>
    </div>
  </section>
</div>
`;
};
