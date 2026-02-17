/**
 * Access Script Templates for Stack Posts
 * 
 * This module provides canonical access script templates that map publish intents
 * to deterministic access control scripts. Scripts operate on NFT properties, not
 * specific NFT IDs, allowing reusable subscription NFTs.
 * 
 * All scripts are returned as JSON objects (not strings) for canonicalization.
 */

/**
 * Get access script template for a publish intent
 * 
 * @param {Object} intent - Publish intent object
 * @param {string} intent.visibility - "public" | "private"
 * @param {string|null} intent.access_mode - null | "transferable" | "non-transferable"
 * @param {Object|null} intent.time_limit - null | { seconds: number }
 * @param {string} intent.author - Public key of the post author
 * @returns {Object|null} Access script object, or null for public posts
 */
function getAccessScriptForIntent(intent) {
  if (!intent || typeof intent !== 'object') {
    throw new Error('getAccessScriptForIntent: intent must be an object');
  }

  // Validate intent structure
  if (!['public', 'private', 'subscription'].includes(intent.visibility)) {
    throw new Error(`getAccessScriptForIntent: invalid visibility "${intent.visibility}"`);
  }

  if (!intent.author || typeof intent.author !== 'string') {
    throw new Error('getAccessScriptForIntent: author must be a non-empty string');
  }

  // Public posts: no access script
  if (intent.visibility === 'public') {
    if (intent.access_mode !== null || intent.time_limit !== null) {
      throw new Error('getAccessScriptForIntent: public posts must have access_mode and time_limit as null');
    }
    return null;
  }

  // Private posts: select template based on access_mode
  if (intent.visibility === 'private') {
    const accessMode = intent.access_mode;

    if (accessMode === 'transferable') {
      return getPrivateTransferableScript(intent.author);
    } else if (accessMode === 'non-transferable') {
      return getPrivateNonTransferableScript(intent.author);
    } else if (accessMode === null) {
      // Default to transferable if not specified
      return getPrivateTransferableScript(intent.author);
    } else {
      throw new Error(`getAccessScriptForIntent: invalid access_mode "${accessMode}"`);
    }
  }

  // Subscription posts: select template based on access_mode
  if (intent.visibility === 'subscription') {
    const accessMode = intent.access_mode;

    if (accessMode === 'transferable') {
      return getSubscriptionTransferableScript(intent.author);
    } else if (accessMode === 'non-transferable') {
      return getSubscriptionNonTransferableScript(intent.author);
    } else if (accessMode === null) {
      // Default to transferable
      return getSubscriptionTransferableScript(intent.author);
    } else {
      throw new Error(`getAccessScriptForIntent: invalid access_mode "${accessMode}"`);
    }
  }

  // Should never reach here
  throw new Error('getAccessScriptForIntent: unexpected intent state');
}

/**
 * Private + Transferable: CHECKOWNNFTWHERE script
 * 
 * Validates:
 * - Submitter controls the NFT (via slips)
 * - NFT type === "stack"
 * - NFT creator === author public key
 * 
 * @param {string} authorPublicKey - Public key of the post author
 * @returns {Object} Access script object
 */
function getPrivateTransferableScript(authorPublicKey) {
  return {
    op: "CHECKOWNNFTWHERE",
    where: [
      {
        field: "type",
        operator: "==",
        value: "stack"
      },
      {
        field: "creator",
        operator: "==",
        value: authorPublicKey
      }
    ]
  };
}

/**
 * Private + Non-Transferable: Chained constraints
 * 
 * Validates:
 * - CHECKPATH: NFT ownership path
 * - CHECKPATHHOP: Delegation constraint (prevents transfer)
 * - CHECKOWNNFTWHERE: Type and creator validation
 * 
 * @param {string} authorPublicKey - Public key of the post author
 * @returns {Object} Access script object
 */
function getPrivateNonTransferableScript(authorPublicKey) {
  return {
    op: "AND",
    args: [
      {
        op: "CHECKOWNNFTWHERE",
        where: [
          {
            field: "type",
            operator: "==",
            value: "stack"
          },
          {
            field: "creator",
            operator: "==",
            value: authorPublicKey
          }
        ]
      },
      {
        op: "CHECKPATHHOP",
        selector: "FIRST",
        where: [
          {
            field: "value.delegate",
            operator: "==",
            value: false,
            type: "boolean"
          }
        ],
        assert: [
          {
            field: "to",
            operator: "==",
            value: "REQUESTER"
          }
        ],
        publickey: authorPublicKey ,
        hash: "__opcodes.checkownnftwhere.nft_id"
      }
    ]
  };
}


function getSubscriptionTransferableScript(authorPublicKey) {
  return {
    op: "AND",
    args: [

      { 
	op: "CHECKOWNNFTWHERE",
        where: [
          {
            field: "type",
            operator: "==",
            value: "stack"
          },
          {
            field: "creator",
            operator: "==",
            value: authorPublicKey
          }
        ]

      },

      {
        op: "CHECKPATHHOP",
        selector: "FIRST",
        where: [{ field: "value.delegate", operator: "==", value: false }],
        publickey: authorPublicKey ,
        hash: "__opcodes.checkownnftwhere.nft_id"
      },

      {
        op: "IMPORTFIELD",
        field: "duration",
        publickey: authorPublicKey ,
        hash: "__opcodes.checkownnftwhere.nft_id"
      },

      {
        op: "SUMFIELDS",
        a: "__opcodes.checkpathhop.hop.value.timestamp",
        b: "__opcodes.importfield.duration",
        into: "expiry"
      },

      {
        op: "CHECKFIELD",
        field: "__opcodes.sumfields.expiry",
        operator: ">",
        value: "NOW"
      }
    ]
  }
}

function getSubscriptionNonTransferableScript(authorPublicKey) {
  return {
    op: "AND",
    args: [

      {
        op: "CHECKOWNNFTWHERE",
        where: [
          { field: "type", operator: "==", value: "stack" },
          { field: "creator", operator: "==", value: authorPublicKey }
        ]
      },

      {
        op: "CHECKPATHHOP",
        selector: "FIRST",
        where: [
          { field: "value.delegate", operator: "==", value: false }
        ],
        publickey: authorPublicKey,
        hash: "__opcodes.checkownnftwhere.nft_id"
      },

      {
        op: "IMPORTFIELD",
        field: "duration",
        publickey: authorPublicKey,
        hash: "__opcodes.checkownnftwhere.nft_id"
      },

      {
        op: "SUMFIELDS",
        a: "__opcodes.checkpathhop.hop.value.timestamp",
        b: "__opcodes.importfield.duration",
        into: "expiry"
      },

      {
        op: "CHECKFIELD",
        field: "__opcodes.sumfields.expiry",
        operator: ">",
        value: "NOW"
      },

      {
        op: "CHECKFIELD",
        field: "__opcodes.checkpathhop.hop.to",
        operator: "==",
        value: "REQUESTER"
      }
    ]
  };
}


module.exports = {
  getAccessScriptForIntent
};

