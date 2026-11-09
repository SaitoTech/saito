function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function checks(participants, name, checked) {
  if (!participants.length) {
    return '<p class="swarmcast-setup-empty">No participants are in the call yet.</p>';
  }
  return participants
    .map(
      (person) => `<label class="swarmcast-setup-person">
        <input type="checkbox" name="${name}" value="${text(person.key)}"${checked ? ' checked' : ''}>
        <span>${text(person.name)}</span>
      </label>`
    )
    .join('');
}

function names(participants) {
  if (!participants.length) return '<p class="swarmcast-setup-empty">No audio tracks are in the call yet.</p>';
  return participants.map((person) => `<span>${text(person.name)}</span>`).join('');
}

const presets = [
  ['economy', 'Economy'],
  ['standard', 'Standard'],
  ['high', 'High'],
  ['premium', 'Premium']
];

module.exports = (participants) => `
  <section class="swarmcast-setup saito-overlay-form retain-surface" data-state="settings" data-video="interface" data-audio="all" data-preset="standard">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Swarmcast Settings</h2>
    </header>
    <div class="swarmcast-setup-loading" role="status" hidden>
      <span class="swarmcast-setup-spinner" aria-hidden="true"></span>
      <p>Starting Swarmcast</p>
    </div>
    <p class="swarmcast-setup-error" hidden></p>
    <div class="swarmcast-setup-columns">
      <div class="swarmcast-setup-column">
        <fieldset class="swarmcast-setup-video">
          <legend>What do you want to Swarmcast?</legend>
          <label class="swarmcast-setup-choice">
            <input type="radio" name="swarmcast-video" value="interface" checked>
            <span>My Screen</span>
          </label>
          <label class="swarmcast-setup-choice">
            <input type="radio" name="swarmcast-video" value="participants">
            <span>Video Boxes</span>
          </label>
          <div class="swarmcast-setup-video-list">${checks(participants, 'swarmcast-video-member', false)}</div>
        </fieldset>
        <fieldset class="swarmcast-setup-audio">
          <legend>Include Audio Tracks?</legend>
          <div class="swarmcast-setup-audio-included">${names(participants)}</div>
          <div class="swarmcast-setup-audio-list">${checks(participants, 'swarmcast-audio-member', true)}</div>
        </fieldset>
      </div>
      <fieldset class="swarmcast-setup-quality">
        <legend>Quality</legend>
        ${presets
          .map(
            ([value, label]) => `<label class="swarmcast-setup-choice">
            <input type="radio" name="swarmcast-quality" value="${value}"${value === 'standard' ? ' checked' : ''}>
            <span>${label}</span>
          </label>`
          )
          .join('')}
        <div class="swarmcast-setup-adjust">
          <div class="swarmcast-setup-adjust-row">
            <span>Resolution</span>
            <button type="button" class="swarmcast-setup-step" data-step="size" data-dir="-1" aria-label="Decrease resolution">−</button>
            <strong data-size>960×540</strong>
            <button type="button" class="swarmcast-setup-step" data-step="size" data-dir="1" aria-label="Increase resolution">+</button>
          </div>
          <div class="swarmcast-setup-adjust-row">
            <span>Frame rate</span>
            <button type="button" class="swarmcast-setup-step" data-step="rate" data-dir="-1" aria-label="Decrease frame rate">−</button>
            <strong data-rate>15 fps</strong>
            <button type="button" class="swarmcast-setup-step" data-step="rate" data-dir="1" aria-label="Increase frame rate">+</button>
          </div>
        </div>
        <input type="hidden" name="swarmcast-width" value="960">
        <input type="hidden" name="swarmcast-height" value="540">
        <input type="hidden" name="swarmcast-fps" value="15">
        <dl class="swarmcast-setup-meters">
          <div><dt>Source</dt><dd data-source>Not shared yet</dd></div>
          <div><dt>Outgoing</dt><dd data-outgoing>960×540</dd></div>
          <div><dt>Frame rate</dt><dd data-outgoing-rate>15 fps</dd></div>
          <div><dt>Bitrate</dt><dd data-bitrate>800 kbps</dd></div>
        </dl>
      </fieldset>
    </div>
    <div class="saito-button-row swarmcast-setup-actions">
      <button type="button" class="saito-button-primary swarmcast-setup-start">Start Swarmcasting</button>
    </div>
    <div class="swarmcast-setup-live" hidden>
      <p class="swarmcast-setup-live-label">Swarmcast is live</p>
      <a class="swarmcast-setup-live-link" target="_blank" rel="noopener noreferrer"></a>
      <div class="swarmcast-setup-live-tools">
        <button type="button" class="swarmcast-setup-copy">Copy link</button>
        <button type="button" class="swarmcast-setup-edit">Change broadcast</button>
      </div>
      <div class="saito-button-row">
        <button type="button" class="saito-button-secondary swarmcast-setup-close">Close</button>
        <button type="button" class="saito-button-primary swarmcast-setup-stop">Terminate Swarmcasting</button>
      </div>
    </div>
  </section>`;
