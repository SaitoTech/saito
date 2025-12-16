module.exports = (obj) => {
	let html = `<div id='node-config'>`;

	html += `
			<div class="module-config-header">
				<div id="show-modules" class="arrow-toggle">&#x25B6;</div>
				<h3>Modules</h3>
				<button id='modconfig-button' disabled>Save Changes</button>
			</div>
			<div class="mod-config-table minimize">
	`;

	let lite_mods = obj.module_config.lite.join(' ');
	let core_mods = obj.module_config.core.join(' ');

	for (let m of obj.available_modules) {
		html += `
			<input type="checkbox" name="${m}" ${lite_mods.includes(m + '/' + m) || core_mods.includes(m + '/' + m) ? 'checked' : ''}/>
			<label for="${m}">${m}</label>
		`;
	}

	html += '</div>';

	html += '</div>';

	html += `<hr>
			 <div class="module-config-header"> 
			 	<div id="show-options" class="arrow-toggle">&#x25B6;</div>
			 	<h3>Options</h3>
			 	<button id="node-options-button" disabled>Save Changes</button>
			 </div>
			 <div id='node-options' class='node-options minimize'></div>
	`;

	return html;
};
