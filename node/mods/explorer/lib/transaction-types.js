const TRANSACTION_TYPE_NAMES = {
  0: 'Normal',
  1: 'Fee',
  2: 'GoldenTicket',
  3: 'ATR',
  4: 'Vip',
  5: 'SPV',
  6: 'Issuance',
  7: 'BlockStake',
  8: 'Bound',
  Normal: 'Normal',
  Fee: 'Fee',
  GoldenTicket: 'GoldenTicket',
  ATR: 'ATR',
  Vip: 'Vip',
  SPV: 'SPV',
  Issuance: 'Issuance',
  BlockStake: 'BlockStake',
  Bound: 'Bound'
};

const SLIP_TYPE_NAMES = {
  0: 'Normal',
  1: 'ATR',
  2: 'VipInput',
  3: 'VipOutput',
  4: 'MinerInput',
  5: 'MinerOutput',
  6: 'RouterInput',
  7: 'RouterOutput',
  8: 'BlockStake',
  9: 'Bound',
  10: 'P2SH',
  Normal: 'Normal',
  ATR: 'ATR',
  VipInput: 'VipInput',
  VipOutput: 'VipOutput',
  MinerInput: 'MinerInput',
  MinerOutput: 'MinerOutput',
  RouterInput: 'RouterInput',
  RouterOutput: 'RouterOutput',
  BlockStake: 'BlockStake',
  Bound: 'Bound',
  P2SH: 'P2SH'
};

function formatTransactionTypeName(type) {
  if (type == null || type === '') {
    return 'Unknown';
  }
  return TRANSACTION_TYPE_NAMES[type] || String(type);
}

function formatSlipTypeName(type) {
  if (type == null || type === '') {
    return 'Unknown';
  }
  return SLIP_TYPE_NAMES[type] || String(type);
}

module.exports = {
  TRANSACTION_TYPE_NAMES,
  SLIP_TYPE_NAMES,
  formatTransactionTypeName,
  formatSlipTypeName
};
