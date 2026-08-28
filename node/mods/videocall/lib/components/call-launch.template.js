module.exports = (app, mod, keys) => {
  let html = `
      <div class="stun-appspace">
        <div class="stun-appspace-content saito-cta">
          <div class="stunx-appspace-splash">
              <div class="saito-cta-logo stun-talk-logo" role="img" aria-label="Saito Talk"></div>
              <div class="saito-cta-subtitle stun-subtitle">PEER-TO-PEER VIDEO CHAT</div>
            </div>

          <div class="stunx-appspace-actions">`;

  let mode = null;
  if (mod.room_obj) {
    html += `<div class="saito-button-primary stunx-appspace-launch-call-btn" id="createRoom" data-id="${mod.room_obj?.call_id}">Join Meeting</div>`;
    mode = 'join';
  } else if (keys.length > 0) {
    html += `<div class="saito-button-primary stunx-appspace-launch-call-btn" id="joinScheduleRoom">JOIN CALL</div>`;
    mode = 'select';
  } else {
    html += `<div class="saito-button-primary stunx-appspace-launch-call-btn" id="createRoom">Start Call</div>`;
    mode = 'create';
    html += `<div class="saito-button-secondary stunx-precall-link" data-id="${mode}"><i class="fas fa-link"></i></div>`;
  }

  html += `</div>

          <div class="stun-appspace-footer">
            <div id="stunx-call-settings" class="stunx-call-settings saito-anchor"><i class="fa-solid fa-gears"></i><span>media settings</span></div>
            <div id="createScheduleRoom" class="stun-schedule-call saito-anchor"><i class="fas fa-calendar"></i><span>schedule call</span></div>
        </div>

      </div>

    `;

  return html;
};
