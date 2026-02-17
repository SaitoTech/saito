module.exports = (app, mod) => {
	let html = `<div class="saito-module-settings">`;

	html += `
			<fieldset class='league-settings'>
				<legend class="settings-label">League Game Results</legend>
				<div class="explanation">Adjust how much you care about leaderboard updates to show all, none or only the most recent results of specific games</div>
				<div class="saitox-table">
					<div class="saitox-header-item">League</div>
					<div class="saitox-header-item clickable-element select-all" id="all-header" data-selection="all">All</div>
					<div class="saitox-header-item clickable-element select-all" id="some-header" data-selection="some">Last</div>
					<div class="saitox-header-item clickable-element select-all" id="none-header" data-selection="none">None</div>`;

	for (let l of mod.leagues) {
		if (mod.watch_list[l.id]) {
			html += `<div class="left-align">${l.name}</div>
					 <div><input type="radio" id="${l.name}-all" name="${l.name}" value="all" ${mod.watch_list[l.id] == 'all' ? 'checked' : ''}/></div>
					 <div><input type="radio" id="${l.name}-some" name="${l.name}" value="some" ${mod.watch_list[l.id] == 'some' ? 'checked' : ''}/></div>
					 <div><input type="radio" id="${l.name}-none" name="${l.name}" value="none" ${mod.watch_list[l.id] == 'none' ? 'checked' : ''}/></div>
					 `;
		}
	}

	html += `</div>
			</fieldset>

			`;

	return html;
};
