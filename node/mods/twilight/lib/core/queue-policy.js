/**
 * Twilight extensions to the engine NFT queue policy.
 * Merged onto GameTemplate.returnNftQueuePolicy() in returnNftQueuePolicy().
 */

'use strict';

const FACTIONS = new Set(['us', 'ussr']);

function actingFaction(mod) {
  if (!mod.roles || !mod.game || !Number.isInteger(mod.game.player)) {
    throw new Error('place: unable to determine acting player faction');
  }
  const faction = mod.roles[mod.game.player];
  if (!FACTIONS.has(faction)) {
    throw new Error('place: acting player is not a placing faction');
  }
  return faction;
}

function parsePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${label}: expected a positive integer`);
  }
  return n;
}

function assertCountry(mod, country) {
  if (typeof country !== 'string' || !country || /[\t\n\r]/.test(country)) {
    throw new Error('place: invalid country key');
  }
  if (!mod.countries || !mod.countries[country]) {
    throw new Error(`place: unknown country: ${country}`);
  }
  return country;
}

module.exports = {
  /**
   * place\torigin\tfaction\tcountry\tamount
   * Origin is forced to the acting player's faction so the native place handler
   * skips a second apply on the originating client.
   */
  place: {
    validate(parts, mod) {
      if (parts.length !== 5) {
        throw new Error('place: expected place\\torigin\\tfaction\\tcountry\\tamount');
      }
      const faction = parts[2];
      const country = assertCountry(mod, parts[3]);
      const amount = parsePositiveInt(parts[4], 'place amount');
      if (!FACTIONS.has(faction)) {
        throw new Error('place: faction must be "us" or "ussr"');
      }
      const origin = actingFaction(mod);
      return `place\t${origin}\t${faction}\t${country}\t${amount}`;
    },
    applyLocal(parts, mod) {
      const faction = parts[2];
      const country = parts[3];
      const amount = parsePositiveInt(parts[4], 'place amount');
      mod.placeInfluence(country, amount, faction);
      if (typeof mod.showMinimapMarker === 'function') {
        mod.showMinimapMarker(country, faction);
      }
    }
  },

  /**
   * resolve\tcardId — Twilight lowercase resolve clears the matching event/ops entry.
   */
  resolve: {
    validate(parts) {
      if (parts.length !== 2) {
        throw new Error('resolve: expected resolve\\tcardId');
      }
      const cardId = parts[1];
      if (typeof cardId !== 'string' || !cardId) {
        throw new Error('resolve: missing card id');
      }
      if (/[\t\n\r]/.test(cardId)) {
        throw new Error('resolve: card id must not contain tab or newline');
      }
      return `resolve\t${cardId}`;
    }
  }
};
