module.exports = {

  name: "IMPORTFIELD",

  description: `
Imports a signed field into VARS.

Verifies that a value provided in required was signed by an authorized publickey
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

  exampleRequired: {
    duration: "<integer>",
    signature: "<hex_signature>"
  },

  schema: {
    script: {
      field: "string",
      publickey: "string",
      hash: "string"
    },
    required: {
      signature: "string"
    }
  },

  execute(node, context) {
    const required = node.required || {};
    const field_name = node.field;
    const signer_pubkey = context.app.browser.resolveVarReference(context, node.publickey);
    const binding_hash  = context.app.browser.resolveVarReference(context, node.hash);

    if (!field_name || !signer_pubkey || !binding_hash) {
      return false;
    }

    const value = context.app.browser.resolveVarReference(context, required[field_name]);
    const signature = context.app.browser.resolveVarReference(context, required.signature);

    if (
      value === true ||
      value === undefined ||
      value === null ||
      signature === true ||
      signature === undefined ||
      signature === null
    ) {
      return false;
    }

    const canonical_string = `${value}|${binding_hash}`;
    const digest = context.app.crypto.hash(canonical_string);

    const is_valid = context.app.crypto.verifyMessage(
      digest,
      signature,
      signer_pubkey
    );

    if (!is_valid) {
      return false;
    }

    if (!context.__opcodes) { context.__opcodes = {}; }
    if (!context.__opcodes.importfield) { context.__opcodes.importfield = {}; }

    context.__opcodes.importfield[field_name] = value;

    return true;
  }
};
