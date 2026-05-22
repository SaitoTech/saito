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
`;
};
