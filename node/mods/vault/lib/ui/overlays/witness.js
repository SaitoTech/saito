const WitnessTemplate = require('./witness.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

//
// Witness field names per opcode (mirrors rustscript exampleScript.witness keys).
//
const WITNESS_FIELDS_BY_OP = {
  CHECKOWNNFT: ['utxokey1', 'utxokey2', 'utxokey3'],
  CHECKOWNNFTWHERE: ['utxokey1', 'utxokey2', 'utxokey3'],
  CHECKHASH: ['input'],
  CHECKSIG: ['signature'],
  CHECKMULTISIG: ['signatures'],
  CHECKPATH: ['path'],
  CHECKPATHHOP: ['hops'],
  IMPORTFIELD: ['value']
};

const UTXOKEY_VAULT_FIELDS = {
  utxokey1: 'slip1_utxokey',
  utxokey2: 'slip2_utxokey',
  utxokey3: 'slip3_utxokey'
};

function isWitnessValueMissing(value) {
  return value === undefined || value === null || value === '';
}

function prepareAccessScript(access_script, vault_entry = null) {
  let script =
    typeof access_script === 'string'
      ? JSON.parse(access_script)
      : JSON.parse(JSON.stringify(access_script));

  const op = script?.op;
  const witnessFields = WITNESS_FIELDS_BY_OP[op];

  if (witnessFields) {
    if (!script.witness || typeof script.witness !== 'object' || Array.isArray(script.witness)) {
      script.witness = {};
    }

    for (const field of witnessFields) {
      if (!isWitnessValueMissing(script.witness[field])) {
        continue;
      }

      const vaultField = UTXOKEY_VAULT_FIELDS[field];
      if (vaultField && vault_entry && vault_entry[vaultField]) {
        script.witness[field] = vault_entry[vaultField];
      } else {
        script.witness[field] = '';
      }
    }
  } else if (
    script.witness &&
    typeof script.witness === 'object' &&
    !Array.isArray(script.witness)
  ) {
    for (const key of Object.keys(script.witness)) {
      if (script.witness[key] === undefined || script.witness[key] === null) {
        script.witness[key] = '';
      }
    }
  }

  return script;
}

class Witness {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.callback = null;
    this.access_script = null;
    this.vault_entry = null;
  }

  render() {
    this.overlay.show(WitnessTemplate(this.app, this.mod, this));

    setTimeout(() => {
      let scriptTextarea = document.querySelector('.witness-access-script-textarea');
      if (scriptTextarea && this.access_script) {
        try {
          let scriptObj = prepareAccessScript(this.access_script, this.vault_entry);
          scriptTextarea.value = JSON.stringify(scriptObj, null, 2);
        } catch (err) {
          scriptTextarea.value =
            typeof this.access_script === 'string'
              ? this.access_script
              : JSON.stringify(this.access_script, null, 2);
        }
      }

      this.attachEvents();
    }, 25);
  }

  attachEvents() {
    try {
      document.getElementById('download_with_witness_btn').onclick = (e) => {
        let access_script = document.querySelector('.witness-access-script-textarea').value;

        if (!access_script || access_script.trim() === '') {
          salert('Please provide an access script to proceed.');
          return;
        }

        try {
          JSON.parse(access_script);
        } catch (err) {
          salert('Invalid JSON format in access script. Please check your input.');
          return;
        }

        if (this.callback) {
          this.callback({ access_script: access_script });
          this.overlay.remove();
        } else {
          salert('Error: No callback function defined.');
        }
      };

      let helpLink = document.getElementById('witness-help-link');
      if (helpLink) {
        helpLink.onclick = (e) => {
          salert(
            'Edit the full access script JSON, including any witness fields required by the opcode. For example:\n\n' +
              '{\n  "op": "CHECKHASH",\n  "hash": "...",\n  "witness": { "input": "" }\n}\n\n' +
              'or\n\n' +
              '{\n  "op": "CHECKOWNNFT",\n  "nftid": "...",\n  "witness": {\n    "utxokey1": "",\n    "utxokey2": "",\n    "utxokey3": ""\n  }\n}'
          );
        };
      }
    } catch (err) {
      console.error('Witness overlay attachEvents error:', err);
    }
  }
}

module.exports = Witness;
