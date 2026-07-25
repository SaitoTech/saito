const ModTemplate = require('./../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const RustscriptMain = require('./lib/ui/main');
const ast_execute = require('./lib/rustscript/ast_execute');
const tokenize = require('./lib/rustscript/semantic_to_tokens');
const parse = require('./lib/rustscript/tokens_to_ast');
const { build_test_script_from_create, lockingView } = require('./lib/ui/script_build');
const {
  downloadTransactionFile,
  serializeTransactionToWeb,
  transactionExportFilename
} = require('./lib/transaction_io');
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
  if (typeof slip.toJson === 'function') {
    return slip.toJson();
  }
  return {
    publicKey: slip.publicKey,
    amount: slip.amount,
    type: slip.type,
    blockId: slip.blockId,
    txOrdinal: slip.txOrdinal,
    index: slip.index
  };
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

    this.styles = [
      '/rustscript/css/main.css',
      '/rustscript/css/rustscript-header.css',
      '/rustscript/css/rustscript-command-bar.css',
      '/rustscript/css/rustscript-editor.css',
      '/rustscript/css/rustscript-panel.css',
      '/rustscript/css/rustscript-overlay-system.css',
      '/rustscript/css/rustscript-welcome-overlay.css',
      '/rustscript/css/rustscript-fields-overlay.css',
      '/rustscript/css/rustscript-overlay.css',
      '/rustscript/css/rustscript-opcodes-overlay.css',
      '/rustscript/css/rustscript-publish-overlay.css',
      '/rustscript/css/rustscript-publish-nft.css',
      '/rustscript/css/rustscript-import-overlay.css',
      '/saito/css-imports/ui/saito-nft.css'
    ];

    this.icon = 'fas fa-code';

    this.script = {};
    this.opcodes = {};
    this.main = null;
    this.header = null;

    /** @type {'create'|'unlock'} */
    this.workflow = 'create';
    this.unlockContext = null;
  }

  async initialize(app) {
    super.initialize?.(app);

    [
      OpcodeChecksig,
      OpcodeCheckmultisig,
      OpcodeCheckhash,
      OpcodeCheckfield,
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
    const unlockingScript = build_test_script_from_create(ast, {}, this.opcodes);

    return {
      tokens,
      ast,
      lockingScript: ast,
      unlockingScript,
      json: JSON.stringify(ast, null, 2)
    };
  }

  async onConfirmation(blk, tx, conf) {
    if (this.main?.publishFlow) {
      this.main.publishFlow.handleConfirmation(blk, tx, conf);
    }
    if (this.main?.unlockFlow) {
      this.main.unlockFlow.handleConfirmation(blk, tx, conf);
    }
  }

  async onNewBlock(blk, lc) {
    if (this.main?.publishFlow) {
      await this.main.publishFlow.checkBlockForPendingTx(blk);
    }
    if (this.main?.unlockFlow) {
      await this.main.unlockFlow.checkBlockForPendingTx(blk);
    }
  }

  resetUnlockWorkflow() {
    this.workflow = 'create';
    this.unlockContext = null;
  }

  /** Canonical web-serialized transaction JSON (shared with import / future explorer export). */
  serializeTransaction(tx) {
    return serializeTransactionToWeb(this.app, tx);
  }

  /** Download a transaction as canonical JSON via the browser. */
  exportTransaction(tx, { prefix } = {}) {
    const filename = prefix ? transactionExportFilename(tx, prefix) : undefined;
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
   * Construct and broadcast a P2SH unlock transaction spending all locked funds.
   */
  async broadcastSolution({ destinationPublicKey = '', feeSaito = '0' } = {}) {
    const ctx = this.unlockContext;
    if (!ctx?.lockedSlip) {
      throw new Error('No unlock context — load a script-locked transaction first');
    }
    if (!destinationPublicKey) {
      throw new Error('Destination public key is required');
    }

    if (
      ctx.assetType === 'nft' &&
      Array.isArray(ctx.lockedNftSlips) &&
      ctx.lockedNftSlips.length === 3
    ) {
      return this.broadcastNftSolution({ destinationPublicKey, feeSaito });
    }

    return this.broadcastSaitoSolution({ destinationPublicKey, feeSaito });
  }

  /**
   * SAITO unlock — single locked output to destination (existing behavior).
   */
  async broadcastSaitoSolution({ destinationPublicKey = '', feeSaito = '0' } = {}) {
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
    if (outputAmount <= BigInt(0)) {
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
    await this.app.network.propagateTransaction(tx);

    if (!tx.signature) {
      throw new Error('Unlock transaction was not signed');
    }

    if (this.main?.unlockFlow) {
      this.main.unlockFlow.notePendingSignature(tx.signature);
    }

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
  async broadcastNftSolution({ destinationPublicKey = '', feeSaito = '0' } = {}) {
    const ctx = this.unlockContext;
    const slips = ctx.lockedNftSlips;
    const fullScript = this.getScript();
    const accessScript = JSON.stringify(fullScript);

    const feeNolan = this.app.wallet.convertSaitoToNolan(feeSaito || '0');
    const depositAmount = BigInt(slips[1].amount || 0);
    const outputDeposit = depositAmount - feeNolan;
    if (outputDeposit <= BigInt(0)) {
      throw new Error('Fee exceeds locked deposit');
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
    await this.app.network.propagateTransaction(tx);

    if (!tx.signature) {
      throw new Error('Unlock transaction was not signed');
    }

    if (this.main?.unlockFlow) {
      this.main.unlockFlow.notePendingSignature(tx.signature);
    }

    return tx;
  }
}

module.exports = Rustscript;
