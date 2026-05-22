const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class GenerateExpertOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render(initialScript = '') {
    const html = `
      <div class="rustscript-overlay">
        <h2>Generate Expert Script</h2>
        <p class="rs-overlay-hint">The only place to author symbolic human-readable scripts.</p>
        <label>Expert script</label>
        <textarea class="rs-expert-input" spellcheck="false" placeholder="CHECKSIG[publickey=&quot;alice&quot;]&#10;AND&#10;IMPORTFIELD[field=&quot;duration&quot;]"></textarea>
        <div class="overlay-actions">
          <button class="rs-expert-generate-btn">Generate</button>
          <button class="rs-expert-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    this.overlay.show(html);

    const input = document.querySelector('.rs-expert-input');
    if (input) {
      input.value = initialScript || this.mod.ui?.lastScriptSource || '';
    }

    this.attachEvents();
  }

  attachEvents() {
    document.querySelector('.rs-expert-cancel-btn').onclick = () => {
      this.overlay.hide();
    };

    document.querySelector('.rs-expert-generate-btn').onclick = async () => {
      const input = document.querySelector('.rs-expert-input').value.trim();
      if (!input) {
        return;
      }

      try {
        const result = await this.mod.parseExpertScript(input);
        this.mod.ui.onParseSuccess(input, result);
        this.overlay.hide();
      } catch (err) {
        this.mod.ui.updateParseState('error', err.message);
        siteMessage(`Parse error: ${err.message}`);
      }
    };
  }
}

module.exports = GenerateExpertOverlay;
