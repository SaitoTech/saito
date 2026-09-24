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
                <div class="loss-overlay-strength attacker-strength"></div>
              </div>
              <div class="loss-overlay-faction-body">
                <div class="units attacker"></div>
              </div>
            </div>

            <div class="loss-overlay-result">
              <div class="loss-overlay-result-columns">
                <div class="loss-overlay-fire attacker-fire">
                  <div class="loss-overlay-die-sprite attacker-die" role="img" aria-label="attacker die"></div>
                  <div class="loss-overlay-calc attacker-calc">-</div>
                  <div class="loss-overlay-hits attacker-hits">
                    <div class="hits-value">-</div>
                    <div class="hits-label attacker-hits-label">hits</div>
                  </div>
                </div>
                <div class="loss-overlay-fire defender-fire">
                  <div class="loss-overlay-die-sprite defender-die" role="img" aria-label="defender die"></div>
                  <div class="loss-overlay-calc defender-calc">-</div>
                  <div class="loss-overlay-hits defender-hits">
                    <div class="hits-value">-</div>
                    <div class="hits-label defender-hits-label">hits</div>
                  </div>
                </div>
              </div>
              <button type="button" class="loss-overlay-see-details">view details</button>
            </div>

            <div class="loss-overlay-faction defender-panel">
              <div class="loss-overlay-faction-header">
                <div class="loss-overlay-strength defender-strength"></div>
              </div>
              <div class="loss-overlay-faction-body">
                <div class="units defender"></div>
              </div>
            </div>

          </div>

          <div class="loss-overlay-details" aria-hidden="true">
            <div class="loss-overlay-details-bar">
              <div class="loss-overlay-details-title">How was this calculated?</div>
              <button type="button" class="loss-overlay-hide-details">hide details</button>
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
