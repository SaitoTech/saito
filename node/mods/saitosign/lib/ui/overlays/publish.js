const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublishTemplate = require('./publish.template');
const flow = require('./publish.flow');
const {
  verifyEmailSignature,
  addSignature,
  addInitial,
  actionStatus,
  verifyActionSignature,
  rememberEmail,
  verifiedMethods
} = require('../../auth');
const { addUser, copy } = require('../../document');
const { saveDraft } = require('../../draft');

class PublishOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-publish-host';
    this.state = flow.initialState();
    this.sliding = false;
  }

  render() {
    this.state = flow.initialState();
    this.state.signers = readUsers(this.mod);
    if (this.state.signers.length === 1) {
      this.keepUser(this.state.signers[0]);
    }
    this.overlay.show(PublishTemplate(this.state));
    this.attachEvents();
  }

  close() {
    this.overlay.close();
  }

  reset() {
    this.state = flow.initialState();
    this.close();
  }

  async showStep(direction) {
    if (this.sliding) {
      return;
    }
    this.sliding = true;

    const panel = document.querySelector('#saitosign-publish-step');
    const actionBar = document.querySelector('.saitosign-publish .actions');
    if (!panel) {
      this.sliding = false;
      this.overlay.show(PublishTemplate(this.state));
      this.attachEvents();
      return;
    }

    const exitClass = direction === 'back' ? 'slide-exit-right' : 'slide-exit-left';
    const enterClass = direction === 'back' ? 'slide-enter-left' : 'slide-enter-right';
    panel.classList.add(exitClass);
    await wait(180);

    const temp = document.createElement('div');
    temp.innerHTML = PublishTemplate(this.state).trim();
    const next = temp.querySelector('#saitosign-publish-step');
    const nextActions = temp.querySelector('.saitosign-publish .actions');
    if (next) {
      next.classList.add(enterClass);
      panel.replaceWith(next);
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            next.classList.remove(enterClass);
            resolve();
          });
        });
      });
    }
    if (actionBar && nextActions) {
      actionBar.replaceWith(nextActions);
    }

    this.attachEvents();
    await wait(220);
    this.sliding = false;
  }

  attachEvents() {
    const root = document.querySelector('.saitosign-publish');
    if (!root || root.dataset.bound === '1') {
      return;
    }
    root.dataset.bound = '1';

    root.addEventListener('change', (event) => {
      const select = event.target.closest('[data-you-signer]');
      if (!select) {
        return;
      }
      const extra = root.querySelector('[data-new-signer]');
      if (!extra) {
        return;
      }
      extra.hidden = select.value !== 'new';
      if (!extra.hidden) {
        root.querySelector('[data-new-signer-name]')?.focus();
      }
    });

    root.addEventListener('click', (event) => {
      const plan = event.target.closest('[data-plan]');
      if (plan && this.state.step === 'select') {
        this.state = flow.selectPlan(this.state, plan.dataset.plan);
        this.paintPlan();
        return;
      }

      const action = event.target.closest('[data-publish-action]');
      if (!action || action.disabled || this.sliding) {
        return;
      }

      if (action.dataset.publishAction === 'confirm-you') {
        this.confirmYou();
        return;
      }

      if (action.dataset.publishAction === 'add-signer') {
        this.addSigner();
        return;
      }

      if (action.dataset.publishAction === 'send-email') {
        this.sendEmail();
        return;
      }

      if (action.dataset.publishAction === 'submit-signature') {
        this.submitSignature();
        return;
      }

      if (action.dataset.publishAction === 'backup') {
        this.showBackup();
        return;
      }

      if (action.dataset.publishAction === 'back') {
        const next = flow.back(this.state);
        if (next === this.state) {
          return;
        }
        this.state = next;
        this.showStep('back');
        return;
      }

      if (action.dataset.publishAction === 'premium') {
        this.state = flow.learnPremium(this.state);
        this.showStep('forward');
        return;
      }

      if (action.dataset.publishAction === 'method') {
        this.state = flow.focusMethod(this.state, action.dataset.method);
        this.paintSlide();
        return;
      }

      if (action.dataset.publishAction === 'review') {
        this.close();
        return;
      }

      if (action.dataset.publishAction === 'share') {
        this.mod.exportDocument();
        return;
      }

      if (action.dataset.publishAction === 'export-draft') {
        this.confirmDraftExport();
        return;
      }

      if (action.dataset.publishAction === 'close') {
        this.close();
        return;
      }

      if (action.dataset.publishAction === 'advance') {
        if (this.state.step === 'verify') {
          this.continueAfterVerification();
          return;
        }
        const next = flow.advance(this.state);
        if (next === this.state) {
          return;
        }
        this.state = this.withKnownVerifications(next);
        this.showStep('forward');
      }
    });
  }

  async confirmDraftExport() {
    const confirmed = await sconfirm(
      'You are exporting a SaitoSign document that is not yet prepared for others to sign. Import this file back into SaitoSign anytime to continue...'
    );
    if (confirmed) {
      this.mod.exportDocument({ draft: true });
    }
  }

  paintPlan() {
    const root = document.querySelector('.saitosign-publish');
    if (!root) {
      return;
    }
    root.querySelectorAll('[data-plan]').forEach((button) => {
      const selected = button.dataset.plan === this.state.plan;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    root.querySelectorAll('[data-detail]').forEach((panel) => {
      panel.hidden = panel.dataset.detail !== this.state.plan;
    });
  }

  confirmYou() {
    const select = document.querySelector('[data-you-signer]');
    const raw = select?.value;
    if (!raw || raw === 'new') {
      return;
    }
    const index = Number(raw);
    const signer = this.state.signers.find((candidate) => candidate.index === index);
    if (!signer) {
      return;
    }
    this.keepUser(signer);
    this.flashKey();
  }

  addSigner() {
    const input = document.querySelector('[data-new-signer-name]');
    const value = input?.value.trim();
    if (!value) {
      return;
    }
    const email = isEmailAddress(value) ? value : '';
    const name = email ? nameFromEmail(email) : value;
    const index = addUser(this.mod.document, name);
    if (email) {
      this.mod.document.users[index].email = email;
    }
    this.state.signers = readUsers(this.mod);
    const added = this.state.signers.find((candidate) => candidate.index === index);
    if (!added) {
      return;
    }
    this.keepUser(added);
    this.flashKey();
  }

  keepUser(signer) {
    const email = signer.email || (isEmailAddress(signer.name) ? signer.name : '');
    // The public key and identicon come from the wallet and keychain.
    // Email and every verification belong to this document's signer record.
    let publickey = String(this.app.wallet?.publicKey || '').trim();
    if (/^[0-9a-fA-F]+$/.test(publickey) && publickey.length >= 64) {
      publickey = this.app.crypto.compressPublicKey(publickey);
    }
    const identicon = this.app.keychain.returnIdenticon(publickey) || '';
    const you = {
      index: signer.index,
      name: signer.name,
      email,
      publicKey: publickey,
      identicon
    };
    const live = this.mod.document.users[signer.index];
    if (live) {
      if (email) {
        live.email = email;
      }
      live.publickey = publickey;
    }
    this.state = flow.confirmYou(this.state, you);
    this.state.places = signaturePlaces(this.mod, you.index);
    this.state = this.withKnownVerifications(this.state);
  }

  withKnownVerifications(state) {
    const live = this.mod.document?.users?.[state.you?.index];
    const known = verifiedMethods(this.app, live);
    if (!known.length) {
      return state;
    }
    const verificationMethods = state.verificationMethods.map((method) => {
      if (!known.includes(method.id) || method.status === 'verified') {
        return method;
      }
      return { ...method, status: 'verified', selected: true };
    });
    return { ...state, verificationMethods };
  }

  flashKey() {
    const slot = document.querySelector('[data-you-slot]');
    const you = this.state.you;
    if (!slot || !you) {
      return;
    }
    const icon = you.identicon
      ? `<div class="saito-identicon-box"><img class="saito-identicon" src="${escapeHTML(you.identicon)}" alt=""></div>`
      : '';
    slot.innerHTML = `
      <p class="heading">You are signing with the following key:</p>
      <div class="key-preview" data-key-preview>
        <div class="saito-user">
          ${icon}
          <div class="saito-address" title="${escapeHTML(you.publicKey)}">${escapeHTML(you.publicKey)}</div>
          <div class="saito-userline">${escapeHTML(you.email || you.name || '')}</div>
        </div>
      </div>
    `;
    const preview = slot.querySelector('.key-preview');
    preview.classList.add('key-preview--enter');
    requestAnimationFrame(() => {
      preview.classList.add('key-preview--enter-active');
      preview.classList.remove('key-preview--enter');
    });
    this.paintContinue();
  }

  sendEmail() {
    const input = document.querySelector('[data-verify-email]');
    const email = (input?.value || this.state.you?.email || '').trim();
    const publickey = this.state.you?.publicKey || '';
    if (!email || !publickey || !this.state.you) {
      return;
    }
    const live = this.mod.document.users[this.state.you.index];
    if (live) {
      live.email = email;
    }
    this.state = { ...this.state, you: { ...this.state.you, email }, verifyError: '' };

    if (!mailServerReachable(this.app)) {
      this.showMailUnreachable();
      return;
    }

    const request = { done: false };
    const timer = setTimeout(() => {
      if (request.done) {
        return;
      }
      request.done = true;
      this.showMailUnreachable();
    }, 8000);

    try {
      this.app.network.sendRequestAsTransaction(
        'saitosign verify email',
        { email, publickey },
        (res) => {
          if (request.done) {
            return;
          }
          request.done = true;
          clearTimeout(timer);
          if (res?.publickey) {
            this.serverkey = res.publickey;
          }
          if (res?.success && res.publickey) {
            this.keepVerification(res, email, publickey).then(() => {
              this.rememberDevCode(res);
              this.paintSlide();
            });
            return;
          }
          if (res?.error && this.serverkey) {
            this.state = flow.markMethodSent(this.state, 'email');
            this.rememberDevCode(res);
            this.paintSlide();
            return;
          }
          if (!res) {
            this.showMailUnreachable();
            return;
          }
          this.state = { ...this.state, verifyError: 'This server cannot send a verification email.' };
          this.paintSlide();
        }
      );
    } catch (err) {
      if (!request.done) {
        request.done = true;
        clearTimeout(timer);
        this.showMailUnreachable();
      }
    }
  }

  showMailUnreachable() {
    this.state = { ...this.state, verifyError: 'error: mail server cannot be reached...' };
    this.paintSlide();
  }

  async keepVerification(res, email, publickey) {
    const verification = {
      publickey: res.publickey,
      message:
        res.message ||
        `Request received for verification of email ${email} with publickey ${publickey}`,
      signature: res.signature || ''
    };
    const live = this.mod.document.users[this.state.you.index];
    if (live) {
      live.email = email;
      if (!live.publickey) {
        live.publickey = publickey;
      }
      live.verifications = [verification];
    }

    if (res.signature) {
      try {
        await saveDraft({ code: res.signature, document: copy(this.mod.document) });
      } catch (err) {}
    }

    this.state = flow.markMethodSent(this.state, 'email');
  }

  rememberDevCode(res) {
    if (!this.mod.dev) {
      return;
    }
    const code = String((res && (res.signature || res.error)) || '').trim();
    if (!code) {
      return;
    }
    this.state = { ...this.state, devCode: code, pendingCode: code };
  }

  openProof() {
    const proof = document.querySelector('[data-proof]');
    if (proof) {
      proof.hidden = false;
    }
  }

  async submitSignature() {
    if (this.state.checking) {
      return;
    }
    const signature = document.querySelector('[data-verify-signature]')?.value.trim() || '';
    const email = this.state.you?.email || '';
    const publickey = this.state.you?.publicKey || '';
    if (!signature || !email || !publickey || !this.serverkey) {
      this.state = {
        ...this.state,
        pendingCode: signature,
        verifyError: 'Paste the cryptographic code from the email.'
      };
      this.paintSlide();
      return;
    }

    this.state = { ...this.state, checking: true, pendingCode: signature, verifyError: '' };
    this.paintSlide();
    await wait(700);

    const valid = verifyEmailSignature(this.app, email, publickey, signature, this.serverkey);
    if (!valid) {
      this.state = {
        ...this.state,
        checking: false,
        pendingCode: signature,
        verifyError: 'That code could not be verified.'
      };
      this.paintSlide();
      return;
    }

    const live = this.mod.document.users[this.state.you.index];
    if (live) {
      live.email = email;
      live.publickey = publickey;
      live.verifications = [
        {
          method: 'email',
          publickey: this.serverkey,
          message: `Request received for verification of email ${email} with publickey ${publickey}`,
          signature
        }
      ];
    }
    saveDraft({ code: signature, document: copy(this.mod.document) }).catch(() => {});
    rememberEmail(this.app, publickey, email);
    this.state = flow.markMethodVerified(
      { ...this.state, checking: false, pendingCode: '', verifyError: '' },
      'email'
    );
    this.paintSlide();
  }

  async continueAfterVerification() {
    if (!flow.requiredComplete(this.state) || this.sliding) {
      return;
    }
    try {
      await this.signUserActions();
    } catch (err) {}
    const record = this.mod.document;
    const status = actionStatus(this.app, record?.actions, record?.users, this.state.you?.index);
    const signature = record?.users?.[this.state.you?.index]?.verifications?.[0]?.signature || '';
    if (signature) {
      saveDraft({ code: signature, document: copy(record) }).catch(() => {});
    }
    this.state = flow.go(this.state, 'share', { signed: status.userComplete, actionStatus: status });
    try {
      this.refreshActions();
    } catch (err) {}
    this.showStep('forward');
  }

  async signUserActions() {
    const record = this.mod.document;
    const index = this.state.you?.index;
    if (!record || !Number.isInteger(index)) {
      return false;
    }
    const user = record.users[index];
    if (!user) {
      return false;
    }
    const privateKey = await this.app.wallet.getPrivateKey();
    user.signatures = record.actions
      .filter((action) => action.user === index)
      .map((action) => {
        if (action.type === 'signature') {
          return addSignature(this.app, action, privateKey);
        }
        if (action.type === 'initial') {
          return addInitial(this.app, action, privateKey);
        }
        return null;
      })
      .filter(Boolean);
    record.edited = true;
  }

  refreshActions() {
    const root = document.querySelector('.saito-container > .workspace');
    if (root && this.mod.main?.workspace) {
      this.mod.main.workspace.update(root);
    }
  }

  paintSlide() {
    const previous = document.querySelector('.saitosign-publish .actions [data-publish-action="advance"]');
    const wasDisabled = !previous || previous.disabled;
    const panel = document.querySelector('#saitosign-publish-step');
    const actionBar = document.querySelector('.saitosign-publish .actions');
    const temp = document.createElement('div');
    temp.innerHTML = PublishTemplate(this.state).trim();
    const next = temp.querySelector('#saitosign-publish-step');
    const nextActions = temp.querySelector('.saitosign-publish .actions');
    if (next && panel) {
      panel.replaceWith(next);
    }
    if (nextActions && actionBar) {
      actionBar.replaceWith(nextActions);
    }
    const button = document.querySelector('.saitosign-publish .actions [data-publish-action="advance"]');
    if (button && wasDisabled && !button.disabled) {
      button.classList.add('continue-activate');
    }
  }

  showVerifyNote(text) {
    const row = document.querySelector('.saitosign-publish .send-row');
    if (!row) {
      return;
    }
    let note = row.parentElement.querySelector('[data-sent-note]');
    if (!note) {
      note = document.createElement('p');
      note.className = 'note';
      note.dataset.sentNote = '1';
      row.insertAdjacentElement('afterend', note);
    }
    note.textContent = text;
  }

  showBackup() {
    const note = document.querySelector('[data-backup-note]');
    const key = this.state.you?.publicKey || '';
    if (!note || !key) {
      return;
    }
    note.hidden = false;
    note.textContent = key;
  }

  paintContinue() {
    const button = document.querySelector('.saitosign-publish .actions [data-publish-action="advance"]');
    if (!button) {
      return;
    }
    const ready = this.canContinue();
    const wasDisabled = button.disabled;
    button.disabled = !ready;
    button.classList.toggle('saito-button-primary', ready);
    button.classList.toggle('saito-button-secondary', !ready);
    if (ready && wasDisabled) {
      button.classList.remove('continue-activate');
      void button.offsetWidth;
      button.classList.add('continue-activate');
    }
  }

  canContinue() {
    if (this.state.step === 'select') {
      return Boolean(this.state.identified);
    }
    if (this.state.step === 'verify') {
      return flow.requiredComplete(this.state);
    }
    return true;
  }
}

function mailServerReachable(app) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const peers = app.network && app.network.peers;
  if (Array.isArray(peers) && peers.length === 0) {
    return false;
  }
  return true;
}

function signaturePlaces(mod, index) {
  const user = mod.document?.users?.[index];
  return (mod.document?.actions || []).filter((action) => {
    if (action.user !== index) {
      return false;
    }
    if (action.type !== 'signature' && action.type !== 'initial') {
      return false;
    }
    return !verifyActionSignature(mod.app, action, user);
  }).length;
}

function readUsers(mod) {
  const list = mod.document?.users || [];
  return list.map((user, index) => {
    const name = String(user?.name || '').trim();
    const email = String(user?.email || '').trim() || (isEmailAddress(name) ? name : '');
    return {
      index,
      name: email && email === name ? nameFromEmail(email) : name,
      email,
      publickey: user?.publickey || ''
    };
  });
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function nameFromEmail(email) {
  return String(email)
    .split('@')[0]
    .replace(/[._+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = PublishOverlay;
