module.exports = (terrain = '') => {
  let html = `
    <div class="loss-overlay ${terrain}">

      <div class="loss-overlay-panel">

        <div class="loss-overlay-status help">
          <div class="loss-overlay-status-icon" data-faction="" aria-hidden="true"></div>
          <div class="loss-overlay-status-copy"></div>
        </div>

        <div class="loss-overlay-stage">

          <div class="loss-overlay-body">

            <div class="loss-overlay-faction attacker-panel">
              <div class="loss-overlay-faction-header">
                <div class="loss-overlay-header-fields">
                  <div class="loss-overlay-header-field">Attacker</div>
                  <div class="loss-overlay-header-divider" aria-hidden="true"></div>
                  <div class="loss-overlay-header-field">Hits: <span class="attacker-hits-count"></span></div>
                </div>
              </div>
              <div class="loss-overlay-faction-body">
                <div class="units attacker"></div>
                <div class="loss-overlay-casualty attacker-casualty"></div>
              </div>
            </div>

            <div class="loss-overlay-faction defender-panel">
              <div class="loss-overlay-faction-header">
                <div class="loss-overlay-header-fields">
                  <div class="loss-overlay-header-field">Defender</div>
                  <div class="loss-overlay-header-divider" aria-hidden="true"></div>
                  <div class="loss-overlay-header-field">Hits: <span class="defender-hits-count"></span></div>
                </div>
              </div>
              <div class="loss-overlay-faction-body">
                <div class="units defender"></div>
                <div class="loss-overlay-casualty defender-casualty"></div>
              </div>
            </div>

          </div>

          <div class="loss-overlay-details" aria-hidden="true">
            <div class="loss-overlay-details-bar">
              <div class="loss-overlay-details-title">How was this calculated?</div>
            </div>
            <div class="loss-overlay-details-scroll">
              <div class="loss-overlay-calc-fires"></div>
              <div class="loss-overlay-calc-notes"></div>
            </div>
          </div>

        </div>

        <div class="loss-overlay-footer">
          <div class="loss-overlay-footer-copy">
            <div class="loss-overlay-title">Combat</div>
          </div>
          <button type="button" class="loss-overlay-see-details" aria-label="Show combat details">
            <span class="loss-overlay-details-caret" aria-hidden="true">
              <span class="loss-overlay-details-caret-pair"><i></i><i></i></span>
              <span class="loss-overlay-details-caret-pair"><i></i><i></i></span>
              <span class="loss-overlay-details-caret-pair"><i></i><i></i></span>
            </span>
          </button>
          <div class="loss-overlay-context-meta">
            <div class="loss-overlay-terrain-item">
              <div class="loss-overlay-terrain-name"></div>
            </div>
            <div class="loss-overlay-fort-item">
              <div class="loss-overlay-fort-name"></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
  return html;
};
