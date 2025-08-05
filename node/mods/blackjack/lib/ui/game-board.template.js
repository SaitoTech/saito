module.exports = GameBoardTemplate = (game_mod) => {

	return `
<div class="gameboard ${game_mod.theme} ${game_mod?.felt}"></div>

<div class="status"></div>
	`;
};
