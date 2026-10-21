class Transfers {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  createTransfer({ mixinUserId, assetId, destination, amount, memo }) {
    return this.mod.database.insertTransfer({
      mixinUserId,
      assetId,
      destination,
      amount,
      memo
    });
  }

  completeTransfer(id, hash) {
    return this.mod.database.updateTransfer(id, {
      hash: hash || '',
      status: 'sent',
      error: '',
      updatedAt: Date.now()
    });
  }

  failTransfer(id, error) {
    return this.mod.database.updateTransfer(id, {
      hash: '',
      status: 'failed',
      error: error || '',
      updatedAt: Date.now()
    });
  }

  getTransfer(id) {
    return this.mod.database.getTransfer(id);
  }

  findIncompleteTransfers(mixinUserId) {
    return this.mod.database.findTransfers({ mixinUserId, status: 'sending' });
  }
}

module.exports = Transfers;
