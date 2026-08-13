const ModTemplate = require('./../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const RustscriptMain = require('./lib/ui/main');
const ast_execute = require('./lib/rustscript/ast_execute');
const tokenize = require('./lib/rustscript/semantic_to_tokens');
const parse = require('./lib/rustscript/tokens_to_ast');
const { build_test_script_from_create, lockingView, expandLockingTree } = require('./lib/ui/script_build');
const {
  downloadTransactionFile,
  serializeTransactionToWeb,
  transactionExportFilename
} = require('./lib/transaction_io');
const {
  fetchTransactionFromP2shLink,
  parseP2shShareLink,
  readTransactionLocation
} = require('./lib/tx_location');
const Transaction = require('./../../lib/saito/transaction').default;
const Slip = require('./../../lib/saito/slip').default;
const { TransactionType } = require('saito-js/lib/transaction');
const { SlipType } = require('saito-js/lib/slip');

/** Saito SlipType::P2SH — not yet exported from saito-js SlipType enum. */
const SLIP_TYPE_P2SH = 10;

function slipToStoredJson(slip) {
  if (!slip) {
    return null;
  }
  let json;
  if (typeof slip.toJson === 'function') {
    json = slip.toJson();
  } else {
    json = {
      publicKey: slip.publicKey,
      amount: slip.amount,
      type: slip.type,
      blockId: slip.blockId,
      txOrdinal: slip.txOrdinal,
      index: slip.index
    };
  }
  return json;
}

function isBoundSlipType(type) {
  return type === SlipType.Bound || type === 9;
}

function isNormalOrAtrSlipType(type) {
  return type === SlipType.Normal || type === SlipType.ATR || type === 0 || type === 1;
}

const OpcodeChecksig = require('./lib/opcodes/checksig');
const OpcodeCheckmultisig = require('./lib/opcodes/checkmultisig');
const OpcodeCheckhash = require('./lib/opcodes/checkhash');
const OpcodeCheckfield = require('./lib/opcodes/checkfield');
const OpcodeCheckkey = require('./lib/opcodes/checkkey');
const OpcodeChecksender = require('./lib/opcodes/checksender');
const OpcodeCheckrecipient = require('./lib/opcodes/checkrecipient');
const OpcodeCheckpath = require('./lib/opcodes/checkpath');
const OpcodeCheckpathhop = require('./lib/opcodes/checkpathhop');
const OpcodeImportfield = require('./lib/opcodes/importfield');
const OpcodeImportarray = require('./lib/opcodes/importarray');
const OpcodeSetfield = require('./lib/opcodes/setfield');
const OpcodeSetarray = require('./lib/opcodes/setarray');
const OpcodeSetarrayfield = require('./lib/opcodes/setarrayfield');
const OpcodeArrayify = require('./lib/opcodes/arrayify');
const OpcodeSumfields = require('./lib/opcodes/sumfields');
const OpcodeScripthash = require('./lib/opcodes/scripthash');
const OpcodeCheckown = require('./lib/opcodes/checkown');
const OpcodeCheckownnft = require('./lib/opcodes/checkownnft');
const OpcodeCheckownnftwhere = require('./lib/opcodes/checkownnftwhere');
const OpcodeChecktime = require('./lib/opcodes/checktime');

class Rustscript extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'Rustscript';
    this.name = 'Rustscript';
    this.slug = 'rustscript';
    this.description = 'Symbolic P2SH contract scripting';
    this.categories = 'Utility Programming Cryptography';

    this.styles = ['/rustscript/style.css', '/saito/css-imports/ui/saito-nft.css'];

    this.icon = 'fas fa-code';

    this.script = {};
    this.opcodes = {};
    this.main = null;
    this.header = null;

    /** @type {'create'|'unlock'} */
    this.workflow = 'create';
    this.unlockContext = null;

    /**
     * Unlock transaction ownership model.
     * - spend: immutable locked-funds snapshot (locking tx, or continuation UTXO view)
     * - base: UI-owned editable unlock tx (imported inputs + user outputs only)
     * - candidate: disposable evaluation clone (tracks base, then funded final after signing prep)
     * - final: silently funded clone (fee inputs + change); created before first CHECKSIG
     */
    this.unlock_transaction_spend = null;
    this.unlock_transaction_base = null;
    this.unlock_transaction_candidate = null;
    /**
     * Funded unlock tx (base + wallet fee inputs/change). Built silently before
     * the first CHECKSIG/CHECKMULTISIG; used for signing and broadcast.
     */
    this.unlock_transaction_final = null;
    /** @type {{ feeSaito: string, feeNolan: string } | null} */
    this.unlock_fee = null;
    /**
     * Explicit RustScript unlock editability. Becomes false after the first
     * successful CHECKSIG / CHECKMULTISIG witness is applied.
     */
    this.unlock_transaction_editable = true;
  }

  async initialize(app) {
    await super.initialize?.(app);

    if (this.app.BROWSER) {
      const SaitoTransactionMonitor = require('../../lib/saito/ui/saito-transaction-monitor/saito-transaction-monitor');
      this.transaction_monitor = new SaitoTransactionMonitor(this.app, this);
    }

    [
      OpcodeChecksig,
      OpcodeCheckmultisig,
      OpcodeCheckhash,
      OpcodeCheckfield,
      OpcodeCheckkey,
      OpcodeChecksender,
      OpcodeCheckrecipient,
      OpcodeCheckpath,
      OpcodeCheckpathhop,
      OpcodeImportfield,
      OpcodeImportarray,
      OpcodeSetfield,
      OpcodeSetarray,
      OpcodeSetarrayfield,
      OpcodeArrayify,
      OpcodeSumfields,
      OpcodeScripthash,
      OpcodeCheckown,
      OpcodeCheckownnft,
      OpcodeCheckownnftwhere,
      OpcodeChecktime
    ].forEach((op) => {
      if (op && op.name && typeof op.execute === 'function') {
        const key = op.name.toLowerCase();
        this.opcodes[key] = (node, context) => op.execute(node, context) === true;
        this.opcodes[key].opcode = op;
      }
    });
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
    }
    if (!this.main) {
      this.main = new RustscriptMain(this.app, this);
      this.addComponent(this.main);
    }

    await this.header.render();
    await this.main.render();
    await this.consumeExplorerImport();
  }

  async consumeExplorerImport() {
    if (!this.app.BROWSER) {
      return;
    }

    let raw = null;
    try {
      raw = sessionStorage.getItem('rustscript_explorer_import');
      if (!raw) {
        return;
      }
      sessionStorage.removeItem('rustscript_explorer_import');
    } catch (err) {
      return;
    }

    try {
      const payload = JSON.parse(raw);
      if (!payload?.tx) {
        return;
      }

      const tx = new Transaction();
      tx.deserialize_from_web(this.app, JSON.stringify(payload.tx));

      if (payload.target?.kind === 'input' && payload.target.fromIndex != null) {
        await this.loadP2shInputForWitness(tx, payload.target.fromIndex);
      } else {
        await this.loadTransactionForWitness(tx);
      }

      if (this.main?.welcomeOverlay) {
        this.main.welcomeOverlay.dismiss('explorer');
      }
    } catch (err) {
      console.warn('Rustscript: explorer import failed', err);
    }
  }

  _isP2shMarkerSlip(slip) {
    if (!slip) {
      return false;
    }
    const type = Number(slip.type ?? slip.slip_type);
    if (type === SLIP_TYPE_P2SH) {
      return true;
    }
    const pk = String(slip.publicKey || slip.public_key || '');
    return pk.length >= 66 && pk.startsWith('00');
  }

  _findFundSlipBeforeP2shMarker(tx, markerIndex) {
    const from = tx.from || [];
    for (let i = markerIndex - 1; i >= 0; i--) {
      const slip = from[i];
      const type = Number(slip?.type ?? slip?.slip_type);
      if (type === SlipType.Bound || type === 9) {
        continue;
      }
      return slip;
    }
    return null;
  }

  /**
   * Load a spend transaction's P2SH input witness for inspection / unlock testing.
   */
  async loadP2shInputForWitness(tx, fromIndex) {
    if (!tx) {
      throw new Error('Transaction is required');
    }

    const from = tx.from || [];
    const marker = from[fromIndex];
    if (!marker || !this._isP2shMarkerSlip(marker)) {
      throw new Error('Selected slip is not a P2SH input marker');
    }

    let p2shArrayIndex = 0;
    for (let i = 0; i < fromIndex; i++) {
      if (this._isP2shMarkerSlip(from[i])) {
        p2shArrayIndex += 1;
      }
    }

    const fundSlip = this._findFundSlipBeforeP2shMarker(tx, fromIndex);
    if (!fundSlip) {
      throw new Error('Could not locate fund slip for P2SH input');
    }

    const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : tx.msg || {};
    const accessScripts = Array.isArray(txmsg.access_scripts) ? txmsg.access_scripts : [];
    const accessScriptRaw = accessScripts[p2shArrayIndex];
    if (!accessScriptRaw) {
      throw new Error('access_scripts entry not found for P2SH input');
    }

    const fullScript =
      typeof accessScriptRaw === 'string' ? JSON.parse(accessScriptRaw) : accessScriptRaw;
    const locking = lockingView(fullScript);
    const hash = this.app.core.scripting.hash(locking);
    const p2shPublicKey = marker.publicKey || marker.public_key || '';
    const p2shAddress =
      p2shPublicKey.length === 66 && p2shPublicKey.startsWith('00')
        ? this.app.crypto.toBase58(p2shPublicKey)
        : p2shPublicKey;

    this.unlockContext = {
      sourceTxSignature: tx.signature || '',
      p2shAddress,
      p2shHash: txmsg.scripthash || hash || '',
      lockedSlip: slipToStoredJson(fundSlip),
      assetType: 'saito',
      lockedNftSlips: null,
      importCategory: 'guided',
      sourceTxmsg: txmsg,
      p2shInputFromIndex: fromIndex
    };

    this.workflow = 'unlock';
    this.initializeUnlockTransactions(tx);

    if (this.main) {
      this.main.testingUnlocked = true;
      this.main.executionStatus = { attempted: false, success: false };
      this.main.validationDisplay = null;
      this.main.workspaceMode = 'locked';
      this.setScript(fullScript);
      this.main.syncEditorModes();
      this.main.applyWorkspaceUI();
      await this.main.refresh();
    }

    return this.unlockContext;
  }

  respondTo(type = '') {
    if (type === 'saito-header') {
      if (!this.browser_active) {
        return [
          {
            text: 'Rustscript',
            icon: this.icon,
            rank: 110,
            type: 'navigation',
            callback: function () {
              navigateWindow('/rustscript');
            }
          }
        ];
      }
    }
    return null;
  }

  setScript(script) {
    if (!script || typeof script !== 'object' || Array.isArray(script)) {
      return;
    }
    this.script = JSON.parse(JSON.stringify(script));
  }

  getScript() {
    return JSON.parse(JSON.stringify(this.script));
  }

  setField(path, value) {
    if (typeof path !== 'string' || path.length === 0) {
      return;
    }
    if (this.workflow === 'unlock') {
      const { assertUnlockMutablePath } = require('./lib/ui/unlock_tx_fee');
      assertUnlockMutablePath(this, path);
    }
    const parts = path.split('.');
    let cursor = this.script;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      const nextKey = parts[i + 1];
      const nextIsIndex = /^\d+$/.test(nextKey);
      if (Array.isArray(cursor)) {
        const idx = parseInt(key, 10);
        cursor = cursor[idx];
        continue;
      }
      if (!cursor[key] || typeof cursor[key] !== 'object') {
        cursor[key] = nextIsIndex ? [] : {};
      }
      cursor = cursor[key];
    }
    const last = parts[parts.length - 1];
    if (Array.isArray(cursor)) {
      cursor[parseInt(last, 10)] = value;
    } else {
      cursor[last] = value;
    }
  }

  getField(path) {
    if (typeof path !== 'string' || path.length === 0) {
      return undefined;
    }
    const parts = path.split('.');
    let cursor = this.script;
    for (const part of parts) {
      if (cursor == null) {
        return undefined;
      }
      if (Array.isArray(cursor)) {
        const idx = parseInt(part, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) {
          return undefined;
        }
        cursor = cursor[idx];
      } else if (typeof cursor === 'object') {
        cursor = cursor[part];
      } else {
        return undefined;
      }
    }
    return cursor;
  }

  execute(context) {
    if (!context || typeof context !== 'object') {
      return false;
    }

    const clone = JSON.parse(JSON.stringify(this.script));
    const pending = [clone];

    while (pending.length > 0) {
      const node = pending.pop();
      if (!node || typeof node !== 'object') {
        continue;
      }

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
          pending.push(node[i]);
        }
        continue;
      }

      if (node.required && typeof node.required === 'object' && !Array.isArray(node.required)) {
        if (!node.witness || typeof node.witness !== 'object' || Array.isArray(node.witness)) {
          node.witness = {};
        }
        const keys = Object.keys(node.required);
        for (let k = 0; k < keys.length; k += 1) {
          const key = keys[k];
          if (node.witness[key] === undefined) {
            node.witness[key] = node.required[key];
          }
        }
      }

      if (Array.isArray(node.args)) {
        for (let i = 0; i < node.args.length; i += 1) {
          pending.push(node.args[i]);
        }
      }
    }

    if (
      !clone ||
      typeof clone !== 'object' ||
      typeof clone.op !== 'string' ||
      clone.op.length === 0
    ) {
      return false;
    }

    const execContext = context.opcodes
      ? context
      : Object.assign({}, context, { opcodes: this.opcodes });
    const result = ast_execute(clone, execContext);
    return result === true;
  }

  scripthash() {
    return this.app.core.scripting.hash(lockingView(this.script));
  }

  parseExpertScript(source) {
    const text = String(source ?? '').trim();
    if (!text) {
      throw new Error('Script is empty');
    }

    const tokens = tokenize(text);
    const ast = parse(tokens);
    const lockingScript = expandLockingTree(lockingView(ast || {}), this.opcodes);
    const unlockingScript = build_test_script_from_create(lockingScript, {}, this.opcodes);

    return {
      tokens,
      ast,
      lockingScript,
      unlockingScript,
      json: JSON.stringify(lockingScript, null, 2)
    };
  }

  shouldAffixCallbackToModule(modname, tx = null) {
    if (modname === this.name) {
      return 1;
    }
    // Allow the shared transaction monitor to receive confirmations it is watching.
    if (
      this.transaction_monitor?.tx &&
      tx?.signature &&
      tx.signature === this.transaction_monitor.tx.signature
    ) {
      return 1;
    }
    return 0;
  }

  resetUnlockWorkflow() {
    this.workflow = 'create';
    this.unlockContext = null;
    this.clearUnlockTransactions();
  }

  /**
   * Deep-clone a Transaction via canonical web serialization.
   * Used for the immutable spend snapshot (complete imported tx).
   */
  cloneTransaction(tx) {
    if (!tx) {
      throw new Error('Transaction is required');
    }
    const json = this.serializeTransaction(tx);
    const clone = new Transaction();
    clone.deserialize_from_web(this.app, json);
    return clone;
  }

  /**
   * Clone from/to slips + msg without requiring a fully signed / complete tx.
   * Used for base ↔ candidate where outputs may be absent.
   */
  cloneTransactionSkeleton(tx) {
    if (!tx) {
      throw new Error('Transaction is required');
    }

    const clone = new Transaction();
    clone.timestamp = tx.timestamp || Date.now();
    if (tx.type != null) {
      clone.type = tx.type;
    }

    const from = tx.from || [];
    for (let i = 0; i < from.length; i++) {
      const stored = slipToStoredJson(from[i]);
      clone.addFromSlip(new Slip(undefined, stored));
    }

    const to = tx.to || [];
    for (let i = 0; i < to.length; i++) {
      const stored = slipToStoredJson(to[i]);
      clone.addToSlip(new Slip(undefined, stored));
    }

    const msg =
      tx.msg && typeof tx.msg === 'object' && Object.keys(tx.msg).length
        ? tx.msg
        : typeof tx.returnMessage === 'function'
          ? tx.returnMessage()
          : null;
    if (msg && typeof msg === 'object') {
      clone.msg = JSON.parse(JSON.stringify(msg));
    }

    return clone;
  }

  clearUnlockTransactions() {
    this.unlock_transaction_spend = null;
    this.unlock_transaction_base = null;
    this.unlock_transaction_candidate = null;
    this.unlock_transaction_final = null;
    this.unlock_fee = null;
    this.unlock_transaction_editable = true;
  }

  /**
   * Build the UI-owned unlock base transaction: spendable inputs only.
   * No outputs, fee inputs, or signatures.
   */
  createUnlockBaseTransaction() {
    const ctx = this.unlockContext;
    if (!ctx?.lockedSlip && !(Array.isArray(ctx?.lockedNftSlips) && ctx.lockedNftSlips.length)) {
      throw new Error('Unlock context is required to create the base transaction');
    }

    const base = new Transaction();
    base.timestamp = Date.now();

    if (
      ctx.assetType === 'nft' &&
      Array.isArray(ctx.lockedNftSlips) &&
      ctx.lockedNftSlips.length === 3
    ) {
      for (let i = 0; i < ctx.lockedNftSlips.length; i++) {
        base.addFromSlip(new Slip(undefined, ctx.lockedNftSlips[i]));
      }
    } else {
      base.addFromSlip(new Slip(undefined, ctx.lockedSlip));
    }

    return base;
  }

  /**
   * Disposable evaluation clone.
   * Prefer unlock_transaction_final once fee funding has been composed;
   * otherwise clone unlock_transaction_base.
   * Never edit this object; always regenerate via this helper.
   */
  cloneUnlockCandidate() {
    if (this.unlock_transaction_final) {
      this.unlock_transaction_candidate = this.cloneTransactionSkeleton(
        this.unlock_transaction_final
      );
      return this.unlock_transaction_candidate;
    }
    if (!this.unlock_transaction_base) {
      this.unlock_transaction_candidate = null;
      return null;
    }
    this.unlock_transaction_candidate = this.cloneTransactionSkeleton(
      this.unlock_transaction_base
    );
    return this.unlock_transaction_candidate;
  }

  /**
   * Establish unlock transaction ownership after unlockContext is populated.
   * @param {object} spendTx - imported transaction (cloned into unlock_transaction_spend)
   */
  initializeUnlockTransactions(spendTx) {
    if (!spendTx) {
      throw new Error('Imported transaction is required');
    }
    if (!this.unlockContext) {
      throw new Error('unlockContext must be set before initializeUnlockTransactions');
    }

    this.unlock_transaction_spend = this.cloneTransaction(spendTx);
    this.unlock_transaction_base = this.createUnlockBaseTransaction();
    this.unlock_transaction_final = null;
    this.unlock_fee = null;
    this.unlock_transaction_editable = true;
    const { ensureDefaultUnlockFee } = require('./lib/ui/unlock_tx_fee');
    ensureDefaultUnlockFee(this);
    this.cloneUnlockCandidate();
  }

  /**
   * Immutable spend snapshot for Continue Unlock: funds being spent recorded as outputs.
   * The original locking/publish file is not required when continuing from an unlock draft.
   */
  createUnlockSpendSnapshotFromContinuation(unlockTx) {
    const spend = new Transaction();
    spend.timestamp = unlockTx?.timestamp || Date.now();
    const from = unlockTx?.from || [];
    if (!from.length) {
      throw new Error('Unlock transaction has no inputs to spend.');
    }
    for (let i = 0; i < from.length; i++) {
      spend.addToSlip(new Slip(undefined, slipToStoredJson(from[i])));
    }
    return spend;
  }

  /**
   * Continue Unlock init — base is the imported unlock tx (outputs + witnesses preserved).
   */
  initializeUnlockTransactionsFromContinuation(unlockTx) {
    if (!unlockTx) {
      throw new Error('Unlock transaction is required');
    }
    if (!this.unlockContext) {
      throw new Error('unlockContext must be set before initializeUnlockTransactionsFromContinuation');
    }

    this.unlock_transaction_spend = this.createUnlockSpendSnapshotFromContinuation(unlockTx);
    this.unlock_transaction_base = this.cloneTransactionSkeleton(unlockTx);
    this.unlock_transaction_final = null;
    this.unlock_fee = null;
    this.unlock_transaction_editable = true;
    const { ensureDefaultUnlockFee } = require('./lib/ui/unlock_tx_fee');
    ensureDefaultUnlockFee(this);
    this.cloneUnlockCandidate();
  }

  /**
   * Load an in-progress unlock/spend transaction and open the Unlock workspace.
   * Preserves outputs and witnesses — does not scaffold an empty base tx.
   */
  async loadUnlockContinuation(tx) {
    if (!tx) {
      throw new Error('Transaction is required');
    }

    const from = tx.from || [];
    const to = tx.to || [];
    if (!from.length) {
      throw new Error('This file has no inputs. Import a locking transaction via Unlock Transaction instead.');
    }
    if (!to.length) {
      throw new Error(
        'This unlock transaction has no outputs yet. Use Unlock Transaction to start a new unlock.'
      );
    }

    const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : tx.msg || {};
    const request = String(txmsg.request || '').toLowerCase();
    if (request === 'publish p2sh') {
      throw new Error(
        'This looks like a locking/publish transaction. Use Unlock Transaction to start unlocking it.'
      );
    }

    const hasAccessScripts =
      Array.isArray(txmsg.access_scripts) && txmsg.access_scripts.length > 0;
    const accessScriptRaw = hasAccessScripts
      ? txmsg.access_scripts[0]
      : request === 'spend p2sh'
        ? txmsg.access_script || txmsg.accessScript || ''
        : '';

    if (!accessScriptRaw) {
      throw new Error(
        'This file is not an unlock transaction with an access script. Use Unlock Transaction for locking publishes, or Import Saved Script for script drafts.'
      );
    }

    let fullScript;
    try {
      fullScript =
        typeof accessScriptRaw === 'string' ? JSON.parse(accessScriptRaw) : accessScriptRaw;
    } catch (_err) {
      throw new Error('access_script is not valid JSON');
    }
    if (!fullScript || typeof fullScript !== 'object' || Array.isArray(fullScript)) {
      throw new Error('access_script is not a valid script object.');
    }

    const locking = lockingView(fullScript);
    const hash = this.app.core.scripting.hash(locking);
    const p2shHash = txmsg.scripthash || hash || '';
    const p2shAddress = txmsg.p2sh_address || txmsg.p2shAddress || '';

    const assetType =
      txmsg.asset_type === 'nft' || txmsg.nft_id || isBoundSlipType(from[0]?.type)
        ? 'nft'
        : txmsg.asset_type || 'saito';

    let lockedNftSlips = null;
    let lockedSlip = null;
    if (assetType === 'nft' && from.length >= 3) {
      lockedNftSlips = [from[0], from[1], from[2]].map(slipToStoredJson);
      lockedSlip = lockedNftSlips[1];
    } else {
      lockedSlip = slipToStoredJson(from[0]);
    }

    this.unlockContext = {
      sourceTxSignature: txmsg.source_tx || tx.signature || '',
      p2shAddress,
      p2shHash,
      lockedSlip,
      assetType,
      lockedNftSlips,
      nftId: txmsg.nft_id || '',
      nftAmount: txmsg.nft_amount || '',
      nftTxmsg: txmsg.nft_txmsg && typeof txmsg.nft_txmsg === 'object' ? txmsg.nft_txmsg : null,
      importCategory: 'guided',
      sourceTxmsg: txmsg,
      continuation: true
    };

    this.workflow = 'unlock';
    this.initializeUnlockTransactionsFromContinuation(tx);

    if (this.main) {
      await this.main.enterUnlockContinuation(fullScript);
    }

    return this.unlockContext;
  }

  /** Canonical web-serialized transaction JSON (shared with import / future explorer export). */
  serializeTransaction(tx) {
    return serializeTransactionToWeb(this.app, tx);
  }

  /**
   * Temporary debug dump immediately before network propagate.
   * Search console / server logs for: [P2SH_DEBUGGING_TRACE]
   */
  logP2shDebuggingTraceBeforePropagate(context, tx) {
    const tag = '[P2SH_DEBUGGING_TRACE]';
    try {
      const msg =
        tx?.msg && typeof tx.msg === 'object' && Object.keys(tx.msg).length
          ? tx.msg
          : typeof tx?.returnMessage === 'function'
            ? tx.returnMessage()
            : null;
      const from = Array.isArray(tx?.from) ? tx.from : [];
      const to = Array.isArray(tx?.to) ? tx.to : [];
      const slipDump = (slip, i) => {
        const j = slipToStoredJson(slip) || {};
        return {
          i,
          publicKey: j.publicKey || j.public_key || null,
          amount: j.amount != null ? String(j.amount) : null,
          type: j.type ?? j.slip_type ?? null,
          blockId: j.blockId != null ? String(j.blockId) : j.block_id != null ? String(j.block_id) : null,
          txOrdinal:
            j.txOrdinal != null
              ? String(j.txOrdinal)
              : j.tx_ordinal != null
                ? String(j.tx_ordinal)
                : null,
          index: j.index ?? j.slip_index ?? null
        };
      };
      const dump = {
        context,
        signature: tx?.signature || null,
        type: tx?.type,
        timestamp: tx?.timestamp,
        fromCount: from.length,
        toCount: to.length,
        from: from.map(slipDump),
        to: to.map(slipDump),
        msg
      };
      console.warn(`${tag} client pre-propagate JSON dump`, dump);
      try {
        const serialized = this.serializeTransaction(tx);
        console.warn(`${tag} client pre-propagate serialized tx JSON`, serialized);
      } catch (serErr) {
        console.warn(`${tag} client pre-propagate serialize failed`, serErr?.message || serErr);
      }
    } catch (err) {
      console.error(`${tag} client pre-propagate dump failed`, err);
    }
  }

  /**
   * Download a transaction as canonical JSON via the browser.
   * Pass block_id / transaction_id with update_outputs so outputs carry
   * confirmed chain location in the serialized file.
   */
  exportTransaction(tx, { prefix, block_id = null, transaction_id = null } = {}) {
    if (!tx) {
      throw new Error('Transaction is required');
    }
    const filename = prefix ? transactionExportFilename(tx, prefix) : undefined;
    if (block_id != null && String(block_id) !== '' && transaction_id != null && String(transaction_id) !== '') {
      return downloadTransactionFile(this.app, tx, {
        filename,
        block_id,
        transaction_id,
        update_outputs: true
      });
    }
    return downloadTransactionFile(this.app, tx, { filename });
  }

  /**
   * Build a shareable draft transaction wrapping the script at its current state.
   * Uses the same web-serialization path as publish export (no broadcast).
   */
  buildScriptShareTransaction(scriptPayload) {
    if (!scriptPayload || typeof scriptPayload !== 'object') {
      throw new Error('Nothing to export yet.');
    }

    const locking = lockingView(scriptPayload);
    const hash = this.app.core.scripting.hash(locking);
    const address = this.app.core.scripting.address(locking);
    if (!hash || !address) {
      throw new Error('Could not derive script address for export.');
    }

    const tx = new Transaction();
    tx.timestamp = Date.now();

    const output = new Slip();
    output.type = SLIP_TYPE_P2SH;
    output.publicKey = this.app.crypto.toBase58(address);
    output.amount = BigInt(0);
    tx.addToSlip(output);

    tx.msg = {
      module: this.name,
      request: 'publish p2sh',
      access_script: JSON.stringify(scriptPayload),
      scripthash: hash,
      p2sh_address: address,
      amount: '0',
      fee: '0',
      draft: true
    };

    return tx;
  }

  /** Export current script state via canonical transaction JSON download. */
  exportScriptDraft(scriptPayload) {
    const tx = this.buildScriptShareTransaction(scriptPayload);
    return this.exportTransaction(tx, { prefix: 'rustscript-draft' });
  }

  /**
   * Shareable Pay-to-Script-Hash link — same InvitationLink builder used across Saito apps.
   * Includes confirmed location fields so import can fetch and stamp the spendable UTXO.
   */
  buildP2shShareLink({
    p2shHash = '',
    p2shAddress = '',
    blockId = null,
    transactionId = '',
    tx = null
  } = {}) {
    const InvitationLink = require('../../lib/saito/ui/modals/saito-link/saito-link');
    const location = readTransactionLocation(tx);
    const resolvedBlockId =
      blockId != null && String(blockId) !== ''
        ? String(blockId)
        : location.blockId != null
          ? location.blockId.toString()
          : '';
    const resolvedTxId = transactionId || location.transactionId || tx?.signature || '';

    const data = {
      path: `/${this.returnSlug()}/`,
      name: this.appname,
      scripthash: p2shHash || '',
      p2sh_address: p2shAddress || ''
    };
    if (resolvedBlockId) {
      data.block_id = resolvedBlockId;
    }
    if (resolvedTxId) {
      data.transaction_id = String(resolvedTxId);
    }

    const linkObj = new InvitationLink(this.app, this, data);
    linkObj.buildLink();
    return linkObj.invite_link || '';
  }

  /**
   * Import a P2SH share link: fetch the confirmed publish tx and load unlock context.
   */
  async importP2shShareLink(rawLink) {
    const fields = parseP2shShareLink(rawLink);
    const tx = await fetchTransactionFromP2shLink(this.app, fields);
    return this.loadTransactionForWitness(tx);
  }

  /**
   * Unified publish entry — SAITO or NFT to the derived P2SH address.
   * NFT path uses app.wallet.createNFTTransaction (wallet handles shard selection).
   */
  async publishScript({
    assetType = 'saito',
    locking,
    p2shAddress,
    p2shHash,
    amountSaito,
    feeSaito,
    nft = null,
    nftAmount = 1
  }) {
    const lockingScript = lockingView(locking || {});
    const accessScript = JSON.stringify(lockingScript);
    const recipient =
      p2shAddress.length === 66 && p2shAddress.startsWith('00')
        ? this.app.crypto.toBase58(p2shAddress)
        : p2shAddress;
    const baseMsg = {
      module: this.name,
      request: 'publish p2sh',
      access_script: accessScript,
      scripthash: p2shHash,
      p2sh_address: p2shAddress,
      asset_type: assetType,
      fee: String(feeSaito)
    };

    if (assetType === 'saito') {
      const amountNolan = this.app.wallet.convertSaitoToNolan(amountSaito);
      const feeNolan = this.app.wallet.convertSaitoToNolan(feeSaito);
      const newtx = await this.app.wallet.createUnsignedTransaction(
        recipient,
        amountNolan,
        feeNolan
      );
      newtx.msg = {
        ...baseMsg,
        amount: String(amountSaito)
      };
      await newtx.sign();
      return newtx;
    }

    if (assetType === 'nft') {
      if (!nft) {
        throw new Error('No NFT selected.');
      }
      await nft.fetchTransaction();
      const amountInt = parseInt(String(nftAmount), 10);
      if (!Number.isInteger(amountInt) || amountInt <= 0) {
        throw new Error('Enter a valid NFT amount.');
      }
      const totalAvailable = nft.getTotalAmount ? nft.getTotalAmount() : 0;
      if (amountInt > totalAvailable) {
        throw new Error(`Insufficient NFT units (${totalAvailable} available).`);
      }

      const feeNolan = this.app.wallet.convertSaitoToNolan(feeSaito);
      const nftTxmsg = JSON.parse(JSON.stringify(nft.txmsg || {}));
      const txMsg = {
        ...baseMsg,
        nft_id: nft.id,
        nft_amount: String(amountInt),
        nft_txmsg: nftTxmsg,
        amount: '0'
      };

      let newtx = await this.app.wallet.createNFTTransaction(
        nft,
        recipient,
        amountInt,
        feeNolan,
        BigInt(0),
        txMsg
      );

      newtx = await nft.modifyBeforeSend(newtx, recipient);
      if (!newtx) {
        throw new Error('NFT transfer blocked by module.');
      }
      await newtx.sign();
      return newtx;
    }

    throw new Error(`Unknown asset type: ${assetType}`);
  }

  /**
   * CREATE broadcast — construct, sign, start the Transaction Monitor, then propagate.
   */
  async broadcastPublish(options = {}) {
    const tx = await this.publishScript(options);
    if (!tx?.signature) {
      throw new Error('Transaction was not signed.');
    }
    if (!this.transaction_monitor) {
      console.error('RustScript: transaction_monitor is not initialized');
    } else {
      this.transaction_monitor.render({
        tx,
        title: 'Broadcasting...',
        lead: 'Your script is being broadcast to the Saito network.',
        subtitle: 'Waiting for confirmation...',
        successTitle: 'Transaction Confirmed',
        successLead: 'Your transaction has been confirmed on the Saito network.',
        successActionLabel: 'Continue',
        callback: typeof options.callback === 'function' ? options.callback : null
      });
    }
    this.logP2shDebuggingTraceBeforePropagate('broadcastPublish', tx);
    await this.app.network.propagateTransaction(tx);
    return tx;
  }

  /**
   * Load a P2SH publish (or compatible) transaction into the unlock / witness workflow.
   *
   * Category A — txmsg.access_scripts[] present:
   *   Guided mode: locking script restored; user completes witness only.
   * Category B — no txmsg.access_scripts[]:
   *   Expert mode: user must supply locking script and witness.
   */
  async loadTransactionForWitness(tx, options = {}) {
    if (!tx) {
      throw new Error('Transaction is required');
    }

    if (options?.target?.kind === 'input' && options.target.fromIndex != null) {
      return this.loadP2shInputForWitness(tx, options.target.fromIndex);
    }

    const txmsg = typeof tx.returnMessage === 'function' ? tx.returnMessage() : tx.msg || {};
    const p2shAddress =
      txmsg.p2sh_address || txmsg.p2shAddress || this._findP2shOutputAddress(tx) || '';

    const lockedSlip = this._findLockedOutputSlip(tx, p2shAddress);
    if (!lockedSlip) {
      throw new Error('Could not locate script-locked funds in this transaction.');
    }

    const assetType =
      txmsg.asset_type === 'nft' || txmsg.nft_id ? 'nft' : txmsg.asset_type || 'saito';
    const lockedNftSlips =
      assetType === 'nft' ? this._findLockedNftSlipTriplet(tx, p2shAddress) : null;

    const accessScriptRaw =
      Array.isArray(txmsg.access_scripts) && txmsg.access_scripts.length > 0
        ? txmsg.access_scripts[0]
        : txmsg.access_script || txmsg.accessScript || '';

    const accessScript = accessScriptRaw ? JSON.parse(accessScriptRaw) : {};
    const hash = this.app.core.scripting.hash(accessScript);
    const p2shHash = txmsg.scripthash || hash || '';

    const hasAccessScript =
      typeof accessScriptRaw === 'string'
        ? accessScriptRaw.trim().length > 0
        : accessScriptRaw && typeof accessScriptRaw === 'object';

    this.unlockContext = {
      sourceTxSignature: tx.signature || '',
      p2shAddress,
      p2shHash,
      lockedSlip: lockedSlip.toJson ? lockedSlip.toJson() : lockedSlip,
      assetType,
      lockedNftSlips,
      nftId: txmsg.nft_id || '',
      nftAmount: txmsg.nft_amount || '',
      nftTxmsg: txmsg.nft_txmsg && typeof txmsg.nft_txmsg === 'object' ? txmsg.nft_txmsg : null,
      importCategory: hasAccessScript ? 'guided' : 'expert',
      sourceTxmsg: txmsg
    };

    this.workflow = 'unlock';
    this.initializeUnlockTransactions(tx);

    if (hasAccessScript) {
      let locking;
      try {
        locking =
          typeof accessScriptRaw === 'string' ? JSON.parse(accessScriptRaw) : accessScriptRaw;
      } catch (err) {
        throw new Error('access_script is not valid JSON');
      }
      if (this.main) {
        await this.main.enterUnlockGuided(locking);
      }
    } else {
      if (this.main) {
        await this.main.enterUnlockExpert();
      }
    }

    return this.unlockContext;
  }

  /**
   * Import entry point — detects guided vs expert mode from txmsg.access_scripts[].
   */
  async importTransactionForUnlock(tx) {
    return this.loadTransactionForWitness(tx);
  }

  _findP2shOutputAddress(tx) {
    const outputs = tx.to || [];
    for (let i = 0; i < outputs.length; i++) {
      const slip = outputs[i];
      if (slip?.publicKey && String(slip.publicKey).length > 0 && slip.publicKey[0] !== undefined) {
        const pk = slip.publicKey;
        if (typeof pk === 'string' && pk.length >= 66) {
          return pk;
        }
      }
    }
    return '';
  }

  _findLockedOutputSlip(tx, scriptAddress) {
    const slipKey =
      scriptAddress.length === 66 && scriptAddress.startsWith('00')
        ? this.app.crypto.toBase58(scriptAddress)
        : scriptAddress;
    const outputs = tx.to || [];
    if (slipKey) {
      for (let i = 0; i < outputs.length; i++) {
        if (outputs[i]?.publicKey === slipKey) {
          return outputs[i];
        }
      }
    }
    for (let i = 0; i < outputs.length; i++) {
      const slip = outputs[i];
      if (slip?.amount && BigInt(slip.amount) > BigInt(0)) {
        return slip;
      }
    }
    return null;
  }

  /**
   * Locate bound-normal-bound NFT output triplet locked at p2shAddress.
   * Mirrors wallet NFT output ordering from create_nft_transaction.
   */
  _findLockedNftSlipTriplet(tx, scriptAddress) {
    const slipKey =
      scriptAddress.length === 66 && scriptAddress.startsWith('00')
        ? this.app.crypto.toBase58(scriptAddress)
        : scriptAddress;
    const outputs = tx.to || [];
    for (let i = 1; i < outputs.length - 1; i++) {
      const slip1 = outputs[i - 1];
      const slip2 = outputs[i];
      const slip3 = outputs[i + 1];
      if (!slip2 || slip2.publicKey !== slipKey) {
        continue;
      }
      if (!isBoundSlipType(slip1?.type)) {
        continue;
      }
      if (!isNormalOrAtrSlipType(slip2?.type)) {
        continue;
      }
      if (!isBoundSlipType(slip3?.type)) {
        continue;
      }
      return [slip1, slip2, slip3].map(slipToStoredJson);
    }
    return null;
  }

  /**
   * Construct and broadcast a P2SH unlock transaction.
   * Prefers the silently funded unlock_transaction_final once the fee is set.
   * Starts the Transaction Monitor immediately before network propagation.
   */
  async broadcastSolution({
    destinationPublicKey = '',
    feeSaito = '0',
    callback = null
  } = {}) {
    const ctx = this.unlockContext;
    if (!ctx?.lockedSlip && !(Array.isArray(ctx?.lockedNftSlips) && ctx.lockedNftSlips.length)) {
      throw new Error('No unlock context — load a script-locked transaction first');
    }

    if (this.unlock_transaction_base && this.unlock_fee) {
      return this.broadcastUnlockBaseTransaction({ destinationPublicKey, callback });
    }

    if (!destinationPublicKey) {
      throw new Error('Destination public key is required');
    }

    if (
      ctx.assetType === 'nft' &&
      Array.isArray(ctx.lockedNftSlips) &&
      ctx.lockedNftSlips.length === 3
    ) {
      return this.broadcastNftSolution({ destinationPublicKey, feeSaito, callback });
    }

    return this.broadcastSaitoSolution({ destinationPublicKey, feeSaito, callback });
  }

  /**
   * Sign and propagate the funded unlock transaction (fee inputs + change included).
   */
  async broadcastUnlockBaseTransaction({ destinationPublicKey = '', callback = null } = {}) {
    const ctx = this.unlockContext;
    const base = this.unlock_transaction_base;
    if (!base) {
      throw new Error('Unlock transaction is not ready.');
    }
    if (!this.unlock_fee) {
      const { ensureDefaultUnlockFee } = require('./lib/ui/unlock_tx_fee');
      ensureDefaultUnlockFee(this);
    }

    const {
      ensureUnlockFeeFunded,
      assignOutputSlipIndices
    } = require('./lib/ui/unlock_tx_fee');
    const funded = await ensureUnlockFeeFunded(this.app, this);
    assignOutputSlipIndices(funded);

    const fullScript = this.getScript();
    const accessScript = JSON.stringify(fullScript);
    const tx = this.cloneTransactionSkeleton(funded);

    if (ctx?.assetType === 'nft') {
      tx.type = TransactionType.Bound;
    }

    const userOutputs = Array.isArray(base.to) ? base.to : [];
    const destination =
      destinationPublicKey ||
      String(userOutputs[0]?.publicKey || userOutputs[0]?.public_key || '') ||
      '';

    tx.msg = {
      module: this.name,
      request: 'spend p2sh',
      access_scripts: [accessScript],
      scripthash: ctx.p2shHash,
      p2sh_address: ctx.p2shAddress,
      destination,
      fee: String(this.unlock_fee.feeSaito || ''),
      source_tx: ctx.sourceTxSignature || ''
    };

    if (ctx?.assetType === 'nft') {
      tx.msg.asset_type = 'nft';
      tx.msg.nft_id = ctx.nftId || ctx.lockedNftSlips?.[2]?.publicKey || '';
      tx.msg.nft_amount = ctx.nftAmount || String(ctx.lockedNftSlips?.[0]?.amount || '0');
      if (ctx.nftTxmsg && typeof ctx.nftTxmsg === 'object') {
        Object.assign(tx.msg, ctx.nftTxmsg);
      }
    }

    await tx.sign();
    if (!tx.signature) {
      throw new Error('Unlock transaction was not signed');
    }

    if (!this.transaction_monitor) {
      console.error('RustScript: transaction_monitor is not initialized');
    } else {
      this.transaction_monitor.render({
        tx,
        title: 'Broadcasting...',
        lead: 'Your unlock transaction is being broadcast to the Saito network.',
        subtitle: 'Waiting for confirmation...',
        successTitle: 'Script Unlocked',
        successLead:
          'Your unlock transaction has been confirmed and the locked funds have been released.',
        successActionLabel: 'Continue',
        callback: typeof callback === 'function' ? callback : null
      });
    }

    this.logP2shDebuggingTraceBeforePropagate('broadcastUnlockBaseTransaction', tx);
    await this.app.network.propagateTransaction(tx);
    return tx;
  }

  /**
   * SAITO unlock — legacy rebuild path (fee deducted from locked UTXO).
   * Kept for callers that have not configured unlock_fee on unlock_transaction_base.
   */
  async broadcastSaitoSolution({
    destinationPublicKey = '',
    feeSaito = '0',
    callback = null
  } = {}) {
    const ctx = this.unlockContext;
    if (!ctx?.lockedSlip) {
      throw new Error('No unlock context — load a script-locked transaction first');
    }
    if (!destinationPublicKey) {
      throw new Error('Destination public key is required');
    }

    const fullScript = this.getScript();
    const accessScript = JSON.stringify(fullScript);

    const feeNolan = this.app.wallet.convertSaitoToNolan(feeSaito || '0');
    const lockedAmount = BigInt(ctx.lockedSlip.amount || 0);
    const outputAmount = lockedAmount - feeNolan;
    // Fee larger than the locked UTXO cannot be funded from this input alone.
    if (outputAmount < BigInt(0)) {
      throw new Error('Fee exceeds locked amount');
    }

    const tx = new Transaction();
    tx.timestamp = Date.now();

    const lockedInput = new Slip(undefined, ctx.lockedSlip);
    tx.addFromSlip(lockedInput);

    const output = new Slip();
    output.publicKey = destinationPublicKey;
    output.amount = outputAmount;
    tx.addToSlip(output);

    tx.msg = {
      module: this.name,
      request: 'spend p2sh',
      access_scripts: [accessScript],
      scripthash: ctx.p2shHash,
      p2sh_address: ctx.p2shAddress,
      destination: destinationPublicKey,
      fee: String(feeSaito),
      source_tx: ctx.sourceTxSignature || ''
    };

    await tx.sign();
    if (!tx.signature) {
      throw new Error('Unlock transaction was not signed');
    }

    if (!this.transaction_monitor) {
      console.error('RustScript: transaction_monitor is not initialized');
    } else {
      this.transaction_monitor.render({
        tx,
        title: 'Broadcasting...',
        lead: 'Your unlock transaction is being broadcast to the Saito network.',
        subtitle: 'Waiting for confirmation...',
        successTitle: 'Script Unlocked',
        successLead:
          'Your unlock transaction has been confirmed and the locked funds have been released.',
        successActionLabel: 'Continue',
        callback: typeof callback === 'function' ? callback : null
      });
    }

    this.logP2shDebuggingTraceBeforePropagate('broadcastSaitoSolution', tx);
    await this.app.network.propagateTransaction(tx);
    return tx;
  }

  /**
   * NFT unlock — preserve bound-normal-bound slip triplet (same semantics as create_send_bound_transaction).
   *
   * Slips copied:
   *   slip1 — Bound, NFT amount (creator public key)
   *   slip2 — Normal, SAITO deposit (recipient updated to destination)
   *   slip3 — Bound, NFT uuid (amount 0)
   *
   * Transaction type: Bound (required for wallet NFT recognition).
   */
  async broadcastNftSolution({
    destinationPublicKey = '',
    feeSaito = '0',
    callback = null
  } = {}) {
    const ctx = this.unlockContext;
    const slips = ctx.lockedNftSlips;
    const fullScript = this.getScript();
    const accessScript = JSON.stringify(fullScript);

    const feeNolan = this.app.wallet.convertSaitoToNolan(feeSaito || '0');
    const depositAmount = BigInt(slips[1].amount || 0);
    // NFT unlocks may be fee-costly relative to the deposit — never refuse on that basis.
    // If the fee would consume the deposit, keep the deposit intact on the output.
    let outputDeposit = depositAmount - feeNolan;
    if (outputDeposit <= BigInt(0)) {
      outputDeposit = depositAmount;
    }

    const tx = new Transaction();
    tx.timestamp = Date.now();
    tx.type = TransactionType.Bound;

    for (const stored of slips) {
      tx.addFromSlip(new Slip(undefined, stored));
    }

    const out1 = new Slip(undefined, { ...slips[0] });
    const out2 = new Slip(undefined, {
      ...slips[1],
      publicKey: destinationPublicKey,
      amount: outputDeposit
    });
    const out3 = new Slip(undefined, { ...slips[2] });

    tx.addToSlip(out1);
    tx.addToSlip(out2);
    tx.addToSlip(out3);

    tx.msg = {
      module: this.name,
      request: 'spend p2sh',
      asset_type: 'nft',
      access_scripts: [accessScript],
      scripthash: ctx.p2shHash,
      p2sh_address: ctx.p2shAddress,
      destination: destinationPublicKey,
      fee: String(feeSaito),
      source_tx: ctx.sourceTxSignature || '',
      nft_id: ctx.nftId || slips[2]?.publicKey || '',
      nft_amount: ctx.nftAmount || String(slips[0]?.amount || '0')
    };

    if (ctx.nftTxmsg && typeof ctx.nftTxmsg === 'object') {
      Object.assign(tx.msg, ctx.nftTxmsg);
    }

    await tx.sign();
    if (!tx.signature) {
      throw new Error('Unlock transaction was not signed');
    }

    if (!this.transaction_monitor) {
      console.error('RustScript: transaction_monitor is not initialized');
    } else {
      this.transaction_monitor.render({
        tx,
        title: 'Broadcasting...',
        lead: 'Your unlock transaction is being broadcast to the Saito network.',
        subtitle: 'Waiting for confirmation...',
        successTitle: 'Script Unlocked',
        successLead:
          'Your unlock transaction has been confirmed and the locked funds have been released.',
        successActionLabel: 'Continue',
        callback: typeof callback === 'function' ? callback : null
      });
    }

    this.logP2shDebuggingTraceBeforePropagate('broadcastNftSolution', tx);
    await this.app.network.propagateTransaction(tx);
    return tx;
  }
}

module.exports = Rustscript;
