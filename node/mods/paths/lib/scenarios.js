const scenarios = {};

scenarios.original = {
  id: "original",
  label: "original",
  handSize: 7,
  optionalCards: false,
  gunsOfAugust: true,
  startTurn: 1,
  apply: function(mod) { mod.setup1914(); }
};

scenarios.optional = {
  id: "optional",
  label: "optional",
  handSize: 8,
  optionalCards: true,
  gunsOfAugust: true,
  startTurn: 1,
  apply: function(mod) { mod.setup1914(); }
};

scenarios["1917"] = {
  id: "1917",
  label: "1917 variant",
  handSize: 7,
  optionalCards: false,
  gunsOfAugust: false,
  startTurn: 14,
  played: {
    central: ["cp01","cp02","cp05","cp06","cp07","cp08","cp09","cp10","cp11","cp12","cp13","cp14","cp15","cp17","cp19","cp20","cp21","cp22","cp23","cp24","cp25","cp26","cp27","cp28","cp29","cp32","cp33","cp34","cp35","cp36","cp37","cp38","cp39","cp47","cp52","cp54"],
    allies: ["ap01","ap02","ap03","ap04","ap06","ap08","ap09","ap10","ap11","ap13","ap14","ap15","ap16","ap17","ap20","ap21","ap22","ap23","ap24","ap25","ap26","ap27","ap28","ap29","ap30","ap31","ap32","ap33","ap34","ap42","ap46","ap54"]
  },
  apply: apply1917
};

function list() {
  return [scenarios.original, scenarios.optional, scenarios["1917"]];
}

function get(id) {
  if (id && scenarios[id]) { return scenarios[id]; }
  return scenarios.original;
}

function bury(mod, deckidx) {
  let scenario = mod.returnScenario();
  if (!scenario.played) { return; }
  let faction = (deckidx === 1) ? "central" : "allies";
  let played = scenario.played[faction] || [];
  let deck = mod.game.deck[deckidx - 1];
  let library = mod.returnDeck(faction);
  for (let i = 0; i < played.length; i++) {
    let card = played[i];
    deck.crypt = deck.crypt.filter((c) => mod.app.crypto.hexToString(c) !== card);
    if (!deck.cards[card]) { continue; }
    if (library[card] && library[card].removeFromDeckAfterPlay(mod, faction)) {
      deck.removed[card] = deck.cards[card];
    } else {
      deck.discards[card] = deck.cards[card];
    }
  }
}

function place(mod, units) {
  for (let i = 0; i < units.length; i++) {
    let full = units[i].length < 3 || units[i][2] !== false;
    mod.addUnitToSpace(units[i][0], units[i][1], full);
  }
}

function trenches(mod, list) {
  for (let i = 0; i < list.length; i++) {
    mod.addTrench(list[i][0], list[i][1]);
  }
}

function control(mod, power, keys) {
  for (let i = 0; i < keys.length; i++) {
    mod.game.spaces[keys[i]].control = power;
  }
}

function destroyForts(mod, keys) {
  for (let i = 0; i < keys.length; i++) {
    mod.game.spaces[keys[i]].fort = -1;
  }
}

