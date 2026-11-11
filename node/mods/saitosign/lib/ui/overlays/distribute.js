const flow = require('./publish.flow');
const PublishTemplate = require('./publish.template');
const { shareRows } = require('./publish.flow');
const { recipientList, invalidRecipients, sharePurpose, isEmailAddress, shareProtectionError } = require('../../share-protocol');
const {
  sendShare,
  createShareTransaction,
  signShareTransaction,
  shareTransactionSerial,
  transactionFromSerial,
  submitShareTransaction,
  stagedArchive,
  documentFromStored,
  shareSource
} = require('../../share-client');
const { createPrepareTransaction } = require('../../transaction');
const { encryptPackage } = require('../../envelope');
const { zipPackage } = require('../../archive');
const { hydrate } = require('../../document');

class ShareFlow {
  constructor(publish) {
    this.publish = publish;
    this.app = publish.app;
    this.mod = publish.mod;
  }

  view() {
    if (!this.publish.state.shareView) {
      this.publish.state.shareView = {
        purpose: 'access',
        recipients: [],
        encrypted: null,
        protect: false,
        password: '',
        confirm: '',
        prepared: null,
        clientKey: '',
        filename: '',
        busy: false,
        error: '',
        heading: '',
        detail: '',
        outcome: '',
        startedAt: 0,
        copied: false,
        link: '',
        needsPassword: false,
        conflict: false
      };
    }
    return this.publish.state.shareView;
  }

  show(step, direction) {
    if (step !== 'share-progress') {
      this.stopClock();
    }
    const current = this.publish.state.step;
    if (direction === 'replace' || current === step) {
      this.publish.state.step = step;
      if (document.querySelector('#saitosign-publish-step')) {
        this.publish.paintSlide();
        return;
      }
      this.publish.overlay.show(PublishTemplate(this.publish.state));
      this.publish.attachEvents();
      return;
    }
    this.publish.state = flow.go(this.publish.state, step);
    this.publish.showStep(direction || 'forward');
  }

  ensureRecipients() {
    const view = this.view();
    if (view.recipients.length) {
      return;
    }
    const record = this.mod.document;
    const purpose = sharePurpose(record);
    view.purpose = purpose;
    if (purpose !== 'sign') {
      view.recipients = [{ email: '', signerIndex: null }];
      return;
    }
    const rows = shareRows({
      signers: (record?.users || []).map((user, index) => ({
        index,
        name: user.name,
        email: user.email,
        places: (record.actions || []).filter((action) => action.user === index).length,
        signed: false
      })),
      you: null
    }).map((row) => ({ email: row.email || '', signerIndex: row.index }));
    view.recipients = rows.length ? rows : [{ email: '', signerIndex: null }];
  }

  open() {
    const view = this.view();
    view.purpose = sharePurpose(this.mod.document);
    view.error = '';
    this.ensureRecipients();
    this.show('share-method', 'forward');
  }

  openRetry() {
    const share = this.mod.share || {};
    const view = this.view();
    view.conflict = share.conflict === true;
    view.needsPassword = share.encrypted === true && !share.password;
    view.busy = false;
    view.heading = share.conflict
      ? 'A newer version is already stored'
      : (share.encrypted ? 'Your signature has not yet been shared' : 'Signature saved locally — upload required');
    view.detail = share.conflict
      ? 'Your signature is still on this device. Reload the latest document before uploading again. Reloading replaces this local copy, so a signature that is not in the newer version will need to be added again.'
      : (share.encrypted
        ? 'Your signed document is still available on this device. We could not upload the updated encrypted document.'
        : 'Your signature has been completed, but the updated document has not yet been shared with the other participants.');
    view.error = '';
    this.show('share-retry', document.querySelector('#saitosign-publish-step') ? 'forward' : 'replace');
  }

  openUnlock() {
    const view = this.view();
    view.error = '';
    view.busy = false;
    view.password = view.password || '';
    this.publish.state.history = [];
    this.show('share-unlock', 'replace');
  }

  async copyLink() {
    const view = this.view();
    const link = view.link || '';
    if (!link) {
      view.error = 'The sharing link is not available yet.';
      this.publish.paintSlide();
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      view.copied = true;
      view.error = '';
    } catch (err) {
      view.copied = false;
      view.error = 'The link could not be copied. Select it and copy it manually.';
    }
    this.publish.paintSlide();
  }

  async backup() {
    const view = this.view();
    const result = await this.mod.exportDocument();
    if (!result || result.ok === false) {
      view.error = view.error || 'The backup was not downloaded.';
    } else {
      view.filename = result.filename;
      view.error = '';
    }
    this.publish.paintSlide();
  }

  async exportManual() {
    const view = this.view();
    const result = await this.mod.exportDocument();
    if (!result || result.ok === false) {
      view.error = 'The document was not exported. Correct the problem shown on the document page, then choose Export Document again.';
      this.show('share-manual', 'replace');
      return;
    }
    view.filename = result.filename;
    view.error = '';
    this.show('share-exported', 'forward');
  }

