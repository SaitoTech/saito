module.exports = PotTemplate = (comp) => {
	let wide = comp.ticker === "CHIPS" || typeof comp.game_mod.game.stake === "object";
	return `
		<div class="pot">
	  	  <div class="potholder${wide ? "": " squeeze"}">
			<div class="line2"></div>
			<div class="line3"></div>
	 	  </div>
		</div>
		`;
};
