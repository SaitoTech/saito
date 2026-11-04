const Card = require('../../../mods/tscardgen/lib/card');
const {
  normalizeEvents,
  serializeCode,
  hasExecutableCode,
  addEvent,
  renameEvent,
  removeEvent,
  buildNftEventInstruction,
  resolveExecutableCode
} = require('../../../mods/tscardgen/lib/code-events');
const {
  resolveExecutableCode: twilightResolve,
  normalizeStoredCode
} = require('../../../mods/twilight/lib/nft/resolve-code');

describe('TSCardGen multi-event code model', () => {
  test('legacy string remains a string when serializing one event', () => {
    const card = new Card({}, {}, { title: 'Wargames', code: 'await api.endTurn();' });
    expect(card.events).toHaveLength(1);
    expect(card.events[0].id).toBe('wargames');
    expect(card.events[0].label).toBe('Wargames');
    expect(card.serializedCode()).toBe('await api.endTurn();');
    expect(typeof card.buildSnapshot().code).toBe('string');
  });

  test('multiple events serialize as named array and skip empty tabs', () => {
    const card = new Card({}, {}, { title: 'Wargames', code: 'api.addToQueue("NOTIFY\\tok");' });
    card.addCodeEvent();
    card.active_event_index = 1;
    card.setActiveCode('await api.endTurn();');
    card.addCodeEvent(); // empty third tab

    const serialized = card.serializedCode();
    expect(Array.isArray(serialized)).toBe(true);
    expect(serialized).toEqual([
      { name: 'wargames', code: 'api.addToQueue("NOTIFY\\tok");' },
      { name: 'wargames_2', code: 'await api.endTurn();' }
    ]);
    expect(hasExecutableCode(card.events)).toBe(true);
  });

  test('switching and renaming preserves code and unique ids', () => {
    let events = normalizeEvents({ title: 'Wargames', code: 'one();' });
    ({ events } = addEvent(events, 'Wargames'));
    events[1].code = 'two();';
    ({ events } = renameEvent(events, 1, 'Special Ops'));

    expect(events[0].code).toBe('one();');
    expect(events[1].code).toBe('two();');
    expect(events[1].label).toBe('Special Ops');
    expect(events[1].id).toBe('special_ops');
    expect(serializeCode(events)).toEqual([
      { name: 'wargames', code: 'one();' },
      { name: 'special_ops', code: 'two();' }
    ]);
  });

  test('changing card title does not rewrite existing event names', () => {
    const card = new Card({}, {}, { title: 'Wargames', code: 'one();' });
    card.addCodeEvent();
    card.events[1].code = 'two();';
    const before = card.events.map((event) => ({ id: event.id, label: event.label }));
    card.title = 'Bear Trap';
    expect(card.events.map((event) => ({ id: event.id, label: event.label }))).toEqual(before);
  });

  test('first code tab uses the current title when Code workspace initializes', () => {
    const card = new Card({}, {}, { title: 'Wargames' });
    expect(card.events).toEqual([]);
    card.title = 'Bear Trap';
    card.ensureCodeEvents();
    expect(card.events).toHaveLength(1);
    expect(card.events[0].label).toBe('Bear Trap');
    expect(card.events[0].id).toBe('bear_trap');
  });

  test('empty-only events serialize to empty string', () => {
    const card = new Card({}, {}, { title: 'Wargames' });
    card.ensureCodeEvents();
    card.addCodeEvent();
    expect(card.serializedCode()).toBe('');
    expect(card.hasExecutableCode()).toBe(false);
  });

  test('removing a panel preserves remaining ids and selects a sensible neighbor', () => {
    const card = new Card({}, {}, { title: 'Wargames', code: 'one();' });
    card.addCodeEvent();
    card.events[1].code = 'two();';
    card.addCodeEvent();
    card.events[2].code = 'three();';
    card.active_event_index = 1;

    const removed = card.removeCodeEvent(1);
    expect(removed.id).toBe('wargames_2');
    expect(card.events.map((event) => event.id)).toEqual(['wargames', 'wargames_3']);
    expect(card.events.map((event) => event.code)).toEqual(['one();', 'three();']);
    expect(card.active_event_index).toBe(1);
    expect(card.getActiveCode()).toBe('three();');
  });

  test('NFT_EVENT instruction uses application id placeholder and code index', () => {
    const card = new Card({}, {}, { title: 'Wargames', card_id: '105', code: 'one();' });
    card.addCodeEvent();
    const info = buildNftEventInstruction(card, 1);
    expect(info.card_slug).toBe('wargames');
    expect(info.card_number).toBe('105');
    expect(info.code_index).toBe(1);
    expect(info.panel_index).toBe(1);
    expect(info.instruction).toBe('NFT_EVENT\tCARD_ID\t1');
    expect(info.instruction.split('\t')).toHaveLength(3);
  });
});

describe('NFT code resolution compatibility', () => {
  test('legacy string still resolves for card play', () => {
    expect(resolveExecutableCode('await api.endTurn();')).toBe('await api.endTurn();');
    expect(twilightResolve('await api.endTurn();')).toBe('await api.endTurn();');
  });

  test('multi-event array resolves default and named selectors', () => {
    const code = [
      { name: 'wargames', code: 'one();' },
      { name: 'wargames_2', code: 'two();' }
    ];
    expect(twilightResolve(code)).toBe('one();');
    expect(twilightResolve(code, 'wargames_2')).toBe('two();');
    expect(twilightResolve(code, '1')).toBe('two();');
    expect(twilightResolve(code, 'missing')).toBeNull();
  });

  test('array of plain strings still resolves by index', () => {
    const code = ['first();', 'second();'];
    expect(twilightResolve(code)).toBe('first();');
    expect(twilightResolve(code, '1')).toBe('second();');
  });

  test('normalizeStoredCode preserves multi-event arrays and collapses singles', () => {
    expect(normalizeStoredCode('a();')).toBe('a();');
    expect(
      normalizeStoredCode([
        { name: 'one', code: 'a();' },
        { name: 'two', code: 'b();' }
      ])
    ).toEqual([
      { name: 'one', code: 'a();' },
      { name: 'two', code: 'b();' }
    ]);
    expect(normalizeStoredCode([{ name: 'one', code: 'a();' }])).toBe('a();');
    expect(normalizeStoredCode([{ name: 'one', code: '   ' }, { name: 'two', code: '' }])).toBe('');
  });
});
