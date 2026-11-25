const TEST_BACKUP_KEY = 'saito:twilight-cardgen:test-backup';
const TEST_COMPLETE = 'custom_card_test_complete';
const TEST_ACKNOWLEDGE = 'ACKNOWLEDGE\tCustom Card Code Completed';

function firstEventCode(card) {
  if (!card || typeof card.ensureCodeEvents !== 'function') {
    return '';
  }
  card.ensureCodeEvents();
  const event = Array.isArray(card.events) ? card.events[0] : null;
  return String(event?.code || '');
}

function testNftId(card) {
  const generated = typeof card?.generatedId === 'function' ? String(card.generatedId() || '') : '';
  const id = generated.replace(/[\t\n\r]/g, '').trim();
  return id || `cardgen-test-${Date.now()}`;
}

function buildTestNft(card, id) {
  const data = card.buildSnapshot(card.image_url || '');
  return {
    id: String(id),
    title: data.name || 'Optional Card',
    data
  };
}

/**
 * Push order for a stack queue. The last entry runs first.
 * NFT_EVENT, then the completion notice, then the restore marker.
 */
function testQueueInstructions(id) {
  return [TEST_COMPLETE, TEST_ACKNOWLEDGE, `NFT_EVENT\t${id}\t0`];
}

module.exports = {
  TEST_BACKUP_KEY,
  TEST_COMPLETE,
  TEST_ACKNOWLEDGE,
  firstEventCode,
  testNftId,
  buildTestNft,
  testQueueInstructions
};
