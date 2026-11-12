const Card = require('../../../mods/tscardgen/lib/card');
const {
  TEST_COMPLETE,
  TEST_ACKNOWLEDGE,
  firstEventCode,
  testNftId,
  buildTestNft,
  testQueueInstructions,
  pushLocalInstruction,
  insertEndInstruction
} = require('../../../mods/twilight/lib/cardgen/test-run');

describe('Twilight cardgen test run', () => {
  test('reads only the first event script', () => {
    const card = new Card({}, {}, { title: 'Probe', code: 'first();' });
    card.addCodeEvent();
    card.active_event_index = 1;
    card.setActiveCode('second();');

    expect(firstEventCode(card)).toBe('first();');
    expect(firstEventCode({ ensureCodeEvents() {}, events: [] })).toBe('');
  });

  test('registers a test under the card id shown in the studio', () => {
    const card = new Card({}, {}, { title: 'Wargames', card_id: '100', code: 'first();' });
    expect(testNftId(card)).toBe('wargames-100');
  });

  test('builds an options.nfts record and stack-ordered queue instructions', () => {
    const card = new Card({}, {}, { title: 'Probe', code: 'api.addToQueue("vp\\tus\\t1");' });
    const nft = buildTestNft(card, 'cardgen-test-1');

    expect(nft.id).toBe('cardgen-test-1');
    expect(nft.data.name).toBe('Probe');
    expect(nft.data.code).toBe('api.addToQueue("vp\\tus\\t1");');
    expect(testQueueInstructions(nft.id)).toEqual([
      TEST_COMPLETE,
      TEST_ACKNOWLEDGE,
      'NFT_EVENT\tcardgen-test-1\t0'
    ]);
  });

  test('places immediate instructions above end instructions and the restore marker', () => {
    const queue = [TEST_COMPLETE, TEST_ACKNOWLEDGE];
    insertEndInstruction(queue, 'vp\tus\t1');
    pushLocalInstruction(queue, 'place\tus\tus\tfrance\t1');

    expect(queue).toEqual([
      TEST_COMPLETE,
      TEST_ACKNOWLEDGE,
      'vp\tus\t1',
      'place\tus\tus\tfrance\t1'
    ]);
  });
});
