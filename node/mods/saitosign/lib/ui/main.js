const Splash = require('./splash');
const Faq = require('./faq');
const Workspace = require('./workspace');
const { hasPdf } = require('../document');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.screen = 'splash';
    this.splash = new Splash(app, mod, this);
    this.faq = new Faq(app, mod, this);
    this.workspace = new Workspace(app, mod);
  }

  render() {
    if (this.mod.retired) {
      this.showRetired();
      return;
    }
    if (this.mod.recovery === 'missing') {
      this.showMissingDocument();
      return;
    }
    if (hasPdf(this.mod.document)) {
      this.screen = 'workspace';
    }

    if (this.screen === 'faq') {
      this.faq.render();
      return;
    }

    if (this.screen === 'workspace' && hasPdf(this.mod.document)) {
      this.workspace.render();
      if (this.mod.recoveredUser && (this.mod.recovery === 'claim' || this.mod.recovery === 'restore')) {
        this.workspace.publish.openRecoveredVerification(this.mod.recoveredUser);
        this.mod.recoveredUser = null;
      }
      return;
    }

    this.screen = 'splash';
    this.splash.render();
  }

  showSplash() {
    this.screen = 'splash';
    this.splash.render();
  }

  showFaq() {
    this.screen = 'faq';
    this.faq.render();
  }

  showMissingDocument() {
    const container = document.querySelector('.saito-container');
    if (!container) {
      return;
    }
    container.classList.add('saitosign');
    container.innerHTML = missingDocumentHTML(this.mod.recoveryCode);
    container.querySelector('[data-copy-code]')?.addEventListener('click', () => {
      const code = container.querySelector('[data-verification-code]')?.textContent || '';
      const button = container.querySelector('[data-copy-code]');
      if (!code || !button) {
        return;
      }
      const done = () => {
        button.textContent = 'Copied';
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(() => selectCode(container));
        return;
      }
      selectCode(container);
    });
  }

  showRetired() {
    const container = document.querySelector('.saito-container');
    if (!container) {
      return;
    }
    container.classList.add('saitosign');
    container.innerHTML = `
      <section class="saitosign-recovery">
        <h1>Continue in the other tab</h1>
        <p>Email verification is complete. This window is no longer the signing session.</p>
        <p>Use the tab that opened from the verification email.</p>
      </section>
    `;
  }

  showWorkspace() {
    this.screen = 'workspace';
    this.splash.notice = '';
    this.splash.clearStaged();
    this.workspace.show();
  }

  fail(message) {
    if (hasPdf(this.mod.document) && this.screen === 'workspace') {
      this.workspace.notice = message;
      this.workspace.render();
      return;
    }

    this.screen = 'splash';
    this.splash.notice = message;
    this.splash.render();
  }

  showShareLoad(state) {
    const container = document.querySelector('.saito-container');
    if (!container) {
      return;
    }
    container.querySelector('.saitosign-share-load')?.remove();
    if (!state || (!state.status && !state.error)) {
      return;
    }
    const card = document.createElement('div');
    card.className = 'saitosign-share-load';
    card.setAttribute('role', 'status');
    const panel = document.createElement('div');
    panel.className = 'saitosign-share-load-card';
    if (!state.error) {
      const spinner = document.createElement('div');
      spinner.className = 'saitosign-share-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      panel.appendChild(spinner);
    }
    const text = document.createElement('p');
    text.textContent = state.error || state.status;
    panel.appendChild(text);
    card.appendChild(panel);
    container.appendChild(card);
  }
}

function missingDocumentHTML(code) {
  const value = escapeHTML(code || '');
  return `
    <section class="saitosign-recovery">
      <h1>Document Not Found</h1>
      <p>We couldn't find the document you're preparing to sign in this browser.</p>
      <p>This usually happens when you open the verification email in a different browser or on another device from the one you used to start signing.</p>
      <p>Don't worry — your verification code is still valid.</p>
      <p>To continue, return to the browser where you originally opened your document and enter the verification code below.</p>
      <h2>Your verification code</h2>
      <pre data-verification-code>${value}</pre>
      <button type="button" class="saito-button-primary" data-copy-code>Copy Code</button>
      <p>Return to your original SaitoSign window, select Email verification, and enter this code in the verification field.</p>
    </section>
  `;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectCode(container) {
  const node = container.querySelector('[data-verification-code]');
  if (!node) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

module.exports = Main;
