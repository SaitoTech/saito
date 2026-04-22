module.exports = (app, mod, options) => {

	let html;

	if (options.type === "videocall") {
		html = `
    <div id="screenrecord-wizard" class="screenrecord-wizard">
      <h5 class="screenrecord-wizard-title">What do you want to record?</h5>
  `;

		html += `
		<div class="record-mode">
		<div class="record-mode-option" id="mode-audio"><i  class=" fa-solid fa-microphone-lines"></i> </div>
		<div class="record-mode-option" id="mode-video" >  <i  class="fa-solid fa-tv "></i> </div>
		</div>
	  `;

		html += `
	</div>
	`;
	}
	else if (options.type === "game") {
		html = `
<div id="screenrecord-wizard" class="screenrecord-wizard">
  <h5 class="screenrecord-wizard-title">What do you want to record?</h5>
`;

   let video = document.querySelector('.video-box-container-large');

		html += `
	<div class="record-mode">
	${!video ? '<div class="record-mode-option" id="mode-audio"><i  class=" fa-solid fa-tv"></i> <label>Screen only</label></div>': ""}
	<div class="record-mode-option" id="mode-video" >  <i  class="fa-solid fa-camera "></i><label>Screen + camera</label> </div>
	</div>
  `;

		html += `
</div>
`;
	}
	else {
		throw Error("No external media type selected")
	}



	return html;
}
