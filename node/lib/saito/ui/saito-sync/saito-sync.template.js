const SaitoSyncTemplate = (sync) => {
  const payload = sync.payload || {};
  const current_block_id = sync.formatBlockId(
    sync.displayed_current_block_id ?? payload.current_block_id
  );
  const target_block_id = sync.formatBlockId(payload.target_block_id);

  return `
    <div id="saito-sync" class="saito-overlay-form saito-sync">
      <div class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">SYNCING BLOCKCHAIN</h2>
      </div>
      <div class="saito-sync-body">
        <div class="saito-sync-graphic" aria-hidden="true">
          <div class="saito-sync-halo"></div>
          <div class="saito-sync-spokes"></div>
          <div class="saito-sync-band saito-sync-band-5"><span class="saito-sync-carrier"></span></div>
          <div class="saito-sync-band saito-sync-band-4"><span class="saito-sync-carrier"></span></div>
          <div class="saito-sync-band saito-sync-band-3"><span class="saito-sync-carrier"></span></div>
          <div class="saito-sync-band saito-sync-band-2"><span class="saito-sync-carrier"></span></div>
          <div class="saito-sync-band saito-sync-band-1"><span class="saito-sync-carrier"></span></div>
          <div class="saito-sync-beat-flash"></div>
          <div class="saito-sync-logo-wrap">
            <img
              class="saito-sync-logo"
              src="/saito/icons/saito-saito-icon-outline-cube.svg"
              alt=""
            />
          </div>
        </div>
        <div class="saito-sync-copy">
          <p class="saito-sync-status">Loading the blockchain</p>
          <div class="saito-sync-meter">
            <p class="saito-sync-progress-label">
              Block <span id="saito-sync-current-block">${current_block_id}</span>
              of <span id="saito-sync-target-block">${target_block_id}</span>
            </p>
            <div
              class="saito-sync-progress"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
              id="saito-sync-progress"
            >
              <div class="saito-sync-progress-fill" id="saito-sync-progress-fill"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

const SaitoSyncTooFarBehindTemplate = () => {
  return `
    <div id="saito-sync" class="saito-overlay-form saito-sync saito-sync-behind">
      <div class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">BLOCKCHAIN TOO FAR BEHIND</h2>
      </div>
      <div class="saito-sync-body">
        <div class="saito-sync-leap" aria-hidden="true">
          <div class="saito-sync-leap-origin">
            <div class="saito-sync-leap-origin-halo"></div>
            <div class="saito-sync-leap-origin-ring"></div>
            <img
              class="saito-sync-leap-logo"
              src="/saito/icons/saito-saito-icon-outline-cube.svg"
              alt=""
            />
          </div>
          <div class="saito-sync-leap-path">
            <span class="saito-sync-leap-seg is-past"></span>
            <span class="saito-sync-leap-seg is-past"></span>
            <span class="saito-sync-leap-seg is-past"></span>
            <span class="saito-sync-leap-jump">
              <span class="saito-sync-leap-jump-arc"></span>
              <span class="saito-sync-leap-jump-dot"></span>
            </span>
            <span class="saito-sync-leap-seg is-now"></span>
            <span class="saito-sync-leap-seg is-now"></span>
            <span class="saito-sync-leap-head"></span>
          </div>
        </div>
        <div class="saito-sync-copy">
          <p class="saito-sync-status">Haven't been here in a while?</p>
          <p class="saito-sync-explain">
            Click on the button below to fast-forward your wallet to the latest block on the chain.
          </p>
          <p class="saito-sync-error" id="saito-sync-error"></p>
        </div>
        <button
          type="button"
          class="saito-button-primary"
          id="saito-sync-fast-forward"
        >
          FAST-FORWARD WALLET
        </button>
      </div>
    </div>
  `;
};

SaitoSyncTemplate.tooFarBehind = SaitoSyncTooFarBehindTemplate;

module.exports = SaitoSyncTemplate;
