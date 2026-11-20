const { returnContext } = require('../../../mods/gamebot/lib/games/twilight');

describe('Twilight context', () => {
  test('keeps the playable fields and drops inactive events', () => {
    const context = {
      menu: [{ id: 'redscare', identifier: 'div#redscare' }],
      game: {
        player: 1,
        queue: ['headline'],
        status: 'USSR pick your headline card',
        vp_needed: 20,
        id: 'game-a',
        countries: {
          france: { us: 0, ussr: 1, control: 3, bg: 1, neighbours: ['uk'], region: 'europe', top: 10, name: 'France' }
        },
        deck: [
          {
            cards: {
              redscare: { name: 'Red Scare', scoring: 0, player: 'ussr', recurring: 1, ops: 4, bg: 0, img: 'RedScare' }
            },
            hand: ['redscare'],
            discards: {},
            removed: {},
            crypt: ['secret']
          }
        ],
        state: {
          round: 1,
          defcon: 5,
          vp: 0,
          headline: 1,
          headline_card: '',
          events: {
            nato: 0,
            redscare_player1: 1,
            cancelled: { wargames: 0, cambridge: 1 }
          },
          dice: 'hidden'
        },
        log: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
      }
    };

    const result = returnContext(context);

    expect(result.menu).toEqual(context.menu);
    expect(result.game).toEqual({
      player: 1,
      queue: ['headline'],
      status: 'USSR pick your headline card',
      vp_needed: 20,
      countries: {
        france: { us: 0, ussr: 1, control: 3, bg: 1, neighbours: ['uk'], region: 'europe' }
      },
      deck: [
        {
          cards: {
            redscare: { name: 'Red Scare', scoring: 0, player: 'ussr', recurring: 1, ops: 4, bg: 0 }
          },
          hand: ['redscare'],
          discards: {},
          removed: {}
        }
      ],
      state: {
        round: 1,
        defcon: 5,
        vp: 0,
        headline: 1,
        headline_card: '',
        events: {
          redscare_player1: 1,
          cancelled: { cambridge: 1 }
        }
      },
      log: ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
    });
  });

  test('leaves a context without a game unchanged', () => {
    const context = { menu: [] };
    expect(returnContext(context)).toBe(context);
    expect(returnContext(null)).toBe(null);
  });
});
