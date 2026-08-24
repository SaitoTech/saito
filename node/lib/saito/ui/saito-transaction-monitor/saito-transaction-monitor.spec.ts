/**
 * @jest-environment jsdom
 */
// @ts-nocheck

const SaitoTransactionMonitor = require('./saito-transaction-monitor');

function installOverlayStub(monitor) {
  const overlay: any = {
    clickBackdropToClose: false,
    show: jest.fn((html, onClose) => {
      overlay._onClose = onClose;
      overlay._lastHtml = html;
    }),
    close: jest.fn(() => {
      const cb = overlay._onClose;
      overlay._onClose = null;
      if (typeof cb === 'function') {
        cb();
      }
    })
  };
  monitor.overlay = overlay;
  return overlay;
}

function makeBlockchain(blocks = []) {
  const byId = new Map();
  const byHash = new Map();
  for (const blk of blocks) {
    byId.set(Number(blk.id), blk);
    byHash.set(String(blk.hash), blk);
  }

  let latestId = 0;
  for (const blk of blocks) {
    const id = Number(blk.id);
    if (id > latestId) {
      latestId = id;
    }
  }

  return {
    getLatestBlockId: jest.fn(async () => latestId),
    getLongestChainHashAtId: jest.fn(async (id) => {
      const blk = byId.get(Number(id));
      return blk ? blk.hash : '';
    }),
    getBlock: jest.fn(async (hash) => byHash.get(String(hash)) || null),
    loadBlockAsync: jest.fn(async (hash) => byHash.get(String(hash)) || null)
  };
}

function makeApp(blocks = []) {
  return {
    options: {
      consensus: { heartbeat_interval: 30000 },
      blockchain: { last_timestamp: 0 }
    },
    blockchain: makeBlockchain(blocks)
  };
}

let activeMonitor = null;

function makeMonitor(app, onConfirmation = async () => {}) {
  const mod = { onConfirmation };
  const monitor = new SaitoTransactionMonitor(app, mod);
  const overlay = installOverlayStub(monitor);
  activeMonitor = monitor;
  return { monitor, mod, overlay, originalOnConfirmation: onConfirmation };
}

async function renderAndReconcile(monitor, options) {
  const reconcile = jest.spyOn(monitor, 'reconcileIfAlreadyConfirmed');
  monitor.render(options);
  expect(reconcile).toHaveBeenCalled();
  await reconcile.mock.results[0].value;
  return reconcile;
}

