module.exports = ScriptoriumMainTemplate = (app, mod) => {
  return `
<div class="saito-scriptorium">

  <!-- HEADER / TOOLBAR -->
  <header class="ss-toolbar">
    <div class="ss-toolbar-left">
      <select class="ss-template-select">
	<option value="" disabled selected>Choose Template...</option>
      </select>
    </div>
    <div class="ss-toolbar-right">
      <button class="ss-mode-btn ss-mode-basic active">basic</button>
      <button class="ss-mode-btn ss-mode-expert">expert</button>
    </div>
  </header>

  <!-- MAIN BODY -->
  <section class="ss-layout">
    <!-- Main Editor Region -->
    <div class="ss-main">
      <div class="ss-editor ss-script-panel">
        <div class="ss-editor-header">Script</div>
        <textarea class="ss-textarea ss-script" placeholder="{ }"></textarea>
        <div class="ss-structured-script"></div>
      </div>

      <div class="ss-editor ss-witness-panel">
        <div class="ss-editor-header">Witness</div>
        <textarea class="ss-textarea ss-witness" placeholder="{ }"></textarea>
        <div class="ss-structured-witness"></div>
      </div>
    </div>

    <!-- Right Sidebar -->
    <aside class="ss-sidebar">
      <div class="ss-helper ss-tutorial">
        <h3>Tutorial & Reference</h3>
        <div class="ss-tutorial-content">
          <p>This application provides help writing short scripts that can be used within Saito applications and NFTs. For documentation, please see https://wiki.saito.io/docs/scripting. Enter <b>expert</b> mode to write advanced/custom scripts.</p> 
        </div>
      </div>

      <div class="ss-helper ss-opcodes">
        <h3>Opcode Reference</h3>
        <div class="ss-opcode-list"></div>
      </div>
    </aside>
  </section>

  <!-- Additional Tools -->
  <section class="ss-tools">
    <div class="ss-tools-title">
      <h3>Additional Tools</h3>
    </div>
    <div class="ss-tools-content">
      <div class="ss-tools-actions">
        <button class="ss-tool-btn ss-sign-msg">Sign Message</button>
        <button class="ss-tool-btn ss-generate-hash">Generate Hash</button>
        <button class="ss-tool-btn ss-verify-sig">Verify Signature</button>
	<button class="ss-tool-btn ss-generate-expert">Generate Expert</button>
	<button class="ss-tool-btn ss-list-nfts">List NFTs</button>
      </div>
      <div class="ss-tools-right">
        <div class="ss-eval-panel">
          <div class="ss-eval-panel-item ss-eval-script" data-label="Script">Script</div>
          <div class="ss-eval-panel-item ss-eval-witness" data-label="Witness">Witness</div>
          <div class="ss-eval-panel-item ss-eval-eval" data-label="Evaluates">Valid</div>
        </div>
      </div>
     </div>
  </section>
</div>
`;
};

