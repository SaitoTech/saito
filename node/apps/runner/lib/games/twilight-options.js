// The four presets exposed by Twilight's game wizard. Individual card
// additions/removals remain engine options, not separate named presets.
const DECKS = ['original', 'optional', 'late-war', 'saito'];
// Berlin Airlift never resolves; Tito–Stalin's source handles sovietcoup instead.
// Presence enables an expansion card in Twilight, even if its value is false/0.
const UNSUPPORTED_CARDS = ['berlinairlift', 'titostalin'];
function problem(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      (options.deck !== undefined && !DECKS.includes(options.deck))) {
    return 'Twilight deck must be ' + DECKS.join(', ');
  }
  const card = UNSUPPORTED_CARDS.find(key => Object.hasOwn(options, key));
  if (card) return `Twilight runner does not support unfinished card: ${card}`;
  return null;
}
function supported(options) { return problem(options) === null; }
function validate(options) {
  const error = problem(options);
  if (error) throw Error(error);
}
module.exports = { DECKS, supported, validate };
