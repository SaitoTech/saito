/**
 * UI-only contract templates — map mechanisms to example locking scripts.
 * Does not modify parser/runtime.
 */

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function lockingFromOpcode(opcodes, key) {
  const op = opcodes?.[key];
  if (!op?.exampleScript) {
    return { op: String(key || '').toUpperCase() };
  }
  const script = clone(op.exampleScript);
  delete script.witness;
  return script;
}

function getContractTemplates(opcodes) {
  const multisig = lockingFromOpcode(opcodes, 'checkmultisig');
  const multiApproval = clone(multisig);
  if (multiApproval.m !== undefined) {
    multiApproval.m = 3;
  }

  return [
    {
      id: 'shared-wallet',
      name: 'Shared Wallet',
      description: 'Several people must agree before anything moves.',
      locking: multisig
    },
    {
      id: 'secret-vault',
      name: 'Secret Vault',
      description: 'Unlock only when the correct secret is revealed.',
      locking: lockingFromOpcode(opcodes, 'checkhash')
    },
    {
      id: 'timed-release',
      name: 'Timed Release',
      description: 'Funds unlock only after a chosen moment in time.',
      locking: lockingFromOpcode(opcodes, 'checktime')
    },
    {
      id: 'challenge',
      name: 'Challenge Contract',
      description: 'Prove you signed a specific challenge message.',
      locking: (() => {
        const s = lockingFromOpcode(opcodes, 'checksig');
        s.msg = 'challenge: prove you control this rule';
        return s;
      })()
    },
    {
      id: 'tournament-prize',
      name: 'Tournament Prize',
      description: 'Reward must pay a specific winner address.',
      locking: lockingFromOpcode(opcodes, 'checkrecipient')
    },
    {
      id: 'multi-approval',
      name: 'Multi-user Approval',
      description: 'A committee must reach a higher approval threshold.',
      locking: multiApproval
    }
  ];
}

function scratchContract() {
  return {
    op: 'CHECKSIG',
    publickey: '<publickey>',
    msg: 'my ownership rule'
  };
}

module.exports = { getContractTemplates, scratchContract, lockingFromOpcode };
