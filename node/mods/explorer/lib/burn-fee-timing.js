const { fromBase58 } = require('saito-js/lib/util');
const Saito = require('saito-js/saito').default;
const { logExplorerTimestampComparison } = require('./timestamp-diagnostics');

const BURNFEE_MULTIPLIER = 100_000_000;
const FORK_DELAY_MODULUS_MS = 5000;
const MIN_SLEEP_MS = 500;
const MAX_SLEEP_MS = 60_000;

function toBigInt(value) {
  try {
    if (value == null || value === '') {
      return 0n;
    }
    return BigInt(value);
  } catch (err) {
    return 0n;
  }
}

function getHeartbeatMs(app) {
  const heartbeat = Number(app?.options?.consensus?.heartbeat_interval);
  if (Number.isFinite(heartbeat) && heartbeat > 0) {
    return heartbeat;
  }
  return 30_000;
}

/**
 * Mirror BurnFee::return_routing_work_needed_to_produce_block_in_nolan (nolan units).
 */
function routingWorkNeeded(burnfeeNolan, currentTs, previousTs, heartbeatMs) {
  const previous = Number(previousTs);
  const current = Number(currentTs);

  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous >= current) {
    logExplorerTimestampComparison(previousTs, currentTs, {
      source: 'routingWorkNeeded (previous >= current)'
    });
    return Number.MAX_SAFE_INTEGER;
  }

  const elapsed = Math.max(current - previous, 1);
  if (elapsed >= 2 * heartbeatMs) {
    return 0;
  }

  const burnfee = Number(burnfeeNolan) / BURNFEE_MULTIPLIER;
  const workNeeded = burnfee / elapsed;
  return Math.round(workNeeded * BURNFEE_MULTIPLIER);
}

function computeRoutingWorkForNode(totalFeesNolan, path = [], nodePublicKey = '') {
  if (!path.length || !nodePublicKey || totalFeesNolan <= 0n) {
    return 0n;
  }

  const lastHop = path[path.length - 1];
  const lastTo = String(lastHop?.to || '');
  if (lastTo !== nodePublicKey) {
    return 0n;
  }

  let work = totalFeesNolan;
  for (let i = 1; i < path.length; i++) {
    work /= 2n;
  }
  return work;
}

async function getMempoolRoutingWork(app, nodePublicKey) {
  const txs = await Saito.getInstance().getMempoolTxs();
  let work = 0n;

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const fees = toBigInt(tx?.total_fees);
    const path = Array.isArray(tx?.routing_path) ? tx.routing_path : [];
    work += computeRoutingWorkForNode(fees, path, nodePublicKey);
  }

  return work;
}

/**
 * Mirror mempool can_bundle_block fork-delay check (pubkey + previous block hash).
 */
function computeForkDelayMs(app, publicKey, previousBlockHash) {
  if (!publicKey || !previousBlockHash) {
    return 0;
  }

  try {
    const pkHex = fromBase58(publicKey);
    const combined = Buffer.concat([
      Buffer.from(pkHex, 'hex'),
      Buffer.from(String(previousBlockHash), 'hex')
    ]);
    const hashHex = app.crypto.hash(combined);
    const hashBytes = Buffer.from(hashHex, 'hex');
    const start = Math.max(0, hashBytes.length - 16);
    let low128 = 0n;
    for (let i = start; i < hashBytes.length; i++) {
      low128 = (low128 << 8n) | BigInt(hashBytes[i]);
    }
    return Number(low128 % BigInt(FORK_DELAY_MODULUS_MS));
  } catch (err) {
    return 0;
  }
}

function clampSleepMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return MIN_SLEEP_MS;
  }
  return Math.max(MIN_SLEEP_MS, Math.min(MAX_SLEEP_MS, Math.ceil(ms)));
}

/**
 * Estimate milliseconds until burn-fee timing (and fork-delay) likely allow bundling.
 */
function estimateBundleWaitMs({
  now,
  previousBlockTs,
  burnfeeNolan,
  heartbeatMs,
  workAvailableNolan,
  forkDelayMs
}) {
  const previous = Number(previousBlockTs);
  const heartbeatReadyAt = previous + 2 * heartbeatMs;
  const forkReadyAt = previous + Number(forkDelayMs || 0);

  let workReadyAt = now;
  const workAvailable = Number(workAvailableNolan);
  const burnfee = Number(burnfeeNolan);

  if (workAvailable > 0 && burnfee > 0) {
    const neededElapsed = Math.ceil(burnfee / workAvailable);
    workReadyAt = previous + neededElapsed;
  } else if (workAvailable <= 0) {
    workReadyAt = heartbeatReadyAt;
  }

  const readyAt = Math.max(heartbeatReadyAt, forkReadyAt, workReadyAt);
  return clampSleepMs(readyAt - now);
}

function canBundleNow({
  now,
  previousBlockTs,
  burnfeeNolan,
  heartbeatMs,
  workAvailableNolan,
  forkDelayMs,
  mempoolHasTx
}) {
  if (!mempoolHasTx) {
    return false;
  }

  const workNeeded = routingWorkNeeded(burnfeeNolan, now, previousBlockTs, heartbeatMs);
  const workAvailable = Number(workAvailableNolan);
  if (workAvailable < workNeeded) {
    return false;
  }

  const previous = Number(previousBlockTs);
  if (now < previous + Number(forkDelayMs || 0)) {
    return false;
  }

  return true;
}

async function analyzeBundleReadiness(app) {
  const now = Date.now();
  const heartbeatMs = getHeartbeatMs(app);
  const publicKey = await app.wallet.getPublicKey();
  const blocks = await app.core.blockchain.getBlocks(1, false);
  const latest = Array.isArray(blocks) && blocks.length ? blocks[0] : null;

  if (!latest) {
    return {
      now,
      previousBlockTs: 0,
      burnfeeNolan: 0n,
      heartbeatMs,
      workAvailableNolan: 0n,
      forkDelayMs: 0,
      mempoolHasTx: false,
      mempoolTxCount: 0,
      canBundleNow: false,
      waitMs: heartbeatMs
    };
  }

  const previousBlockTs = Number(latest.timestamp);
  const burnfeeNolan = toBigInt(latest.burnFee);
  const forkDelayMs = computeForkDelayMs(app, publicKey, latest.hash);
  const mempoolTxs = await Saito.getInstance().getMempoolTxs();
  const mempoolHasTx = mempoolTxs.length > 0;
  const workAvailableNolan = await getMempoolRoutingWork(app, publicKey);

  const readiness = {
    now,
    previousBlockTs,
    burnfeeNolan,
    heartbeatMs,
    workAvailableNolan,
    forkDelayMs,
    mempoolHasTx
  };

  return {
    now,
    previousBlockTs,
    burnfeeNolan,
    heartbeatMs,
    workAvailableNolan,
    forkDelayMs,
    mempoolHasTx,
    mempoolTxCount: mempoolTxs.length,
    canBundleNow: canBundleNow({ ...readiness, mempoolHasTx }),
    waitMs: estimateBundleWaitMs(readiness)
  };
}

module.exports = {
  getHeartbeatMs,
  routingWorkNeeded,
  analyzeBundleReadiness,
  clampSleepMs
};
