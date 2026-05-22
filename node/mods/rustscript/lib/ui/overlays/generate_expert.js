const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class GenerateExpertOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render() {
    const html = `
      <div class="rustscript-overlay">
        <h2>Generate Expert Script</h2>
        <label>Symbolic script</label>
        <textarea class="rs-expert-input" spellcheck="false" placeholder="( IMPORTFIELD[field=tx.to AS recipient] AND CHECKSIG[publickey=&quot;alice&quot;] ) THEN CHECKRECIPIENT[publickey=context.recipient]"></textarea>
        <div class="overlay-actions">
          <button class="rs-expert-generate-btn">Generate</button>
          <button class="rs-expert-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    this.overlay.show(html);

    const mainScript = document.querySelector('.rs-script')?.value?.trim();
    if (mainScript) {
      document.querySelector('.rs-expert-input').value = mainScript;
    }

    this.attachEvents();
  }

  attachEvents() {
    document.querySelector('.rs-expert-cancel-btn').onclick = () => {
      this.overlay.hide();
    };

    document.querySelector('.rs-expert-generate-btn').onclick = () => {
      const input = document.querySelector('.rs-expert-input').value.trim();
      if (!input) {
        return;
      }

      try {
        const result = this.mod.parseExpertScript(input);
        document.querySelector('.rs-script').value = input;
        document.querySelector('.rs-witness').value = result.json;

        const treeEl = document.querySelector('.rs-structured-script');
        if (treeEl) {
          treeEl.textContent = result.asciiTree;
        }

        document.body.classList.add('rs-show-ast-tree');
        this.mod.ui.updateParseState('ok');
        this.overlay.hide();
      } catch (err) {
        this.mod.ui.updateParseState('error', err.message);
        siteMessage(`Parse error: ${err.message}`);
      }
    };
  }
}

module.exports = GenerateExpertOverlay;
