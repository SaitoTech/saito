module.exports = (app, mod) => {
	let games_menu = '';
	let league = null;

	league = app.modules.returnFirstRespondTo('leagues-for-arcade');

	for (let i = 0; i < mod.mods.length; i++) {
		let game_mod = mod.mods[i];

		let lid = app.crypto.hash(game_mod.returnName());
		if (!league?.returnLeague(lid)) {
			lid = '';
		}

		if (game_mod.teaser == true) {
			games_menu += `
       <div id="${game_mod.name}" class="arcade-teaser arcade-teaser-install" data-id="${game_mod.name}" data-league="${lid}">
         <div class="arcade-teaser-image"><img src="${game_mod.img}" /></div>
         <div class="arcade-teaser-title"><span>${game_mod.returnName()}</span></div>
         <div class="arcade-teaser-footer"></div>
       </div>
			`;
		} else {
			games_menu += `
       <div id="${game_mod.name}" class="arcade-teaser" data-id="${game_mod.name}" data-league="${lid}">
         <div class="arcade-teaser-image"><img src="${game_mod.respondTo('arcade-games').image}" /></div>
         <div class="arcade-teaser-title"><span>${game_mod.returnName()}</span></div>
         <div class="arcade-teaser-footer"></div>
       </div>
			`;
		}
	}

	return games_menu;
};
