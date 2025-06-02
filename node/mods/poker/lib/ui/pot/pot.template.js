module.exports = PotTemplate = (comp) => {
	return `
		<div class="pot">
	  	  <div class="potholder${typeof comp.game_mod.game.stake === "string" ? " squeeze": ""}">
			<div class="line2"></div>
			<div class="line3"></div>
	 	  </div>
		</div>
		`;
};
