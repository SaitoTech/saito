module.exports = (app, mod) => {
	let eo = app.options.registry?.override_names || false;

	return `
			<fieldset class="saito-grid">
			<legend class="settings-label">Anonymous Keys</legend>
			<input type="checkbox" id="registry_translate" ${eo ? 'checked' : ''}/> 
   			<label for="registry_translate">Convert non-registered keys into human readable format</label>
			</fieldset>
			`;
};