function apply1917(mod) {
  let state = mod.game.state;

  state.turn = 13;
  state.general_records_track.vp = 14;
  state.general_records_track.central_war_status = 17;
  state.general_records_track.allies_war_status = 17;
  state.general_records_track.combined_war_status = 34;
  state.central_limited_war_cards_added = true;
  state.allies_limited_war_cards_added = true;
  state.central_total_war_cards_added = true;
  state.allies_total_war_cards_added = true;

  state.us_commitment_track = 3;
  state.russian_capitulation_track = 5;
  state.general_records_track.current_cp_russian_vp = 3;
  state.events.fall_of_the_tsar_russian_vp = 3;

  state.events.blockade = 1;
  state.events.walter_rathenau = 1;
  state.events.uboats_unleashed = 1;
  state.events.great_retreat = 1;
  state.events.landships = 1;
  state.events.tsar_takes_command = 1;
  state.events.fall_of_the_tsar = 1;
  state.events.zimmerman_telegram = 1;
  state.events.rape_of_belgium = 1;
  state.events.reichstag_truce = 1;
  state.events.lusitania = 1;
  state.events.french_mutiny = 1;
  state.events.war_in_africa_vp = 1;
  state.events.libyan_revolt = 1;
  state.events.italy = 1;
  state.events.romania = 1;
  state.events.bulgaria = 1;
  state.events.turkey = 1;
  state.events.persia = 1;
  state.events.egypt = 1;
  state.events.kuwait = 1;
  state.events.salonika = 1;

  mod.convertCountryToPower("italy", "allies");
  mod.convertCountryToPower("romania", "allies");
  mod.convertCountryToPower("bulgaria", "central");
  mod.convertCountryToPower("turkey", "central");
  mod.convertCountryToPower("persia", "allies");
  mod.convertCountryToPower("egypt", "allies");
  mod.convertCountryToPower("kuwait", "allies");

  control(mod, "central", [
    "pinsk", "kovel", "lublin", "lemberg", "stanislau", "munkacs", "ploesti", "galatz",
    "targujiu", "cartedearges", "caracal", "bucharest", "tirana", "skopje", "belgrade",
    "cetinje", "valjevo", "nis", "strumitsa", "philippoli", "ostend", "cambrai", "sedan",
    "metz", "strasbourg", "mulhouse", "brussels", "antwerp", "liege", "libau", "szawli",
    "vilna", "grodno", "przemysl", "konigsberg", "warsaw", "lodz", "plock", "bialystok",
    "czestochowa", "lomza", "kovno", "ivangorod", "brestlitovsk", "constantinople",
    "giresun", "sivas", "kharput", "diyarbakir", "aleppo", "mosul", "gaza", "beersheba",
    "medina"
  ]);

  control(mod, "allies", [
    "kut", "qurna", "samawah", "annasiriya", "kermanshah", "libya", "tarnopol",
    "czernowitz", "barlad", "ismail", "monastir", "salonika", "kavala", "valona",
    "florina", "larisa", "athens"
  ]);

  destroyForts(mod, [
    "antwerp", "liege", "belgrade", "grodno", "przemysl", "warsaw", "lomza", "kovno",
    "ivangorod", "brestlitovsk", "lutsk", "trebizond", "erzerum"
  ]);

  trenches(mod, [
    ["pinsk", 1], ["kovel", 1], ["cracow", 1], ["strumitsa", 1], ["trent", 1],
    ["villach", 1], ["trieste", 1], ["ostend", 2], ["cambrai", 2], ["sedan", 2],
    ["metz", 2], ["strasbourg", 2], ["mulhouse", 2], ["szawli", 1], ["vilna", 2],
    ["grodno", 1], ["konigsberg", 1], ["giresun", 1], ["gaza", 1], ["calais", 1],
    ["amiens", 1], ["portsaid", 1], ["cairo", 1], ["basra", 1], ["paris", 1],
    ["chateauthierry", 1], ["verdun", 2], ["nancy", 2], ["belfort", 1], ["verona", 1],
    ["asiago", 1], ["maggiore", 1], ["udine", 1], ["venice", 1], ["riga", 1], ["odessa", 1]
  ]);

  place(mod, [
    ["ah_corps", "ceubox"], ["ah_corps", "ceubox"],
    ["ah_corps", "crbox"], ["ah_corps", "crbox"],
    ["ah_corps", "pinsk"],
    ["ah_army02", "kovel"],
    ["ah_corps", "lublin"], ["ah_corps", "lublin"],
    ["ah_army03", "lemberg"],
    ["ah_corps", "stanislau"], ["ah_corps", "stanislau"],
    ["ah_army07", "munkacs", false],
    ["ah_army01", "ploesti"],
    ["ah_corps", "galatz", false],
    ["ah_corps", "tirana"],
    ["ah_army06", "skopje"],
    ["ah_army11", "trent"],
    ["ah_army10", "villach"],
    ["ah_army05", "trieste"],

    ["bu_corps", "strumitsa"], ["bu_corps", "strumitsa"], ["bu_corps", "strumitsa", false],
    ["bu_corps", "philippoli"], ["bu_corps", "philippoli", false],
    ["bu_corps", "galatz"],

    ["ge_corps", "ceubox"],
    ["ge_corps", "crbox"], ["ge_corps", "crbox"], ["ge_corps", "crbox"], ["ge_corps", "crbox"],
    ["ge_army04", "ostend"], ["ge_corps", "ostend"], ["ge_corps", "ostend"],
    ["ge_army02", "cambrai"], ["ge_army06", "cambrai"], ["ge_army07", "cambrai"],
    ["ge_army01", "sedan"], ["ge_army03", "sedan"], ["ge_corps", "sedan"],
    ["ge_army05", "metz"], ["ge_corps", "metz"], ["ge_corps", "metz"],
    ["ge_corps", "strasbourg"], ["ge_corps", "strasbourg"], ["ge_corps", "strasbourg"],
    ["ge_corps", "mulhouse"], ["ge_corps", "mulhouse"],
    ["ge_army08", "szawli"],
    ["ge_army10", "vilna"], ["ge_corps", "vilna"],
    ["ge_army12", "grodno"],
    ["ge_army09", "przemysl"],
    ["ge_corps", "stanislau"],
    ["ge_corps", "ploesti"],
    ["ge_army11", "galatz", false],
    ["ge_corps", "skopje"],

    ["tu_corps", "ceubox"], ["tu_corps", "ceubox"],
    ["tu_corps", "constantinople"],
    ["tu_corps", "giresun", false],
    ["tu_corps", "sivas"],
    ["tu_corps", "kharput"],
    ["tu_corps", "diyarbakir"],
    ["tu_corps", "aleppo"],
    ["tu_corps", "mosul"],
    ["tu_corps", "gaza"], ["tu_corps", "gaza"],
    ["tu_corps", "beersheba"],
    ["tu_corps", "medina"],

    ["be_corps", "arbox"],
    ["be_army", "calais", false],

    ["br_army04", "aeubox"],
    ["br_corps", "arbox"], ["br_corps", "arbox"], ["br_corps", "arbox"],
    ["aus_corps", "arbox"], ["cnd_corps", "arbox"], ["pt_corps", "arbox"],
    ["br_army01", "calais"], ["br_army05", "calais"],
    ["br_army02", "amiens"], ["br_army03", "amiens"],
    ["br_corps", "kavala"], ["br_corps", "kavala"],
    ["br_corps", "baghdad"],
    ["br_corps", "sinai"], ["br_corps", "sinai"],
    ["br_corps", "basra"],

    ["fr_army09", "aeubox"], ["fr_army10", "aeubox"], ["fr_corps", "aeubox"],
    ["fr_corps", "arbox"], ["fr_corps", "arbox"], ["fr_corps", "arbox"], ["fr_corps", "arbox"],
    ["fr_army01", "paris", false],
    ["fr_army05", "chateauthierry"], ["fr_army06", "chateauthierry"], ["fr_corps", "chateauthierry", false],
    ["fr_army03", "verdun"], ["fr_army04", "verdun"], ["fr_corps", "verdun"],
    ["fr_corps", "nancy"], ["fr_army02", "nancy"],
    ["fr_army07", "belfort", false],
    ["fr_corps", "monastir"],
    ["fr_corps", "salonika"],

    ["it_corps", "arbox"], ["it_corps", "arbox"], ["it_corps", "arbox"],
    ["it_army01", "verona"], ["it_corps", "verona"],
    ["it_army04", "asiago"], ["it_army05", "asiago"],
    ["it_army02", "maggiore"],
    ["it_army03", "udine"], ["it_corps", "udine"], ["it_corps", "udine"],
    ["it_corps", "valona"],

    ["mn_corps", "aeubox"],

    ["ro_corps", "aeubox"], ["ro_corps", "aeubox"], ["ro_corps", "aeubox"], ["ro_corps", "aeubox"],
    ["ro_corps", "barlad", false],
    ["ro_corps", "ismail", false],

    ["ru_corps", "aeubox"], ["ru_corps", "aeubox"], ["ru_corps", "aeubox"], ["ru_corps", "aeubox"],
    ["ru_corps", "aeubox"], ["ru_corps", "aeubox"], ["ru_corps", "aeubox"], ["ru_corps", "aeubox"],
    ["ru_corps", "aeubox"],
    ["ru_corps", "arbox"], ["ru_corps", "arbox"],
    ["ru_army12", "riga"],
    ["ru_army01", "dvinsk"], ["ru_army05", "dvinsk"],
    ["ru_army02", "moldechno"], ["ru_army10", "moldechno"],
    ["ru_army04", "baranovichi"],
    ["ru_army03", "sarny", false],
    ["ru_army08", "lutsk"],
    ["ru_army11", "tarnopol"], ["ru_corps", "tarnopol"],
    ["ru_army07", "czernowitz"],
    ["ru_army09", "barlad", false], ["ru_corps", "barlad"],
    ["ru_army06", "ismail", false],
    ["ru_corps", "odessa"],
    ["ru_corps", "trebizond"],
    ["ru_corps", "erzerum"],
    ["ru_corps", "erzingan"],
    ["ru_corps", "van"],

    ["sb_corps", "arbox"], ["sb_corps", "arbox"],
    ["sb_army01", "monastir", false],
    ["sb_army02", "salonika", false],

    ["gr_corps", "florina"],
    ["gr_corps", "larisa"],
    ["gr_corps", "athens"]
  ]);

  let boxes = { arbox: 1, crbox: 1, aeubox: 1, ceubox: 1 };
  for (let key in mod.game.spaces) {
    if (boxes[key]) { continue; }
    let space = mod.game.spaces[key];
    if (space.country === "greece") { continue; }
    if (space.units && space.units.length > 0) {
      space.control = mod.returnPowerOfUnit(space.units[0]);
    }
  }
}

module.exports = { list, get, bury };
