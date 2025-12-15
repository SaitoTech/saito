class SaitoScripting {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.MAX_DEPTH = 8;
    this.MAX_NODES = 16;
    this.node_counter = 0;
  }

  render() {}
  attachEvents() {}

  //
  // Canonicalize a JS object into a deterministic JSON string.
  // Sorts object keys recursively, removes whitespace, UTF-8 encoded.
  //
  canonicalize(script_obj) {
    if (script_obj === null || typeof script_obj !== 'object') {
      return JSON.stringify(script_obj);
    }

    if (Array.isArray(script_obj)) {
      return '[' + script_obj.map(canonicalize).join(',') + ']';
    }

    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k]));
    return '{' + parts.join(',') + '}';
  }

  generate(script = '') {
    const json = canonicalize(script);
    return this.app.crypto.hash(json);
  }

  evaluate(hash, script, witness = {}, vars = {}) {
    //
    // make sure script is JSON object
    //
    if (typeof script === 'string') {
      try {
        script = JSON.parse(script);
      } catch (err) {
        console.warn('Scripting: invalid JSON script string');
        return false;
      }
    }

    //
    // track to prevent infinite rules / DDOS
    //
    his.node_counter = 0; // reset per evaluation

    //
    // check the hash is correct
    //
    const computed_hash = this.generate(script);
    if (computed_hash !== hash) {
      console.warn('Scripting: hash mismatch', computed_hash, '≠', hash);
      return false;
    }

    //
    // swap witness data into script and evaluate the rules
    //
    return this._eval(script, witness, vars, 0); // 0 => current recursion depth
  }

  _eval(script, witness, vars, depth = 0) {
    if (depth > this.MAX_DEPTH) {
      console.warn(`Scripting: exceeded max recursion depth (${this.MAX_DEPTH})`);
      return false;
    }

    this.node_counter++;
    if (this.node_counter > this.MAX_NODES) {
      console.warn(`Scripting: exceeded max node count (${this.MAX_NODES})`);
      return false;
    }

    if (!script || typeof script !== 'object') {
      return false;
    }

    switch (script.op) {
      case 'AND':
        return script.args.every((arg) => this._eval(arg, witness, vars, depth + 1));

      case 'OR':
        return script.args.some((arg) => this._eval(arg, witness, vars, depth + 1));

      case 'NOT':
        return !this._eval(script.args[0], witness, vars, depth + 1);

      case 'CHECKSIG': {
        const sig = witness.signature || witness.signatures?.[0];
        const msg = vars.message || 'saito-validation';
        return this.app.crypto.verifyMessage(sig, script.pubkey, msg);
      }

      case 'CHECKMULTISIG': {
        const sigs = witness.signatures || [];
        const pubkeys = script.pubkeys || [];
        const m = script.m || pubkeys.length;
        let valid = 0;
        for (let i = 0; i < pubkeys.length && i < sigs.length; i++) {
          if (
            this.app.crypto.verifyMessage(sigs[i], pubkeys[i], vars.message || 'saito-validation')
          ) {
            valid++;
          }
        }
        return valid >= m;
      }

      case 'CHECKOWN': {
        const nft_sig = script.nft_sig;
        const requester = witness.requester_pubkey;
        if (!this.app.wallet) {
          return false;
        }
        return this.app.wallet.isSlipSpendable(nft_sig, requester);
      }

      case 'CHECKEXPIRY': {
        const now = vars.current_time || Date.now();
        return now <= script.t;
      }

      default:
        console.warn('Unknown opcode:', script.op);
        return false;
    }
  }

  test() {
    //
    // CHECKSIG
    //
    let a_script = {
      op: 'CHECKSIG',
      pubkey: '<creator_pubkey>'
    };
    let a_witness = {
      signature: '<signature_by_creator>',
      requester_pubkey: '<creator_pubkey>'
    };

    //
    // CHECKMULTISIG
    //
    let b_script = {
      op: 'CHECKMULTISIG',
      m: 2,
      pubkeys: ['<pkA>', '<pkB>', '<pkC>']
    };
    let b_witness = {
      signatures: ['<sig_by_pkA>', '<sig_by_pkB>']
    };

    //
    // CHECKOWN
    //
    let c_script = {
      op: 'CHECKOWN',
      nft_sig: '0xABC123...'
    };
    let c_witness = {
      requester_pubkey: '<user_pubkey>'
    };
  }
}

module.exports = SaitoScripting;