  async savePassword() {
    const view = this.view();
    view.protect = true;
    const problem = shareProtectionError(view);
    if (problem) {
      view.error = problem;
      this.show('share-recipients', 'replace');
      return;
    }
    view.encrypted = true;
    view.error = '';
    this.show('share-recipients', 'replace');
  }

  startClock() {
    this.stopClock();
    const view = this.view();
    view.startedAt = view.startedAt || Date.now();
    this.clock = setInterval(() => {
      const elapsed = document.querySelector('.share-elapsed');
      if (!elapsed || !view.startedAt) {
        return;
      }
      const seconds = Math.max(0, Math.floor((Date.now() - view.startedAt) / 1000));
      elapsed.textContent = seconds ? `${seconds}s` : '';
    }, 1000);
  }

  stopClock() {
    if (this.clock) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  pause() {
    return new Promise((resolve) => setTimeout(resolve, 40));
  }

  setWorking(message) {
    const view = this.view();
    view.heading = 'Sharing your document';
    view.detail = message;
    view.outcome = 'working';
    view.error = '';
    this.show('share-progress', 'replace');
    this.startClock();
  }

  failStage(stage, detail) {
    const view = this.view();
    view.busy = false;
    view.outcome = 'failed';
    view.heading = 'Sharing your document';
    view.detail = '';
    view.error = `${stage}: ${detail || 'The operation did not finish.'}`;
    this.stopClock();
    this.show('share-progress', 'replace');
  }

  async uploadAndInvite() {
    const view = this.view();
    if (view.busy) {
      return;
    }
    if (view.stored && this.mod.share?.id && this.mod.share?.token) {
      return this.retryEmails();
    }
    const recipients = recipientList(view.recipients).filter((recipient) => recipient.email);
    if (!recipients.length || recipients.some((recipient) => !isEmailAddress(recipient.email)) || invalidRecipients(recipients).length) {
      view.error = 'Enter a valid email address for every recipient before sending.';
      this.show('share-recipients', 'replace');
      return;
    }
    const protection = shareProtectionError(view);
    if (protection) {
      view.error = protection;
      this.show('share-recipients', 'replace');
      return;
    }
    const record = this.mod.document;
    const filename = record?.document?.name || 'document';
    const usePassword = view.protect ? view.password : '';
    const source = shareSource(record);
    view.busy = true;
    view.encrypted = Boolean(usePassword);
    view.copied = false;
    view.error = '';
    view.filename = filename;
    view.startedAt = Date.now();
    if (!view.clientKey) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      view.clientKey = Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('');
    }
    this.setWorking('Preparing your document...');
    await this.pause();
    let payload;
    let stage = 'Preparing your document';
    try {
      const cached = view.prepared;
      if (cached && cached.source === source && cached.password === usePassword && cached.payload) {
        payload = cached.payload;
      } else {
        const prepared = await createPrepareTransaction(this.app, record);
        stage = 'Creating your document archive';
        this.setWorking('Creating your document archive...');
        await this.pause();
        const archive = stagedArchive(this.app, record, prepared);
        const packed = zipPackage(archive.bytes);
        if (usePassword) {
          stage = 'Encrypting your document';
          this.setWorking('Encrypting your document...');
          await this.pause();
          payload = { is_encrypted: true, document: await encryptPackage(JSON.stringify(packed), usePassword), filename: archive.filename };
        } else {
          payload = { is_encrypted: false, document: packed, filename: archive.filename };
        }
        view.prepared = { source, password: usePassword, payload, serial: '' };
      }
    } catch (err) {
      view.prepared = null;
      this.failStage(stage, err?.message || 'The document could not be prepared.');
      return;
    }
    const originator = (record.users || []).find((user) => user.publickey && user.publickey === record.creator) || {};
    const request = {
      action: 'create',
      document: payload.document,
      is_encrypted: payload.is_encrypted,
      purpose: view.purpose,
      recipients,
      originator_name: originator.name || 'A SaitoSign user',
      originator_email: originator.email || '',
      document_name: filename,
      tier: record?.metadata?.tier,
      client_key: view.clientKey
    };
    let serial = view.prepared?.serial || '';
    try {
      let tx;
      if (serial) {
        tx = transactionFromSerial(this.app, serial);
      } else {
        this.setWorking('Preparing the secure document transaction...');
        await this.pause();
        tx = await createShareTransaction(this.app, request);
        this.setWorking('Signing your document transaction...');
        await this.pause();
        await signShareTransaction(tx);
        serial = shareTransactionSerial(this.app, tx);
        view.prepared.serial = serial;
      }
      this.setWorking('Sending your document to the sharing server...');
      await this.pause();
      const created = await submitShareTransaction(this.app, tx);
      view.pendingResult = created;
    } catch (err) {
      this.failStage('Sending your document to the sharing server', err?.message || 'The document transaction could not be sent.');
      return;
    }
    const created = view.pendingResult;
    view.pendingResult = null;
    if (!created?.success || !created.document_id || !created.token) {
      this.failStage(
        'Sending your document to the sharing server',
        created?.error || 'The sharing server did not confirm that the document was stored. Nothing was confirmed as shared.'
      );
      return;
    }
    this.mod.share = {
      id: created.document_id,
      token: created.token,
      purpose: view.purpose,
      encrypted: payload.is_encrypted,
      password: usePassword,
      serverHash: created.document_hash,
      pending: false,
      conflict: false
    };
    view.stored = true;
    view.link = created.link || '';
    this.setWorking('Sending invitation emails...');
    await this.pause();
    const invited = await sendShare(this.app, {
      action: 'invite',
      document_id: created.document_id,
      token: created.token
    }, 60000);
    this.finishInvite(invited, created.link || '');
  }

