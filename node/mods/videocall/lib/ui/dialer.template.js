module.exports = (app, mod, is_dialing = true) => {
  let html = `
      <div class="stun-minimal-appspace">
      	<h2>Saito Talk</h2>
      	<div class="subtitle">direct peer-to-peer chat</div>
      	<div class="stunx-splash-image"></div>
      	<div class="contact"></div>`;

  if (is_dialing) {
    html += `<div class="video_switch">
	      	<label class="switch_label" for="video_call_switch">Enable Video</label>
			<label class="switch">
			  <input type="checkbox" id="video_call_switch">
			  <span class="slider"></span>
			</label>
		</div>
		<div class="saito-button-primary" id="startcall">Call</div>
		`;
  } else {
    html += `
			<div id="stun-phone-notice" class="notice"> is <em>${mod.room_obj.ui}</em> calling you</div>
			<div class="actions">
				<div class="saito-button-primary" id="rejectcall">Reject</div>
				<div class="saito-button-primary" id="answercall">Answer</div>
			</div>`;
  }

  html += `</div>`;

  return html;
};
