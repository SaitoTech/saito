const ScriptingKeyTemplate = require('./scripting.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const {
  listContracts,
  getContractScriptJson,
  getDefaultContractId
} = require('../../contracts');

class ScriptingKey {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.callback = null;
    this.contracts = listContracts();
    this.selected_contract_id = getDefaultContractId();
    this.custom_draft = getContractScriptJson(getDefaultContractId());
    this.script_text = this.custom_draft;
  }

  render() {
    this.overlay.show(
      ScriptingKeyTemplate(this.app, this.mod, {
        contracts: this.contracts,
        selected_contract_id: this.selected_contract_id,
        script_text: this.script_text
      })
    );
    setTimeout(() => this.attachEvents(), 25);
  }

  textarea() {
    return document.querySelector('.vault-scripting-overlay .create-nft-script-textarea');
  }

  typeSelect() {
    return document.getElementById('vault-script-type');
  }

  readEditor() {
    const el = this.textarea();
    return el ? el.value : this.script_text;
  }

  writeEditor(text) {
    this.script_text = text;
    const el = this.textarea();
    if (el) {
      el.value = text;
    }
  }

  applyContractSelection(next_id) {
    const current = this.readEditor();

    // Leaving Custom: remember the user's draft so switching back restores it.
    if (this.selected_contract_id === 'custom') {
      this.custom_draft = current;
    }

    this.selected_contract_id = next_id || getDefaultContractId();

    if (this.selected_contract_id === 'custom') {
      this.writeEditor(this.custom_draft || getContractScriptJson('custom'));
      return;
    }

    const build_opts = {};
    if (this.selected_contract_id === 'rental') {
      // Same source as Vault mintNFT recipient: app.wallet.publicKey
      const creator_publickey = this.app?.wallet?.publicKey || this.mod?.publicKey;
      if (creator_publickey) {
        build_opts.creator_publickey = creator_publickey;
      }
    }

    const template = getContractScriptJson(this.selected_contract_id, true, build_opts);
    if (template) {
      this.writeEditor(template);
    }
  }

  attachEvents() {
    try {
      const type_select = this.typeSelect();
      if (type_select) {
        type_select.onchange = (e) => {
          this.applyContractSelection(e.target.value);
        };
      }

      document.getElementById('mint_scripting_key_btn').onclick = (e) => {
        if (!this.app.core?.scripting?.hash || this.callback == null) {
          salert('Core scripting is not available - cannot calculate access_hash locally...');
          return;
        }

        let scriptjson = this.readEditor();
        const nft_type =
          this.selected_contract_id === 'rental' ? 'vault-nft-rental-key' : 'vault-nft-key';

        // Rental: re-bind creator pubkey so no CREATOR_PUBLICKEY_PLACEHOLDER remains.
        if (this.selected_contract_id === 'rental') {
          const creator_publickey = this.app?.wallet?.publicKey || this.mod?.publicKey;
          if (!creator_publickey) {
            salert('Wallet public key unavailable - cannot create rental contract...');
            return;
          }
          scriptjson = getContractScriptJson('rental', true, { creator_publickey });
          this.writeEditor(scriptjson);
        }

        if (scriptjson.includes('CREATOR_PUBLICKEY_PLACEHOLDER')) {
          salert('Creator public key was not substituted into the rental contract...');
          return;
        }

        let access_hash = this.app.core.scripting.hash(scriptjson);
        this.callback({
          access_hash: access_hash,
          access_script: scriptjson,
          contract_id: this.selected_contract_id,
          nft_type: nft_type
        });
        this.overlay.remove();
      };
    } catch (err) {}
  }
}

module.exports = ScriptingKey;
