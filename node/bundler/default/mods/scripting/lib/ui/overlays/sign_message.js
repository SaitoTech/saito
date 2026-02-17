const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SignMessageOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  render() {
    const html = `
      <div class="scripting-overlay">
        <h2>Sign Message</h2>
        <div class="overlay-content">
          <label for="sign-message-input">Message</label>
          <textarea id="sign-message-input" placeholder="Enter the message you want to sign"></textarea>
          <div class="overlay-actions">
            <button class="sign-message-btn">Sign</button>
            <button class="sign-message-cancel">Cancel</button>
          </div>
          <div class="overlay-result hidden">
            <label>Signature:</label>
            <textarea class="signature-output" readonly></textarea>
          </div>
        </div>
      </div>
    `;

    this.overlay.show(html);
    this.attachEvents();
  }

  attachEvents() {
    document.querySelector('.sign-message-cancel').onclick = () => {
      this.overlay.hide();
    };

    document.querySelector('.sign-message-btn').onclick = async () => {
      const msg = document.getElementById('sign-message-input').value.trim();
      if (!msg) {
        alert('Please enter a message.');
        return;
      }

      const privatekey = await this.app.wallet.getPrivateKey();
      const sig = await this.app.crypto.signMessage(msg, privatekey);

      const resultBox = document.querySelector('.overlay-result');
      const output = document.querySelector('.signature-output');

      output.value = sig;
      resultBox.classList.remove('hidden');
    };
  }
}

module.exports = SignMessageOverlay;