  async retryEmails() {
    const view = this.view();
    const share = this.mod.share;
    if (view.busy || !share?.id || !share?.token) {
      return;
    }
    view.busy = true;
    view.copied = false;
    view.error = '';
    view.startedAt = Date.now();
    this.setWorking('Sending invitation emails...');
    await this.pause();
    const invited = await sendShare(this.app, {
      action: 'invite',
      document_id: share.id,
      token: share.token
    }, 60000);
    this.finishInvite(invited, view.link);
  }

  finishInvite(invited, fallbackLink) {
    const view = this.view();
    view.busy = false;
    view.link = invited?.link || fallbackLink || view.link || '';
    view.copied = false;
    this.stopClock();
    if (invited?.success) {
      view.outcome = 'success';
      view.heading = 'Success';
      view.detail = 'Your document has been stored and invitation emails have been sent.';
      view.error = '';
    } else {
      view.outcome = 'stored';
      view.heading = 'Document stored';
      view.detail = 'Your document is safely stored on the sharing server, but SaitoSign could not send the invitation emails.';
      view.error = invited?.error || 'The mail relay did not report why the invitation failed.';
    }
    this.publish.state.step = 'share-recipients';
    this.show('share-sent', 'forward');
  }

  async unlock() {
    const view = this.view();
    const gate = this.mod.shareGate;
    if (!gate?.payload) {
      view.error = 'The encrypted document is no longer available in this window. Open the invitation link again.';
      this.show('share-unlock', 'replace');
      return;
    }
    view.busy = true;
    view.error = '';
    this.show('share-unlock', 'replace');
    try {
      const record = await documentFromStored(this.app, gate.payload, view.password || '');
      const next = await hydrate(record);
      this.mod.share = {
        id: gate.id,
        token: gate.token,
        purpose: gate.purpose,
        encrypted: true,
        password: view.password || '',
        serverHash: gate.serverHash,
        pending: false,
        conflict: false
      };
      this.mod.shareGate = null;
      view.busy = false;
      this.publish.close();
      this.mod.useDocument(next, { notice: 'Document imported successfully.' });
    } catch (err) {
      view.busy = false;
      view.error = err?.code === 'password'
        ? 'The password could not unlock this document. Check it with the sender and try again.'
        : (err?.message || 'The document could not be opened.');
      this.show('share-unlock', 'replace');
    }
  }

  async retry() {
    const share = this.mod.share;
    const view = this.view();
    if (!share) {
      return;
    }
    if (share.encrypted && !share.password) {
      share.password = view.password || '';
      if (!share.password) {
        view.error = 'Enter the document password so this device can encrypt the updated copy before uploading it.';
        this.show('share-retry', 'replace');
        return;
      }
    }
    view.busy = true;
    view.error = '';
    this.show('share-retry', 'replace');
    const result = await this.mod.syncIfShared();
    view.busy = false;
    if (result?.ok) {
      this.publish.close();
      return;
    }
    view.error = result?.error || 'The upload was not confirmed. Your signature is still saved on this device.';
    this.openRetry();
  }

  async reloadLatest() {
    const share = this.mod.share;
    const view = this.view();
    if (!share) {
      return;
    }
    const result = await sendShare(this.app, {
      action: 'fetch',
      document_id: share.id,
      token: share.token
    });
    if (!result?.success) {
      view.error = result?.error || 'The latest document could not be downloaded.';
      this.show('share-retry', 'replace');
      return;
    }
    try {
      let record = result.document;
      if (result.is_encrypted) {
        const password = share.password || view.password || '';
        if (!password) {
          view.needsPassword = true;
          view.error = 'Enter the document password to open the newer encrypted copy.';
          this.show('share-retry', 'replace');
          return;
        }
        record = await documentFromStored(this.app, result.document, password);
        share.password = password;
      } else {
        record = await documentFromStored(this.app, result.document, '');
      }
      share.serverHash = result.document_hash;
      share.pending = false;
      share.conflict = false;
      this.publish.close();
      this.mod.useDocument(await hydrate(record), {
        notice: 'The latest shared document has replaced the copy on this device. Add your signature again if it is not already there, then retry the upload.'
      });
    } catch (err) {
      view.error = err?.code === 'password'
        ? 'The password could not unlock the newer document.'
        : 'The newer document could not be opened.';
      this.show('share-retry', 'replace');
    }
  }
}

module.exports = ShareFlow;
