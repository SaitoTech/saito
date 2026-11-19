const GameTemplate = require('../../../lib/templates/gametemplate');

function contextFor(game) {
  return GameTemplate.prototype.returnContext.call({ game, hud: null });
}

describe('GameTemplate.returnContext', () => {
  test('drops cryptographic bookkeeping and keeps the position', () => {
    const game = {
      id: 'game-a',
      game_id: 'game-a',
      module: 'Chess',
      player: 1,
      players: ['us', 'ussr'],
      sharekey: '918273',
      status: 'Your move',
      sroll: 4,
      sroll_hash: 'commitment',
      spick_card: 'asia',
      spick_hash: 'pick-commitment',
      score: 0,
      note: '',
      hand: [],
      deck: [
        {
          cards: { asia: { name: 'Asia Scoring', ops: 0 } },
          crypt: ['ciphertext-1'],
          keys: ['deck-key'],
          hand: ['asia'],
          xor: 'deck-xor',
          to_add: { europe: { name: 'Europe' } },
          to_remove: { canada: 1 },
          discards: { mideast: { name: 'Middle East', ops: 3 } },
          removed: { china: { name: 'The China Card' } }
        }
      ],
      pool: [{ cards: { shown: true }, crypt: ['pool-crypt'], keys: ['pool-key'], decrypted: 1 }],
      countries: { poland: { us: 0, ussr: 3, owner: 'us', events: [] } },
      state: { phase: 'headline', turn: 3 },
      roster: [
        { publicKey: 'player-key', signature: 'sig', role: 'us', seat: 1 },
        { name: 'Observer', role: 'watch' }
      ],
      inventory: { keys: ['red-key', 'blue-key'] }
    };
    const snapshot = JSON.stringify(game);
    const context = contextFor(game);
    const returned = JSON.stringify(context);

    expect(JSON.stringify(game)).toBe(snapshot);
    expect(JSON.parse(returned)).toEqual(context);
    expect(Buffer.byteLength(returned)).toBeLessThan(Buffer.byteLength(snapshot));

    expect(context.game.id).toBeUndefined();
    expect(context.game.game_id).toBeUndefined();
    expect(context.game.sharekey).toBeUndefined();
    expect(context.game.sroll_hash).toBeUndefined();
    expect(context.game.spick_hash).toBeUndefined();
    expect(context.game.deck[0].crypt).toBeUndefined();
    expect(context.game.deck[0].keys).toBeUndefined();
    expect(context.game.deck[0].xor).toBeUndefined();
    expect(context.game.deck[0].to_add).toBeUndefined();
    expect(context.game.deck[0].to_remove).toBeUndefined();
    expect(context.game.pool[0].crypt).toBeUndefined();
    expect(context.game.pool[0].keys).toBeUndefined();
    expect(context.game.roster[0].publicKey).toBeUndefined();
    expect(context.game.roster[0].signature).toBeUndefined();

    expect(context.game.module).toBe('Chess');
    expect(context.game.player).toBe(1);
    expect(context.game.players).toEqual(['us', 'ussr']);
    expect(context.game.sroll).toBe(4);
    expect(context.game.spick_card).toBe('asia');
    expect(context.game.score).toBe(0);
    expect(context.game.hand).toEqual([]);
    expect(context.game.deck[0].cards.asia).toEqual({ name: 'Asia Scoring', ops: 0 });
    expect(context.game.deck[0].hand).toEqual(['asia']);
    expect(context.game.deck[0].discards).toEqual({ mideast: { name: 'Middle East', ops: 3 } });
    expect(context.game.deck[0].removed).toEqual({ china: { name: 'The China Card' } });
    expect(context.game.pool[0].decrypted).toBe(1);
    expect(context.game.countries).toEqual(game.countries);
    expect(context.game.state).toEqual({ phase: 'headline', turn: 3 });
    expect(context.game.roster[0]).toEqual({ role: 'us', seat: 1 });
    expect(context.game.roster[1]).toEqual({ name: 'Observer', role: 'watch' });
    expect(context.game.inventory.keys).toEqual(['red-key', 'blue-key']);
    expect(context.game.note).toBeUndefined();
  });

  test('an empty game still returns a context object', () => {
    const context = contextFor({});
    expect(context.game).toEqual({});
    expect(Array.isArray(context.menu)).toBe(true);
    expect(JSON.parse(JSON.stringify(context))).toEqual(context);
  });
});
