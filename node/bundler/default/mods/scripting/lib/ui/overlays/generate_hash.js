const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class GenerateHashOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render() {
    const html = `
      <div class="generate-hash-overlay">
        <h2>Generate Hash</h2>
        <div class="overlay-content">
          <label for="hash-input">Input Data</label>
          <textarea id="hash-input" placeholder="Enter text or JSON to hash"></textarea>
          <div class="overlay-actions">
            <button class="generate-hash-btn">Generate</button>
            <button class="generate-hash-cancel">Cancel</button>
          </div>
          <div class="overlay-result hidden">
            <label>Hash Output</label>
            <textarea class="hash-output" readonly></textarea>
          </div>
        </div>
      </div>
    `;

    this.overlay.show(html);
    this.attachEvents();
  }

  attachEvents() {
    document.querySelector('.generate-hash-cancel').onclick = () => {
      this.overlay.hide();
    };

    document.querySelector('.generate-hash-btn').onclick = async () => {
      const input = document.getElementById('hash-input').value.trim();
      if (!input) {
        alert('Please enter data to hash.');
        return;
      }

      const hash = this.app.crypto.hash(input);
      const resultBox = document.querySelector('.overlay-result');
      const output = document.querySelector('.hash-output');

      output.value = hash;
      resultBox.classList.remove('hidden');
    };
  }
}

module.exports = GenerateHashOverlay;


