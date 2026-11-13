const Relay = require('../../../mods/relay/relay');

function makeRelay() {
  return new Relay({
    connection: {
      on() {}
    }
  });
}

describe('relay repeated payloads', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('relays the same payload twice inside 150ms and drops the third', () => {
    const relay = makeRelay();
    const now = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    expect(relay.shouldDropRepeatedRelay('from', 'to', 'buysaito available currencies', null)).toBe(
      false
    );
    expect(relay.shouldDropRepeatedRelay('from', 'to', 'buysaito available currencies', null)).toBe(
      false
    );
    expect(relay.shouldDropRepeatedRelay('from', 'to', 'buysaito available currencies', null)).toBe(
      true
    );
  });

  test('allows the same payload again once the 150ms window has passed', () => {
    const relay = makeRelay();
    const now = 1_000_000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    relay.shouldDropRepeatedRelay('from', 'to', 'buysaito available currencies', null);
    relay.shouldDropRepeatedRelay('from', 'to', 'buysaito available currencies', null);

    clock.mockReturnValue(now + 150);

    expect(relay.shouldDropRepeatedRelay('from', 'to', 'buysaito available currencies', null)).toBe(
      false
    );
  });

  test('does not treat a different sender or payload as a repeat', () => {
    const relay = makeRelay();
    relay.shouldDropRepeatedRelay('from-a', 'to', 'buysaito available currencies', null);
    relay.shouldDropRepeatedRelay('from-a', 'to', 'buysaito available currencies', null);

    expect(relay.shouldDropRepeatedRelay('from-b', 'to', 'buysaito available currencies', null)).toBe(
      false
    );
    expect(
      relay.shouldDropRepeatedRelay('from-a', 'to', 'buysaito available currencies', { ac: [] })
    ).toBe(false);
  });
});
