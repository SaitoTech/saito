const crypto = require("./../../../../lib/saito/crypto").default;

module.exports = {

  name: "IMPORTFIELD",

  description: `
Imports a signed field into VARS.

Verifies that a value provided in the witness was signed by an authorized publickey
over a binding hash (literal or VAR reference), then writes the value into VARS.

Typical use:
- import subscription duration
- import tier, scope, flags, etc.
`,

  exampleScript: {
    op: "IMPORTFIELD",
    field: "duration",
    publickey: "__opcodes.checkownnftwhere.creator",
    hash: "__opcodes.checkownnftwhere.nft_id"
  },

  exampleWitness: {
    duration: "<integer>",
    signature: "<hex_signature>"
  },

  schema: {
    script: {
      field: "string",
      publickey: "string",
      hash: "string"
    },
    witness: {
      signature: "string"
    }
  },

  execute(app, script, witness, vars, tx, blk) {

    try {

      // --------------------------------------------------
      // Resolve script parameters (VARs first, literal fallback)
      // --------------------------------------------------
      const field_name = script.field;
      const signer_pubkey = app.browser.resolveVarReference(vars, script.publickey);
      const binding_hash  = app.browser.resolveVarReference(vars, script.hash);

      if (!field_name || !signer_pubkey || !binding_hash) {
        return false;
      }

      // --------------------------------------------------
      // Resolve witness values (also via VAR resolver)
      // --------------------------------------------------
      const value = app.browser.resolveVarReference(vars, witness[field_name]);
      const signature = app.browser.resolveVarReference(vars, witness.signature);

      if (
        value === undefined ||
        value === null ||
        signature === undefined ||
        signature === null
      ) {
console.log("something undefined or null...");
        return false;
      }

      // --------------------------------------------------
      // Canonical digest: hash(binding_hash | value)
      // --------------------------------------------------
      const canonical_string = `${value}|${binding_hash}`;
      const digest = app.crypto.hash(canonical_string);

console.log("verifying...");
console.log("digest: " + digest);
console.log("signature: " + signature);
console.log("publickey: " + signer_pubkey);

      // --------------------------------------------------
      // Verify signature
      // --------------------------------------------------
      const is_valid = app.crypto.verifyMessage(
        digest,
        signature,
        signer_pubkey
      );

      if (!is_valid) {
console.log("sig invalid!");
        return false;
      }

      // --------------------------------------------------
      // Write into VARS (opcode namespace)
      // --------------------------------------------------
      if (!vars.__opcodes) { vars.__opcodes = {}; }
      if (!vars.__opcodes.importfield) { vars.__opcodes.importfield = {}; }

      vars.__opcodes.importfield[field_name] = value;

console.log("^^^^^^ IMPORT FIELD ^^^^^^");
console.log(JSON.stringify(vars.__opcodes));

      return true;

    } catch (err) {
      return false;
    }
  }
};

