const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const PublishTemplate = require('./publish.template');
const Photo = require('./photo');
const { signerAudit } = require('./signer-audit.model');
const ShareFlow = require('./distribute');
const Passport = require('./passport');
const IdentityPrompt = require('./identity');
const WhoTemplate = require('./who.template');
const flow = require('./publish.flow');
const { requirementLines } = require('./publish.share');
const {
  verifyEmailSignature,
  verifyPhoto,
  addSignature,
  addInitial,
  actionStatus,
  verifyActionSignature,
  clearEmailIdentifier,
  rememberEmail,
  verifiedMethods,
  verifyPassport,
  validVerification,
  verifyCreatorProof,
  finalizeDocument,
  unfinalizeDocument,
  verifyFinalization,
  signingConfigurationError,
  commitmentIntact,
  verificationSatisfied,
  knownSigner
} = require('../../auth');
const { addUser, copy, resolveSigner } = require('../../document');
const { shareMetadata } = require('../../transaction');

class PublishOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.overlay.class = 'saito-overlay saitosign-publish-host';
    this.state = flow.initialState();
    this.sliding = false;
    this.shareFlow = new ShareFlow(this);
    this.passport = new Passport();
    this.whoOverlay = new SaitoOverlay(app, mod, true);
    this.whoOverlay.class = 'saito-overlay saitosign-overlay';
  }

  render(entry) {
    this.state = flow.initialState();
    const metadata = this.mod.document?.metadata;
    if (metadata) {
      this.state = flow.applyShareMetadata(this.state, metadata);
    }
    this.state.signers = readUsers(this.mod);
    const walletKey = this.currentPublicKey();
    const owner = this.normalizePublicKey(this.mod.document?.creator);
    this.state.tierOwner = owner;
    this.state.canChooseTier = Boolean(
      !this.mod.document?.finalized &&
      this.mod.document?.creatorProof?.signature &&
      verifyCreatorProof(this.app, this.mod.document) &&
      walletKey && owner && walletKey === owner
    );
    const known = knownSigner(this.app, this.state.signers);
    if (known) {
      this.keepUser(known);
    } else {
      this.state.signers = this.state.signers.filter((signer) =>
        signaturePlaces(this.mod, signer.index) > 0
      );
    }
    this.state = flow.resolveInitial(this.state, this.workflowRequirements(this.state.canChooseTier));
    if (entry === 'prepare' && !this.mod.document?.finalized && this.state.canChooseTier) {
      this.state.entry = 'prepare';
      this.state.step = 'select';
      this.state.history = [];
    } else if (this.state.step === 'share' && !this.mod.document?.finalized) {
      this.state.entry = 'prepare';
      this.state.step = 'ready';
      this.state = this.summaryState(this.state);
    } else if (this.state.step === 'share') {
      this.state.entry = 'status';
      this.state = this.summaryState(this.state);
    }
    this.overlay.show(PublishTemplate(this.state));
    this.attachEvents();
  }

  openRecoveredVerification(user) {
    if (this.mod.retired || !user) {
      return;
    }
    const index = (this.mod.document?.users || []).indexOf(user);
    if (index < 0) {
      return;
    }
    this.state = flow.initialState();
    if (this.mod.document.metadata) {
      this.state = flow.applyShareMetadata(this.state, this.mod.document.metadata);
    }
    this.state.signers = readUsers(this.mod);
    const signer = this.state.signers.find((candidate) => candidate.index === index);
    if (!signer) {
      return;
    }
    this.state = flow.confirmYou(this.state, {
      index,
      name: signer.name,
      email: user.email || signer.email,
      publicKey: user.publickey || signer.publickey,
      identicon: ''
    });
    this.state = {
      ...this.state,
      step: 'verify',
      history: [],
      focus: 'email',
      allowUnfinalize: false,
      verifyError: ''
    };
    this.state = this.withKnownVerifications(this.state);
    this.overlay.show(PublishTemplate(this.state));
    this.attachEvents();
  }

  openShare() {
    this.shareFlow.open();
  }

  openRetry() {
    this.shareFlow.openRetry();
  }

  openUnlock() {
    this.shareFlow.openUnlock();
  }

  handleShareAction(action) {
    const name = action.dataset.publishAction;
    const known = [
      'share-assisted',
      'share-manual',
      'share-standard',
      'share-encrypted',
      'share-export',
      'share-password',
      'share-upload',
      'share-unlock',
      'share-retry',
      'share-reload',
      'share-copy',
      'share-backup',
      'share-retry-email',
      'share-retry-upload'
    ];
    if (!known.includes(name) || this.state.shareView?.busy) {
      return false;
    }
    const view = this.shareFlow.view();
    view.error = '';
    if (name === 'share-assisted') {
      this.shareFlow.ensureRecipients();
      this.shareFlow.show('share-recipients', 'forward');
    } else if (name === 'share-manual') {
      this.shareFlow.show('share-manual', 'forward');
    } else if (name === 'share-standard') {
      view.encrypted = false;
      this.shareFlow.show('share-recipients', 'forward');
    } else if (name === 'share-encrypted') {
      this.shareFlow.show('share-password', 'forward');
    } else if (name === 'share-export') {
      this.shareFlow.exportManual();
    } else if (name === 'share-password') {
      this.shareFlow.savePassword();
    } else if (name === 'share-upload') {
      this.shareFlow.uploadAndInvite();
    } else if (name === 'share-unlock') {
      this.shareFlow.unlock();
    } else if (name === 'share-retry') {
      this.shareFlow.retry();
    } else if (name === 'share-copy') {
      this.shareFlow.copyLink();
    } else if (name === 'share-backup') {
      this.shareFlow.backup();
    } else if (name === 'share-retry-email') {
      this.shareFlow.retryEmails();
    } else if (name === 'share-retry-upload') {
      this.shareFlow.uploadAndInvite();
    } else if (name === 'share-reload') {
      this.shareFlow.reloadLatest();
    }
    return true;
  }

  openSignerAudit(userIndex) {
    if (this.sliding || this.state.step !== 'share' || !Number.isInteger(userIndex)) {
      return;
    }
    const view = signerAudit(this.app, this.mod.document, userIndex);
    if (!view) {
      return;
    }
    this.state = flow.go(this.state, 'signer', {
      audit: { index: view.index, section: 'email', photo: null },
      auditView: view
    });
    this.showStep('forward');
  }

  handleAuditAction(event) {
    if (this.state.step !== 'signer') {
      return false;
    }
    const section = event.target.closest('[data-audit-section]');
    if (section) {
      event.preventDefault();
      const name = section.dataset.auditSection;
      this.state = {
        ...this.state,
        audit: {
          ...this.state.audit,
          section: name === 'signatures' || name === 'photos' ? name : 'email',
          photo: null
        }
      };
      this.paintSlide();
      return true;
    }
    const photo = event.target.closest('[data-audit-photo]');
    if (photo) {
      event.preventDefault();
      const images = this.state.auditView?.images || [];
      const count = images.length;
      const choice = photo.dataset.auditPhoto;
      let next = this.state.audit?.photo;
      if (choice === 'back') {
        next = null;
      } else if (choice === 'prev' && count) {
        next = (Number(next) - 1 + count) % count;
      } else if (choice === 'next' && count) {
        next = (Number(next) + 1) % count;
      } else if (images[Number(choice)]) {
        next = Number(choice);
      }
      this.state = { ...this.state, audit: { ...this.state.audit, section: 'photos', photo: next } };
      this.paintSlide();
      return true;
    }
    const copy = event.target.closest('[data-audit-copy]');
    if (!copy) {
      return false;
    }
    event.preventDefault();
    const root = document.querySelector('.saitosign-publish');
    const source = root?.querySelector(`[data-audit-value="${CSS.escape(copy.dataset.auditCopy)}"]`);
    const value = source?.textContent || '';
    if (!value) {
      return true;
    }
    const done = () => {
      copy.textContent = 'Copied';
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => selectAuditText(source));
      return true;
    }
    selectAuditText(source);
    return true;
  }

  openStatus(completionNote = '', entry = 'status') {
    const record = this.mod.document;
    if (!record?.finalized || !verifyFinalization(this.app, record)) {
      this.mod.main?.fail('The finalized document creator signature is invalid.');
      return;
    }
    this.state = flow.initialState();
    if (record.metadata) {
      this.state = flow.applyShareMetadata(this.state, record.metadata);
    }
    this.state.signers = readUsers(this.mod);
    const manual = entry === 'signature-export';
    const completed = entry === 'signature-complete' || manual;
    this.state.entry = entry === 'recipient' || completed ? 'recipient' : 'status';
    const locked = this.state.entry === 'recipient' && !completed ? this.lockedShareStep() : '';
    this.state = {
      ...this.summaryState(this.state),
      step: manual ? 'signature-export' : (completed ? 'signature-complete' : (locked || (this.state.entry === 'recipient' ? 'share-method' : 'share'))),
      history: [],
      allowUnfinalize: false,
      completionNote: String(completionNote || ''),
      uploadBusy: false,
      uploaded: false,
      uploadNote: ''
    };
    if (this.state.step === 'share-recipients') {
      this.shareFlow.ensureRecipients();
    }
    this.overlay.show(PublishTemplate(this.state));
    this.attachEvents();
  }

  async uploadCompletedSignatures() {
    if (this.state.step !== 'signature-complete' || this.state.uploadBusy || this.state.uploaded) {
      return;
    }
    this.state = { ...this.state, uploadBusy: true, uploadNote: '' };
    this.paintSlide();
    let result;
    try {
      result = await this.mod.syncIfShared();
    } catch (err) {
      result = { ok: false, error: err?.message };
    }
    if (result?.ok) {
      this.state = {
        ...this.state,
        uploadBusy: false,
        uploaded: true,
        uploadNote: 'Your signatures have been uploaded. You and your counterparties will be notified by email.'
      };
    } else {
      const raw = String(result?.error || '');
      this.state = {
        ...this.state,
        uploadBusy: false,
        uploaded: false,
        uploadNote: raw.startsWith('This upload was not signed')
          ? 'The signatures could not be uploaded. Use the link to try again.'
          : (raw || 'The signatures could not be uploaded. Use the link to try again.')
      };
    }
    this.paintSlide();
  }

  async exportSignedCopy() {
    if (this.state.step !== 'signature-export' || this.state.uploadBusy) {
      return;
    }
    this.state = { ...this.state, uploadBusy: true, uploadNote: '' };
    this.paintSlide();
    let result;
    try {
      result = await this.mod.exportDocument();
    } catch (err) {
      result = { ok: false };
    }
    if (result?.ok) {
      const filename = result.filename ? `Your browser downloaded ${result.filename}. ` : '';
      this.state = {
        ...this.state,
        uploadBusy: false,
        uploaded: true,
        uploadNote: `${filename}Send that file to the other signers. SaitoSign does not deliver it for you.`
      };
    } else {
      this.state = {
        ...this.state,
        uploadBusy: false,
        uploaded: false,
        uploadNote: 'The document was not exported. Use the link to try again.'
      };
    }
    this.paintSlide();
  }

  beginVerification(signerIndex, actionId) {
    const record = this.mod.document;
    const signer = readUsers(this.mod).find((candidate) => candidate.index === signerIndex);
    if (!record?.finalized || !signer || !Number.isInteger(Number(actionId))) {
      return;
    }
    this.state = flow.initialState();
    if (record.metadata) {
      this.state = flow.applyShareMetadata(this.state, record.metadata);
    }
    this.state.signers = readUsers(this.mod);
    this.keepUser(signer);
    this.state = {
      ...this.state,
      step: 'verify',
      history: [],
      allowUnfinalize: false,
      afterVerify: 'sign',
      pendingActionId: Number(actionId)
    };
    this.overlay.show(PublishTemplate(this.state));
    this.attachEvents();
  }

  async confirmReady() {
    const ready = await this.commitFinalization();
    if (!ready) {
      return;
    }
    this.state.entry = 'prepare';
    this.state = flow.go(this.state, 'decide-sign');
    this.showStep('forward');
  }

  async reopenForEditing() {
    if (!this.mod.document?.finalized) {
      return true;
    }
    try {
      const reopened = await unfinalizeDocument(this.app, this.mod.document);
      if (!reopened) {
        this.mod.main?.fail('Only the document creator can change this finalized document.');
        return false;
      }
      this.refreshWorkspace();
      return true;
    } catch (err) {
      this.mod.main?.fail('Only the document creator can change this finalized document.');
      return false;
    }
  }

  async commitFinalization() {
    if (this.mod.retired || this.sliding || (this.state.step !== 'share' && this.state.step !== 'ready') || this.mod.document?.finalized) {
      return false;
    }
    this.sliding = true;
    let ready = false;
    try {
      this.writeShare();
      const record = this.mod.document;
      const creator = String(record?.creator || '').trim();
      if (!record || !creator) {
        this.mod.main?.fail('This document could not be finalized.');
        return false;
      }
      const problem = signingConfigurationError(record);
      if (problem) {
        this.mod.main?.fail(problem);
        return false;
      }
      const snapshot = {
        finalized: record.finalized,
        finalization: record.finalization ? JSON.parse(JSON.stringify(record.finalization)) : null,
        creatorProof: record.creatorProof ? JSON.parse(JSON.stringify(record.creatorProof)) : null,
        edited: record.edited,
        hash: String(record.hash || '')
      };
      const finalized = await finalizeDocument(this.app, record, creator);
      if (!finalized || !verifyFinalization(this.app, record) || !verifyCreatorProof(this.app, record)) {
        record.finalized = snapshot.finalized;
        record.finalization = snapshot.finalization;
        record.creatorProof = snapshot.creatorProof;
        record.edited = snapshot.edited;
        record.hash = snapshot.hash;
        this.mod.main?.fail('This document could not be finalized.');
        return false;
      }
      if (record.metadata) {
        const saved = flow.applyShareMetadata(this.state, record.metadata);
        this.state = { ...this.state, plan: saved.plan, options: saved.options };
      }
      this.state = this.summaryState({ ...this.state, allowUnfinalize: false, entry: 'prepare' });
      this.refreshWorkspace();
      ready = true;
    } catch (err) {
      this.mod.main?.fail('This document could not be finalized.');
    } finally {
      this.sliding = false;
    }
    return ready;
  }

  async reopenTier() {
    if (this.sliding || this.state.step !== 'share' || !this.state.allowUnfinalize) {
      return;
    }
    this.sliding = true;
    let ready = false;
    try {
      const reopened = await unfinalizeDocument(this.app, this.mod.document);
      if (!reopened) {
        this.mod.main?.fail('Only the document creator can change this finalized document.');
        return;
      }
      this.state = { ...flow.back(this.state), allowUnfinalize: false };
      this.refreshWorkspace();
      ready = true;
    } catch (err) {
      this.mod.main?.fail('Only the document creator can change this finalized document.');
    } finally {
      this.sliding = false;
    }
    if (ready) {
      await this.showStep('back');
    }
  }

  refreshWorkspace() {
    const workspace = this.mod.main?.workspace;
    const root = document.querySelector('.saito-container > .workspace');
    if (workspace && root) {
      workspace.update(root);
    }
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
    const content = panel?.closest('.content');
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
    if (nextActions) {
      if (actionBar) {
        actionBar.replaceWith(nextActions);
      } else if (content) {
        content.appendChild(nextActions);
      }
    } else if (actionBar) {
      actionBar.remove();
    }

    this.attachEvents();
    await wait(220);
    this.sliding = false;
  }

  attachEvents() {
    const root = document.querySelector('.saitosign-publish');
    if (!root) {
      return;
    }
    this.passport.attach(root, {
      onUpload: (image) => this.acceptPassport(image),
      onRemove: () => this.removePassport(),
      onError: (message) => {
        this.state = { ...this.state, passportError: message };
        this.paintSlide();
      }
    });
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.addEventListener('input', (event) => {
      const view = this.state.shareView;
      if (!view) {
        return;
      }
      if (event.target.matches('[data-share-password]')) {
        view.password = event.target.value;
      }
      if (event.target.matches('[data-share-password-confirm]')) {
        view.confirm = event.target.value;
      }
      if (event.target.matches('[data-share-password], [data-share-password-confirm]')) {
        view.prepared = null;
        if (!view.stored) {
          view.clientKey = '';
        }
      }
    });

    root.addEventListener('change', (event) => {
      const protect = event.target.closest('[data-share-protect]');
      if (protect && this.state.shareView) {
        this.state.shareView.protect = protect.checked === true;
        this.state.shareView.prepared = null;
        if (!this.state.shareView.stored) {
          this.state.shareView.clientKey = '';
        }
        this.state.shareView.error = '';
        this.paintSlide();
        return;
      }
      const option = event.target.closest('[data-share-option]');
      if (option && this.state.step === 'select' && this.state.canChooseTier) {
        this.state = flow.setShareOption(this.state, option.dataset.shareOption, option.checked);
        this.writeShare();
        return;
      }
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

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      const signer = event.target.closest('[data-signer-audit]');
      if (!signer || this.state.step !== 'share') {
        return;
      }
      event.preventDefault();
      this.openSignerAudit(Number(signer.dataset.signerAudit));
    });

    root.addEventListener('click', async (event) => {
      if (this.handleAuditAction(event)) {
        return;
      }
      const signer = event.target.closest('[data-signer-audit]');
      if (signer && this.state.step === 'share') {
        this.openSignerAudit(Number(signer.dataset.signerAudit));
        return;
      }

      const plan = event.target.closest('[data-plan]');
      if (plan && this.state.step === 'select') {
        if (!this.state.canChooseTier) {
          return;
        }
        this.state = flow.selectPlan(this.state, plan.dataset.plan);
        this.paintSlide();
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
        if (this.recipientEntryStep()) {
          this.close();
          return;
        }
        const next = flow.back(this.state);
        if (next === this.state) {
          return;
        }
        if (this.state.entry === 'prepare' && (next.step === 'select' || next.step === 'ready')) {
          const reopened = await this.reopenForEditing();
          if (!reopened) {
            return;
          }
        }
        this.state = next.step === 'ready' || next.step === 'share' ? this.summaryState(next) : next;
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

      if (action.dataset.publishAction === 'take-photo') {
        this.takePhoto();
        return;
      }

      if (action.dataset.publishAction === 'review') {
        this.close();
        return;
      }

      if (action.dataset.publishAction === 'share' || action.dataset.publishAction === 'upload-share') {
        this.openShare();
        return;
      }

      if (action.dataset.publishAction === 'ready-no') {
        this.close();
        return;
      }

      if (action.dataset.publishAction === 'ready-yes') {
        this.confirmReady();
        return;
      }

      if (action.dataset.publishAction === 'sign-yes') {
        this.showWhoAreYou();
        return;
      }

      if (action.dataset.publishAction === 'sign-no') {
        this.state.entry = 'prepare';
        this.shareFlow.ensureRecipients();
        this.state = flow.go(this.state, 'share-method');
        this.showStep('forward');
        return;
      }

      if (action.dataset.publishAction === 'finalize') {
        this.commitFinalization();
        return;
      }

      if (action.dataset.publishAction === 'sign-now') {
        this.showWhoAreYou();
        return;
      }

      if (action.dataset.publishAction === 'skip-sign') {
        this.openShare();
        return;
      }

      if (this.handleShareAction(action)) {
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

      if (action.dataset.publishAction === 'upload-signatures') {
        this.uploadCompletedSignatures();
        return;
      }

      if (action.dataset.publishAction === 'export-signed') {
        this.exportSignedCopy();
        return;
      }

      if (action.dataset.publishAction === 'advance') {
        if (this.state.step === 'select') {
          this.writeShare();
          this.state = flow.go(this.state, 'ready', { allowUnfinalize: false, entry: 'prepare' });
          this.state = this.summaryState(this.state);
          this.showStep('forward');
          return;
        }
        if (this.state.step === 'verify') {
          this.continueAfterVerification();
          return;
        }
        if (this.state.step === 'sign') {
          this.continueAfterSigning();
          return;
        }
        const next = flow.advance(this.state, this.workflowRequirements());
        if (next === this.state) {
          return;
        }
        this.state = this.withKnownVerifications(next);
        if (this.state.step === 'share') {
          this.state = this.summaryState(this.state);
        }
        this.writeShare();
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
    root.querySelectorAll('[data-tier-feature]').forEach((feature) => {
      const included = this.state.plan === 'premium' || feature.dataset.freeAvailable === 'true';
      feature.classList.toggle('included', included);
      feature.classList.toggle('unavailable', !included);
      const indicator = feature.querySelector('.feature-indicator');
      if (indicator) {
        indicator.textContent = '';
        indicator.setAttribute('aria-label', included ? 'Included with this tier' : 'Not available on this tier');
      }
    });
  }

  writeShare() {
    const record = this.mod.document;
    if (!record || record.finalized) {
      return;
    }
    if (!this.state.canChooseTier && record.metadata) {
      return;
    }
    record.metadata = shareMetadata(this.state.plan, this.state.options, this.state.tierOwner);
  }

  currentPublicKey() {
    return this.normalizePublicKey(this.app.wallet?.publicKey);
  }

  isCreator() {
    const creator = this.normalizePublicKey(this.mod.document?.creator);
    return Boolean(creator && creator === this.currentPublicKey());
  }

  lockedShareStep() {
    if (this.isCreator()) {
      return '';
    }
    if (this.mod.receivedBy === 'link' || this.mod.share?.id) {
      return 'share-recipients';
    }
    return 'share-manual';
  }

  recipientEntryStep() {
    return this.state.entry === 'recipient'
      && !this.state.history.length
      && (this.state.step === 'share-method' || this.state.step === 'share-recipients' || this.state.step === 'share-manual');
  }

  normalizePublicKey(value) {
    let publickey = String(value || '').trim();
    if (/^[0-9a-fA-F]+$/.test(publickey) && publickey.length >= 64) {
      publickey = this.app.crypto.compressPublicKey(publickey);
    }
    return publickey;
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
    this.continueAfterIdentity();
  }

  showWhoAreYou() {
    if (!this.state.finalized) {
      return;
    }
    const signers = shareRowsForWho(this.state);
    if (!signers.length) {
      return;
    }
    this.whoOverlay.show(WhoTemplate(signers));
    const root = document.querySelector('.saitosign-who');
    if (!root) {
      return;
    }
    root.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-who-signer]');
      if (!choice) {
        return;
      }
      event.preventDefault();
      const index = Number(choice.dataset.whoSigner);
      const signer = this.state.signers.find((candidate) => candidate.index === index);
      if (!signer) {
        return;
      }
      this.whoOverlay.close();
      const prompt = new IdentityPrompt(this.app, this.mod);
      prompt.render(signer.name || signer.email || '', {
        onYes: () => this.beginSigningAs(signer)
      });
    });
  }

  beginSigningAs(signer) {
    if (!signer || !this.state.finalized) {
      return;
    }
    this.keepUser(signer);
    const actionId = firstUnsignedActionId(this.app, this.mod.document, signer.index);
    this.state = flow.go(this.state, 'verify', {
      afterVerify: 'sign',
      pendingActionId: actionId,
      allowUnfinalize: false,
      verifyError: ''
    });
    this.state = this.withKnownVerifications(this.state);
    this.showStep('forward');
  }

  addSigner() {
    if (!this.state.canChooseTier || this.mod.document?.finalized) {
      return;
    }
    const input = document.querySelector('[data-new-signer-name]');
    const value = input?.value.trim();
    if (!value) {
      return;
    }
    const email = isEmailAddress(value) ? value : '';
    const name = email ? nameFromEmail(email) : value;
    const decision = resolveSigner(this.mod.document, value, email ? name : undefined);
    if (decision.action === 'existing') {
      if (decision.conflict) {
        duplicateSignerNotice();
        return;
      }
      this.state.signers = readUsers(this.mod);
      const existing = this.state.signers.find((candidate) => candidate.index === decision.index);
      if (!existing) {
        return;
      }
      this.keepUser(existing);
      this.continueAfterIdentity();
      if (input) {
        input.value = '';
      }
      return;
    }
    const index = addUser(this.mod.document, name, this.app.wallet?.publicKey);
    if (index < 0) {
      return;
    }
    if (email) {
      this.mod.document.users[index].email = email;
    }
    this.state.signers = readUsers(this.mod);
    const added = this.state.signers.find((candidate) => candidate.index === index);
    if (!added) {
      return;
    }
    this.keepUser(added);
    this.continueAfterIdentity();
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
      const previousPublickey = String(live.publickey || '').trim();
      if (email) {
        live.email = email;
      }
      live.publickey = publickey;
      const verifications = Array.isArray(live.verifications) ? live.verifications : [];
      const stalePhoto = verifications.some((entry) => {
        const method = String(entry?.method || '').trim();
        return (method === 'photo' || (!method && String(entry?.message || '').startsWith('Photo received for verification of publickey ')))
          && !validVerification(this.app, entry, live);
      });
      const stalePassport = verifications.some((entry) =>
        String(entry?.method || '').trim() === 'passport' && !validVerification(this.app, entry, live)
      );
      const validVerifications = verifications.filter((entry) => validVerification(this.app, entry, live));
      if (validVerifications.length !== verifications.length || previousPublickey !== publickey) {
        live.verifications = validVerifications;
        this.mod.document.edited = true;
      }
      if (stalePhoto || stalePassport) {
        this.state = {
          ...this.state,
          verificationMethods: this.state.verificationMethods.map((method) =>
            (method.id === 'photo' && stalePhoto) || (method.id === 'passport' && stalePassport)
              ? { ...method, required: true, selected: true, status: 'pending' }
              : method
          )
        };
      }
    }
    this.state = flow.confirmYou(this.state, you);
    this.state.places = signaturePlaces(this.mod, you.index);
    this.state = this.withKnownVerifications(this.state);
  }

  withKnownVerifications(state) {
    const live = this.mod.document?.users?.[state.you?.index];
    const known = verifiedMethods(this.app, live);
    const image = storedPhoto(live);
    const passport = storedPassport(live);
    const verificationMethods = (state.verificationMethods || []).map((method) => {
      if (!method.required) {
        return method;
      }
      if (!known.includes(method.id)) {
        return method.status === 'verified'
          ? { ...method, status: 'pending' }
          : method;
      }
      const next = method.status === 'verified' ? method : { ...method, status: 'verified', selected: true };
      if (method.id === 'photo' && image) {
        return { ...next, photo: image };
      }
      if (method.id === 'passport' && passport) {
        return { ...next, image: passport };
      }
      return next;
    });
    return { ...state, verificationMethods };
  }

  workflowRequirements(newDocument = false) {
    const identified = Boolean(this.state.identified && this.state.you);
    const index = this.state.you?.index;
    return {
      newDocument,
      identified,
      outstandingSignatures: identified && signaturePlaces(this.mod, index) > 0,
      verificationComplete: identified && flow.requiredComplete(this.state)
    };
  }

  continueAfterIdentity() {
    if (!this.state.identified || !this.state.you) {
      return;
    }
    this.state = flow.resolveAfter(this.state, 'identity', this.workflowRequirements());
    if (this.state.step === 'share') {
      this.state = this.summaryState(this.state);
    }
    this.writeShare();
    this.showStep('forward');
  }

  async continueAfterSigning() {
    if (!this.state.identified || !this.state.you || this.sliding) {
      return;
    }
    const record = this.mod.document;
    const user = record?.users?.[this.state.you.index];
    if (user && !verificationSatisfied(this.app, record, user)) {
      this.state = this.withKnownVerifications(this.state);
      this.state = flow.go(this.state, 'verify', { verifyError: '' });
      this.showStep('forward');
      return;
    }
    try {
      const signed = await this.signUserActions();
      if (!signed) {
        this.showSignError('Could not sign these actions with the current wallet key.');
        return;
      }
    } catch (err) {
      this.showSignError('Could not sign these actions. Please try again.');
      return;
    }
    this.state.places = signaturePlaces(this.mod, this.state.you.index);
    if (this.state.places > 0) {
      this.showSignError('Some actions still need a valid signature.');
      return;
    }
    this.refreshActions();
    // Signing is followed by the verification stage in this flow, even when
    // this signer already has every selected proof on file.
    this.state = flow.go(this.state, 'verify', { places: 0, verifyError: '' });
    this.showStep('forward');
  }

  showSignError(message) {
    const root = document.querySelector('.saitosign-publish');
    if (!root) return;
    let note = root.querySelector('[data-sign-error]');
    if (!note) {
      note = document.createElement('p');
      note.className = 'note fail';
      note.dataset.signError = '1';
      root.querySelector('.sign-step')?.appendChild(note);
    }
    if (note) note.textContent = message;
  }

  sendEmail() {
    if (this.mod.retired) {
      return;
    }
    const input = document.querySelector('[data-verify-email]');
    const email = (input?.value || this.state.you?.email || '').trim();
    const publickey = this.state.you?.publicKey || '';
    if (!email || !publickey || !this.state.you) {
      this.state = { ...this.state, verifyError: 'Enter an email address to verify.' };
      this.paintSlide();
      return;
    }
    clearEmailIdentifier(this.app, publickey);
    clearEmailIdentifier(this.app, this.app.wallet?.publicKey);
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

    const finish = (apply) => {
      if (request.done) {
        return;
      }
      request.done = true;
      clearTimeout(timer);
      apply();
    };

    let sent;
    try {
      sent = this.app.network.sendRequestAsTransaction(
        'saitosign verify email',
        { email, publickey },
        (res) => {
          finish(() => {
            if (res?.publickey) {
              this.serverkey = res.publickey;
            }
            if (res?.success && res.publickey) {
              this.keepVerification(res, email, publickey).then(() => {
                this.rememberDevCode(res);
                this.paintSlide();
              }).catch(() => {
                this.state = { ...this.state, verifyError: 'This server cannot send a verification email.' };
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
          });
        }
      );
    } catch (err) {
      finish(() => this.showMailUnreachable());
      return;
    }

    Promise.resolve(sent).catch(() => {
      finish(() => this.showMailUnreachable());
    });
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
      keepMethod(live, verification);
    }

    if (res.signature) {
      try {
        await this.mod.persistDraft({ code: res.signature, document: copy(this.mod.document) });
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
    if (this.mod.retired || this.state.checking) {
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
      keepMethod(live, {
        method: 'email',
        publickey: this.serverkey,
        message: `Request received for verification of email ${email} with publickey ${publickey}`,
        signature,
        returned: true
      });
    }
    this.mod.persistDraft({ code: signature, document: copy(this.mod.document) }).catch(() => {});
    rememberEmail(this.app, publickey, email);
    this.state = flow.markMethodVerified(
      { ...this.state, checking: false, pendingCode: '', verifyError: '' },
      'email'
    );
    this.paintSlide();
  }

  takePhoto() {
    if (this.mod.retired) {
      return;
    }
    const photo = new Photo(this.app, this.mod);
    this.photo = photo;
    photo.open({
      onAccept: (image) => this.acceptPhoto(image)
    });
  }

  async acceptPhoto(image) {
    if (this.mod.retired) {
      return;
    }
    const you = this.state.you;
    const publickey = you?.publicKey || '';
    const live = you ? this.mod.document.users[you.index] : null;
    if (!live || !publickey) {
      photoNotice('That photo could not be saved.');
      return;
    }

    let proof;
    try {
      proof = await verifyPhoto(this.app, publickey, image);
    } catch (err) {
      photoNotice('That photo could not be saved.');
      return;
    }

    if (!live.publickey) {
      live.publickey = publickey;
    }
    keepMethod(live, proof);
    this.mod.document.edited = true;
    const verified = flow.markMethodVerified(
      { ...this.state, focus: 'photo', upsell: null, verifyError: '' },
      'photo'
    );
    this.state = {
      ...verified,
      verificationMethods: verified.verificationMethods.map((method) => {
        if (method.id !== 'photo') {
          return method;
        }
        return { ...method, photo: proof.photo || image };
      })
    };
    this.paintSlide();
  }

  async acceptPassport(image) {
    const you = this.state.you;
    const publickey = you?.publicKey || '';
    const live = you ? this.mod.document.users[you.index] : null;
    if (!live || !publickey) {
      return;
    }
    try {
      const proof = await verifyPassport(this.app, publickey, image);
      keepMethod(live, proof);
      this.mod.document.edited = true;
      this.state = {
        ...flow.markMethodVerified({ ...this.state, passportError: '', focus: 'passport' }, 'passport'),
        verificationMethods: this.state.verificationMethods.map((method) =>
          method.id === 'passport' ? { ...method, status: 'verified', selected: true, image: proof.image } : method
        )
      };
      this.paintSlide();
    } catch (err) {
      this.state = { ...this.state, passportError: 'That passport image could not be verified.' };
      this.paintSlide();
    }
  }

  removePassport() {
    const you = this.state.you;
    const live = you ? this.mod.document.users[you.index] : null;
    if (!live) {
      return;
    }
    live.verifications = (live.verifications || []).filter((entry) => entry?.method !== 'passport');
    this.mod.document.edited = true;
    this.state = {
      ...this.state,
      passportError: '',
      verificationMethods: this.state.verificationMethods.map((method) =>
        method.id === 'passport' ? { ...method, status: 'pending', image: '', selected: true } : method
      )
    };
    this.paintSlide();
  }

  async continueAfterVerification() {
    this.state = this.withKnownVerifications(this.state);
    if (!flow.requiredComplete(this.state) || this.sliding) {
      this.paintSlide();
      return;
    }
    const record = this.mod.document;
    const signature = record?.users?.[this.state.you?.index]?.verifications?.[0]?.signature || '';
    if (signature) {
      this.mod.persistDraft({ code: signature, document: copy(record) }).catch(() => {});
    }
    if (this.state.afterVerify === 'sign') {
      const actionId = this.state.pendingActionId;
      this.state = { ...this.state, afterVerify: '', pendingActionId: null };
      this.close();
      this.refreshWorkspace();
      this.mod.main?.workspace?.continueSigning(actionId);
      return;
    }
    this.state = flow.resolveAfter(this.state, 'verify', this.workflowRequirements());
    this.state = this.summaryState(this.state);
    this.writeShare();
    this.refreshActions();
    this.showStep('forward');
  }

  summaryState(state) {
    const record = this.mod.document;
    const userIndex = state.you?.index;
    const status = actionStatus(this.app, record?.actions, record?.users, userIndex, record);
    const creatorKey = this.normalizePublicKey(record?.creator);
    const pageCount = Number(record?.document?.page_count) || 0;
    const signers = readUsers(this.mod).map((signer) => {
      const signerStatus = actionStatus(this.app, record?.actions, record?.users, signer.index, record);
      return {
        ...signer,
        places: signerStatus.mine,
        signed: signerStatus.mine > 0 && signerStatus.userComplete,
        creator: Boolean(creatorKey) && this.normalizePublicKey(signer.publickey) === creatorKey,
        requirements: requirementLines(record?.actions, signer.index, pageCount)
      };
    }).filter((signer) => signer.places > 0);
    return {
      ...state,
      signers,
      signed: status.mine > 0 && status.userComplete,
      actionStatus: status,
      finalized: Boolean(record?.finalized)
    };
  }

  async signUserActions() {
    if (this.mod.retired) {
      return false;
    }
    const record = this.mod.document;
    if (!record) {
      return false;
    }
    const index = this.state.you?.index;
    if (!record || !Number.isInteger(index)) {
      return false;
    }
    const user = record.users[index];
    if (!user) {
      return false;
    }
    const walletKey = this.currentPublicKey();
    if (!walletKey || walletKey !== this.normalizePublicKey(user.publickey)) {
      return false;
    }
    if (!verificationSatisfied(this.app, record, user)) {
      return false;
    }
    if (!commitmentIntact(this.app, record)) {
      return false;
    }
    const privateKey = await this.app.wallet.getPrivateKey();
    const additions = record.actions
      .filter((action) => Number(action.user) === index && !verifyActionSignature(this.app, action, user, record))
      .map((action) => {
        if (action.type === 'signature') {
          return addSignature(this.app, action, privateKey, record.hash);
        }
        if (action.type === 'initial') {
          return addInitial(this.app, action, privateKey, record.hash);
        }
        return null;
      })
      .filter((entry) => entry?.signature);
    const addedIds = new Set(additions.map((entry) => Number(entry.id)));
    user.signatures = (Array.isArray(user.signatures) ? user.signatures : [])
      .filter((entry) => !addedIds.has(Number(entry?.id)))
      .concat(additions);
    record.edited = true;
    return true;
  }

  refreshActions() {
    const root = document.querySelector('.saito-container > .workspace');
    if (root && this.mod.main?.workspace) {
      this.mod.main.workspace.update(root);
    }
  }

  paintSlide() {
    if (this.state.step === 'signer' && this.state.audit) {
      this.state.auditView = signerAudit(this.app, this.mod.document, this.state.audit.index);
    }
    if (this.state.step === 'verify') {
      this.state = this.withKnownVerifications(this.state);
    }
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
    if (this.state.step === 'sign') {
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
    if (Number(action.user) !== index) {
      return false;
    }
    if (action.type !== 'signature' && action.type !== 'initial') {
      return false;
    }
    return !verifyActionSignature(mod.app, action, user, mod.document);
  }).length;
}

function firstUnsignedActionId(app, record, userIndex) {
  const user = record?.users?.[userIndex];
  const action = (record?.actions || []).find((item) =>
    Number(item.user) === userIndex
    && (item.type === 'signature' || item.type === 'initial')
    && !verifyActionSignature(app, item, user, record)
  );
  return Number.isInteger(Number(action?.id)) ? Number(action.id) : null;
}

function shareRowsForWho(state) {
  return (state.signers || [])
    .filter((signer) => Number(signer.places) > 0)
    .map((signer) => ({
      index: signer.index,
      name: signer.name || signer.email || 'Signer',
      email: signer.email || ''
    }));
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

function storedPhoto(user) {
  const entries = Array.isArray(user?.verifications) ? user.verifications : [];
  const entry = entries.find((item) => item?.method === 'photo' && typeof item.photo === 'string');
  const image = String(entry?.photo || '').trim();
  return image.startsWith('data:image/') ? image : '';
}

function storedPassport(user) {
  const entries = Array.isArray(user?.verifications) ? user.verifications : [];
  const entry = entries.find((item) => item?.method === 'passport' && typeof item.image === 'string');
  const image = String(entry?.image || '').trim();
  return image.startsWith('data:image/') ? image : '';
}

function photoNotice(message) {
  if (typeof siteMessage === 'function') {
    siteMessage(message, 3000);
  }
}

function keepMethod(user, entry) {
  const method = String(entry?.method || '');
  const kept = (user.verifications || []).filter((item) => {
    if (!item.method) {
      return false;
    }
    if (!method) {
      return item.method !== 'email';
    }
    return item.method !== method;
  });
  kept.push(entry);
  user.verifications = kept;
}

function duplicateSignerNotice() {
  if (typeof siteMessage === 'function') {
    siteMessage('Adding multiple users with the same email address is not permitted.', 3000);
  }
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

function selectAuditText(node) {
  if (!node) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

module.exports = PublishOverlay;
