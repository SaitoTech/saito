module.exports = (app, mod) => {
  const privacy = app.options.stun?.settings?.privacy || 'all';
  return `
    <div class="stun-settings-shell">
      <fieldset class="videocall-settings-group stun-settings-privacy">
        <legend class="videocall-settings-heading">Allow direct calls from</legend>
        ${[
          ['all', 'Anyone'],
          ['key', 'Acquaintances'],
          ['dh', 'Friends'],
          ['none', 'No one']
        ]
          .map(
            ([value, label]) => `
            <label class="videocall-settings-option">
              <input class="saito-radio" type="radio" name="stun-privacy"
                value="${value}" ${privacy === value ? 'checked' : ''}>
              <span>${label}</span>
            </label>`
          )
          .join('')}
      </fieldset>
      <fieldset class="videocall-settings-group">
        <legend class="videocall-settings-heading">Call diagnostics</legend>
        <label class="videocall-settings-option">
          <input class="saito-checkbox" type="checkbox" name="videocall-diagnostics"
            ${app.options.stun?.settings?.diagnostics ? 'checked' : ''}>
          <span>Show connection status and log in each call window</span>
        </label>
        <p class="videocall-settings-help">Includes signaling, connection attempts, media traffic and playback status.</p>
      </fieldset>
      ${
        mod?.streams?.active
          ? `
        <fieldset class="videocall-settings-group stun-input-settings" hidden>
          <legend class="videocall-settings-heading">Adjust inputs</legend>
          <label class="videocall-device-option" hidden>Camera
            <select class="saito-form-select" id="video-input" aria-label="Camera"></select>
          </label>
          <label class="videocall-device-option" hidden>Microphone
            <select class="saito-form-select" id="audio-input" aria-label="Microphone"></select>
          </label>
        </fieldset>`
          : ''
      }
    </div>`;
};
