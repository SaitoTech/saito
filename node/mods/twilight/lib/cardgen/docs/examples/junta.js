/**
 * Two-stage Junta example.
 *
 * Box 0 places 2 influence, then the eventing player queues NFT_EVENT so box 1
 * can offer a coup or realignments. Queue moves run last-added first, so the
 * NFT_EVENT is added before the placement and runs after it. The card text
 * must not contain a literal tab: card storage strips tabs, so instructions
 * are joined with String.fromCharCode(9).
 *
 * Card id: custom-junta-example-201
 */

const NFT_CARD_ID = 'custom-junta-example-201';

const stageOne = `const NFT_CARD_ID = "custom-junta-example-201";
const tab = String.fromCharCode(9);

let player = "";
switch (context.game.state.eventing_player) {
  case "us":
  case "ussr":
    player = context.game.state.eventing_player;
    break;
  default:
    return 1;
}

const board = context.game.countries;
const countries = Object.keys(board).filter((id) => {
  const region = board[id] && board[id].region;
  return region === "camerica" || region === "samerica";
});

return await api.asEventingPlayer(async () => {
  const country = await api.playerSelectCountry(countries);
  api.addMove(["NFT_EVENT", NFT_CARD_ID, "1", player].join(tab));
  await api.playerPlaceInfluence(country, 2, player);
  await api.endTurn();
});
`;

const stageTwo = `const tab = String.fromCharCode(9);
const sent = args && args[0];
const state = context.game.state;
const board = context.game.countries;

let player = "";
switch (state.eventing_player) {
  case "us":
    player = "us";
    break;
  case "ussr":
    player = "ussr";
    break;
  default:
    break;
}

if (sent === "us" || sent === "ussr") {
  player = sent;
}
if (player !== "us" && player !== "ussr") {
  return 1;
}

const enemy = player === "us" ? "ussr" : "us";
const limited = state.limit_region || [];
const regionBlocked = (region) => {
  if (Array.isArray(limited)) return limited.indexOf(region) !== -1;
  return String(limited).indexOf(region) !== -1;
};

const candidates = Object.keys(board).filter((id) => {
  const country = board[id];
  if (!country) return false;
  if (country.region !== "camerica" && country.region !== "samerica") return false;
  if (regionBlocked(country.region)) return false;
  return (Number(country[enemy]) || 0) > 0;
});

const coupTargets = candidates.slice();
const realignTargets = candidates.slice();

if (coupTargets.length === 0 && realignTargets.length === 0) {
  return 1;
}

return await api.asEventingPlayer(async () => {
  const menu = [];
  if (coupTargets.length > 0) menu.push({ id: "coup", label: "coup" });
  if (realignTargets.length > 0) menu.push({ id: "realign", label: "realign" });
  menu.push({ id: "skip", label: "skip" });

  const choice = await api.playerSelectOption(menu);

  if (choice === "coup") {
    const country = await api.playerSelectCountry(coupTargets);
    api.addMove(["coup", player, country, "2"].join(tab));
    await api.endTurn();
    return;
  }

  if (choice === "realign") {
    const tally = {};
    for (let i = 0; i < realignTargets.length; i++) {
      tally[realignTargets[i]] = Number(board[realignTargets[i]][enemy]) || 0;
    }
    for (let n = 0; n < 2; n++) {
      const options = realignTargets.filter((id) => tally[id] > 0);
      if (options.length === 0) break;
      const country = await api.playerSelectCountry(options);
      const result = await api.playerRealign(country, player);
      if (result && result.removedFaction === enemy) {
        tally[country] -= result.removed;
      }
    }
    await api.endTurn();
    return;
  }

  api.addMove(["NOTIFY", player.toUpperCase() + " skips the Junta operations"].join(tab));
  await api.endTurn();
});
`;

module.exports = {
  NFT_CARD_ID,
  stageOne,
  stageTwo
};
