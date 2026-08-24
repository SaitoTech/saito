const { COMPLETED_RETENTION_MS } = require('./constants');

function compareConfirmed(a, b) {
  const block = Number(a.block_id || 0) - Number(b.block_id || 0);
  if (block) return block;
  const ordinal = Number(a.tx_ordinal || 0) - Number(b.tx_ordinal || 0);
  if (ordinal) return ordinal;
  return String(a.tx_sig || '').localeCompare(String(b.tx_sig || ''));
}

function shouldApplyEvent(current, incoming) {
  if (!current?.latest_metadata_tx_sig) return true;
  if (current.latest_metadata_tx_sig === incoming.tx_sig) return false;

  const currentConfirmed = Number(current.latest_metadata_block_id || 0) > 0;
  const incomingConfirmed = Number(incoming.block_id || 0) > 0;
  if (!incomingConfirmed && incoming.previous_metadata_tx_sig) {
    return incoming.previous_metadata_tx_sig === current.latest_metadata_tx_sig;
  }
  if (currentConfirmed && !incomingConfirmed) return false;
  if (!currentConfirmed && incomingConfirmed) return true;

  if (incomingConfirmed) {
    return (
      compareConfirmed(incoming, {
        block_id: current.latest_metadata_block_id,
        tx_ordinal: current.latest_metadata_tx_ordinal,
        tx_sig: current.latest_metadata_tx_sig
      }) > 0
    );
  }

  const timestampDelta =
    Number(incoming.tx_timestamp || 0) - Number(current.latest_metadata_timestamp || 0);
  if (timestampDelta) return timestampDelta > 0;
  return String(incoming.tx_sig).localeCompare(String(current.latest_metadata_tx_sig)) > 0;
}

function isPrunableCompletedBug(bug, now = Date.now()) {
  return (
    bug?.status === 'completed' &&
    Number(bug.completed_at || 0) > 0 &&
    Number(bug.completed_at) <= now - COMPLETED_RETENTION_MS
  );
}

function midpointWeight(previous, next, fallback = 100) {
  if (previous == null && next == null) return fallback;
  if (previous == null) return Number(next) - 100;
  if (next == null) return Number(previous) + 100;
  const midpoint = Math.trunc((Number(previous) + Number(next)) / 2);
  return midpoint > Number(previous) && midpoint < Number(next) ? midpoint : null;
}

module.exports = { compareConfirmed, isPrunableCompletedBug, midpointWeight, shouldApplyEvent };
