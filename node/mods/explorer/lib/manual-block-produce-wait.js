const { analyzeBundleReadiness, getHeartbeatMs, routingWorkNeeded } = require('./burn-fee-timing');
const { logManualProduction, logManualProductionError } = require('./manual-production-log');
const {
  fetchFreshTimestampPair,
  logClockMismatchDetected,
  logExplorerTimestampComparison
} = require('./timestamp-diagnostics');

const MANUAL_PRODUCTION_POLL_MS = 500;
const CLOCK_MISMATCH_ABORT_AFTER = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBurnFeeTimingReady(readiness) {
  const workNeeded = routingWorkNeeded(
    readiness.burnfeeNolan,
    readiness.now,
    readiness.previousBlockTs,
    readiness.heartbeatMs
  );

  const workAvailable = Number(readiness.workAvailableNolan);
  if (workAvailable < workNeeded) {
    return false;
  }

  const previous = Number(readiness.previousBlockTs);
  const now = Number(readiness.now);
  if (now < previous + Number(readiness.forkDelayMs || 0)) {
    return false;
  }

  return true;
}

function formatReadiness(readiness, timingReady, readyToProduce) {
  const workNeeded = routingWorkNeeded(
    readiness.burnfeeNolan,
    readiness.now,
    readiness.previousBlockTs,
    readiness.heartbeatMs
  );

  return (
    `burn-fee timing ready=${timingReady}, can bundle=${readyToProduce}, ` +
    `routing work available=${readiness.workAvailableNolan}, work needed=${workNeeded}, ` +
    `mempool tx count=${readiness.mempoolTxCount ?? (readiness.mempoolHasTx ? '>=1' : 0)}`
  );
}

/**
 * Wait until burn-fee timing allows production, call produceOnce(), and retry
 * until block height exceeds startBlockId or the deadline passes.
 */
async function waitForManualBlockProduction(app, startBlockId, produceOnce, options = {}) {
  const startId = Number(startBlockId) || 0;
  const heartbeatMs = options.heartbeatMs || getHeartbeatMs(app);
  const deadline = options.deadlineMs || Date.now() + Math.max(heartbeatMs * 4, 120_000);
  const startedAt = Date.now();
  let retryNumber = 0;
  let consecutiveClockMismatch = 0;

  logManualProduction(
    `waitForManualBlockProduction entered (startBlockId=${startId}, deadline in ${Math.max(heartbeatMs * 4, 120_000)}ms)`
  );

  try {
    while (Date.now() < deadline) {
      retryNumber += 1;
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const latestBlockId = Number(await app.blockchain.getLatestBlockId());
      const blockProduced = latestBlockId > startId;

      logManualProduction(
        `wait retry #${retryNumber}: elapsed=${elapsedSec}s, current=${latestBlockId}, ` +
          `start=${startId}, block produced=${blockProduced ? 'yes' : 'no'}`
      );

      if (blockProduced) {
        logManualProduction(`New block observed: ${latestBlockId}`);
        return true;
      }

      const freshTimestamps = await fetchFreshTimestampPair(app);
      const freshDiagnostic = logExplorerTimestampComparison(
        freshTimestamps.previousBlockTs,
        freshTimestamps.now,
        {
          source: 'waitForManualBlockProduction (fresh read)',
          retryNumber
        }
      );

      if (freshDiagnostic.misordered) {
        consecutiveClockMismatch += 1;
        logManualProduction(
          `Clock misorder detected (${consecutiveClockMismatch}/${CLOCK_MISMATCH_ABORT_AFTER} consecutive)`
        );
      } else {
        consecutiveClockMismatch = 0;
      }

      if (consecutiveClockMismatch >= CLOCK_MISMATCH_ABORT_AFTER) {
        logClockMismatchDetected(freshDiagnostic, {
          blockHeight: latestBlockId,
          heartbeatMs,
          consecutiveCount: consecutiveClockMismatch
        });
        return false;
      }

      const readiness = await analyzeBundleReadiness(app);
      const timingReady = isBurnFeeTimingReady(readiness);
      const readyToProduce = readiness.mempoolHasTx ? readiness.canBundleNow : timingReady;

      logManualProduction(
        `Waiting for new block (current=${latestBlockId}, start=${startId}); ${formatReadiness(readiness, timingReady, readyToProduce)}`
      );

      if (!readyToProduce) {
        logManualProduction(`Burn-fee not ready — sleeping ${MANUAL_PRODUCTION_POLL_MS / 1000}s`);
        await sleep(MANUAL_PRODUCTION_POLL_MS);
        continue;
      }

      let produced = false;
      try {
        produced = await produceOnce();
      } catch (err) {
        logManualProductionError('waitForManualBlockProduction.produceOnce', err);
        throw err;
      }

      const afterBlockId = Number(await app.blockchain.getLatestBlockId());
      const producedBlock = produced || afterBlockId > startId;

      logManualProduction(
        `wait retry #${retryNumber} after produceOnce: wallet returned=${produced}, ` +
          `current=${afterBlockId}, start=${startId}, block produced=${producedBlock ? 'yes' : 'no'}`
      );

      if (producedBlock) {
        logManualProduction(`New block observed: ${afterBlockId}`);
        return true;
      }

      logManualProduction(
        `Produce attempt returned false — retrying after ${MANUAL_PRODUCTION_POLL_MS}ms`
      );
      await sleep(MANUAL_PRODUCTION_POLL_MS);
    }

    logManualProduction(`waitForManualBlockProduction timed out (startBlockId=${startId})`);
    return false;
  } catch (err) {
    logManualProductionError('waitForManualBlockProduction', err);
    throw err;
  }
}

module.exports = {
  waitForManualBlockProduction
};
