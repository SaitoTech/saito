const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class VerifySignatureOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render() {
    const html = `
      <div class="verify-signature-overlay">
        <h2>Verify Signature</h2>
        <div class="overlay-content">
          <label for="verify-message-input">Message</label>
          <textarea id="verify-message-input" placeholder="Enter the original message"></textarea>

          <label for="verify-signature-input">Signature</label>
          <textarea id="verify-signature-input" placeholder="Paste the signature to verify"></textarea>

          <label for="verify-publickey-input">Public Key</label>
          <input id="verify-publickey-input" type="text" placeholder="Enter or paste public key" />

          <div class="overlay-actions">
            <button class="verify-signature-btn">Verify</button>
            <button class="verify-signature-cancel">Cancel</button>
          </div>

          <div class="overlay-result hidden">
            <label>Verification Result</label>
            <div class="verify-result-text"></div>
          </div>
        </div>
      </div>
    `;

    this.overlay.show(html);
    this.attachEvents();
  }

  attachEvents() {
    document.querySelector('.verify-signature-cancel').onclick = () => {
      this.overlay.hide();
    };

    document.querySelector('.verify-signature-btn').onclick = async () => {
      const msg = document.getElementById('verify-message-input').value.trim();
      const sig = document.getElementById('verify-signature-input').value.trim();
      const pubkey = document.getElementById('verify-publickey-input').value.trim();

      if (!msg || !sig || !pubkey) {
        alert('Please provide message, signature, and public key.');
        return;
      }

      const verified = this.app.crypto.verifyMessage(msg, sig, pubkey);
      const resultBox = document.querySelector('.overlay-result');
      const resultText = document.querySelector('.verify-result-text');

      resultText.textContent = verified ? '✅ Signature is valid' : '❌ Signature is invalid';
      resultText.style.color = verified ? '#5cf07d' : '#f85e5e';
      resultBox.classList.remove('hidden');
    };
  }
}

module.exports = VerifySignatureOverlay;