describe('SaitoTransactionMonitor', () => {
  afterEach(() => {
    if (activeMonitor) {
      activeMonitor.stopCountdown();
      activeMonitor = null;
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('live conf=0 confirmation completes immediately without needing the secondary check', async () => {
    const watched = { signature: 'sig-live' };
    const confirmed = { signature: 'sig-live' };
    const blk = {
      id: 12,
      hash: 'hash-12',
      transactions: [{ signature: 'unrelated' }, confirmed]
    };
    const callback = jest.fn();
    const { monitor, overlay } = makeMonitor(makeApp([]));

    await renderAndReconcile(monitor, { tx: watched, callback });

    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);

    monitor.onConfirmation(blk, confirmed, 0);

    expect(monitor.tx).toBeNull();
    expect(monitor._completion_result).toEqual({
      status: 'confirmed',
      tx: confirmed,
      signature: 'sig-live',
      blockId: '12',
      txOrdinal: '1',
      blk
    });
    expect(overlay.show).toHaveBeenLastCalledWith(
      expect.stringContaining('Confirmed'),
      expect.any(Function)
    );
    expect(callback).not.toHaveBeenCalled();

    monitor.hide();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed', signature: 'sig-live' })
    );
  });

  test('missed conf=0 is recovered when render finds the tx in a recent longest-chain block', async () => {
    const watched = { signature: 'sig-missed' };
    const onChain = { signature: 'sig-missed', msg: { module: 'OtherModule' } };
    const blk = {
      id: 9,
      hash: 'hash-9',
      transactions: [onChain]
    };
    const callback = jest.fn();
    const { monitor } = makeMonitor(makeApp([blk]));

    monitor.onConfirmation(blk, onChain, 0);
    expect(monitor.tx).toBeNull();
    expect(callback).not.toHaveBeenCalled();

    await renderAndReconcile(monitor, { tx: watched, callback });

    expect(monitor.tx).toBeNull();
    expect(monitor._completion_result).toEqual({
      status: 'confirmed',
      tx: onChain,
      signature: 'sig-missed',
      blockId: '9',
      txOrdinal: '0',
      blk
    });
    expect(callback).not.toHaveBeenCalled();
  });

  test('a different transaction signature does not complete the monitor', async () => {
    const watched = { signature: 'sig-watched' };
    const blk = {
      id: 4,
      hash: 'hash-4',
      transactions: [{ signature: 'sig-other' }]
    };
    const callback = jest.fn();
    const { monitor } = makeMonitor(makeApp([blk]));

    await renderAndReconcile(monitor, { tx: watched, callback });

    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);
    expect(monitor._completion_result).toBeNull();

    monitor.onConfirmation(blk, { signature: 'sig-other' }, 0);

    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);
  });

  test('cancellation while a lookup is pending fires cancelled and ignores the later result', async () => {
    const watched = { signature: 'sig-cancel' };
    const onChain = { signature: 'sig-cancel' };
    const blk = { id: 3, hash: 'hash-3', transactions: [onChain] };
    let release;
    const app = makeApp([blk]);
    app.blockchain.getLatestBlockId = jest.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(3);
        })
    );

    const callback = jest.fn();
    const { monitor } = makeMonitor(app);
    const reconcile = jest.spyOn(monitor, 'reconcileIfAlreadyConfirmed');

    monitor.render({ tx: watched, callback });
    const pending = reconcile.mock.results[0].value;

    monitor.hide();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(monitor.tx).toBeNull();

    release();
    await pending;

    expect(callback).toHaveBeenCalledTimes(1);
    expect(monitor.tx).toBeNull();
    expect(monitor._completion_result).toBeNull();
  });

  test('auto_continue_on_confirm fires the confirmed callback immediately', async () => {
    const watched = { signature: 'sig-auto' };
    const onChain = { signature: 'sig-auto' };
    const blk = { id: 7, hash: 'hash-7', transactions: [onChain] };
    const callback = jest.fn();
    const { monitor, overlay } = makeMonitor(makeApp([blk]));

    await renderAndReconcile(monitor, {
      tx: watched,
      callback,
      auto_continue_on_confirm: true
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'confirmed',
        signature: 'sig-auto',
        blockId: '7',
        txOrdinal: '0',
        tx: onChain,
        blk
      })
    );
    expect(overlay.close).toHaveBeenCalled();
    expect(monitor.tx).toBeNull();
    expect(monitor._completion_result).toBeNull();
  });

  test('SPV / empty-signature blocks do not produce false positives', async () => {
    const watched = { signature: 'sig-spv' };
    const spv = {
      id: 11,
      hash: 'hash-11',
      transactions: [{}, { amount: 1 }, { signature: '' }]
    };
    const callback = jest.fn();
    const { monitor } = makeMonitor(makeApp([spv]));

    await renderAndReconcile(monitor, { tx: watched, callback });

    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);
    expect(monitor._completion_result).toBeNull();
  });

  test('cross-module tx already in a recent block completes without an affixed callback', async () => {
    const watched = { signature: 'sig-cross' };
    const onChain = {
      signature: 'sig-cross',
      msg: { module: 'CreateNFT' }
    };
    const blk = { id: 15, hash: 'hash-15', transactions: [onChain] };
    const callback = jest.fn();
    const originalOnConfirmation = jest.fn(async () => {});
    const { monitor } = makeMonitor(makeApp([blk]), originalOnConfirmation);

    await renderAndReconcile(monitor, { tx: watched, callback });

    expect(originalOnConfirmation).not.toHaveBeenCalled();
    expect(monitor._completion_result).toEqual(
      expect.objectContaining({
        status: 'confirmed',
        signature: 'sig-cross',
        tx: onChain,
        blk
      })
    );
  });

  test('a genuinely unconfirmed transaction remains pending and the countdown does not dismiss it', async () => {
    jest.useFakeTimers();
    const watched = { signature: 'sig-pending' };
    const callback = jest.fn();
    const { monitor, overlay } = makeMonitor(makeApp([]));
    const reconcile = jest.spyOn(monitor, 'reconcileIfAlreadyConfirmed');

    monitor.render({ tx: watched, callback });
    await reconcile.mock.results[0].value;

    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);
    expect(overlay.show.mock.calls[0][0]).toContain('Waiting for Confirmation');

    reconcile.mockClear();
    jest.advanceTimersByTime(3000);
    expect(reconcile).toHaveBeenCalled();
    await reconcile.mock.results[0].value;

    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);
    expect(monitor._countdown_timer).not.toBeNull();

    jest.advanceTimersByTime(120000);
    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);

    monitor.stopCountdown();
  });

  test('periodic recent-block check completes if the tx appears after render', async () => {
    jest.useFakeTimers();
    const watched = { signature: 'sig-later' };
    const onChain = { signature: 'sig-later' };
    const blk = { id: 21, hash: 'hash-21', transactions: [onChain] };
    const callback = jest.fn();
    const app = makeApp([]);
    const { monitor } = makeMonitor(app);
    const reconcile = jest.spyOn(monitor, 'reconcileIfAlreadyConfirmed');

    monitor.render({ tx: watched, callback });
    await reconcile.mock.results[0].value;
    expect(monitor.tx).toBe(watched);

    app.blockchain = makeBlockchain([blk]);
    reconcile.mockClear();
    jest.advanceTimersByTime(3000);
    expect(reconcile).toHaveBeenCalled();
    await reconcile.mock.results[0].value;

    expect(monitor.tx).toBeNull();
    expect(monitor._completion_result).toEqual(
      expect.objectContaining({
        status: 'confirmed',
        signature: 'sig-later',
        blk
      })
    );
  });

  test('conf !== 0 does not complete the live path', async () => {
    const watched = { signature: 'sig-conf' };
    const confirmed = { signature: 'sig-conf' };
    const blk = { id: 2, hash: 'hash-2', transactions: [confirmed] };
    const callback = jest.fn();
    const { monitor } = makeMonitor(makeApp([]));

    await renderAndReconcile(monitor, { tx: watched, callback });
    monitor.onConfirmation(blk, confirmed, 1);

    expect(callback).not.toHaveBeenCalled();
    expect(monitor.tx).toBe(watched);
  });
});
