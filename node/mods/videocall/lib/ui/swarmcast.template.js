module.exports = (status, detail) => `
  <div class="swarmcast-viewer" data-entry="connecting">
    <section class="swarmcast-entry">
      <header class="swarmcast-entry-header">
        <p class="swarmcast-entry-kicker">Swarmcast</p>
        <h1 class="swarmcast-entry-title">Joining the broadcast</h1>
      </header>
      <div class="swarmcast-entry-body">
        <ol class="swarmcast-entry-progress"></ol>
        <p class="swarmcast-entry-pending" hidden></p>
        <div class="swarmcast-entry-welcome" hidden>
          <p>Your broadcast is ready. Enter to watch and listen.</p>
          <button type="button" class="swarmcast-entry-enter">Enter Swarmcast</button>
        </div>
        <div class="swarmcast-entry-error" hidden>
          <p class="swarmcast-entry-error-text">${detail || ''}</p>
        </div>
      </div>
    </section>
    <div class="swarmcast-stage" hidden>
      <header class="swarmcast-bar">
        <h1 class="swarmcast-bar-title">Swarmcast</h1>
        <p class="swarmcast-onair">
          <span class="swarmcast-onair-dot" aria-hidden="true"></span>
          LIVE
        </p>
        <p class="swarmcast-feed-count">0 feeds</p>
        <div class="swarmcast-status" data-state="${status}" hidden>
          <p class="swarmcast-status-label">${status}</p>
          <p class="swarmcast-status-detail">${detail || ''}</p>
        </div>
      </header>
      <button type="button" class="swarmcast-playback-retry" hidden>Try playback again</button>
      <div class="swarmcast-audio"></div>
      <div class="swarmcast-view">
        <div class="swarmcast-outputs" data-layout="auto"></div>
      </div>
      <section class="swarmcast-share">
        <div class="swarmcast-transcript-log"></div>
        <h2>Share this Swarmcast</h2>
        <div class="swarmcast-share-row">
          <input class="swarmcast-share-field" type="text" readonly value="" aria-label="Swarmcast link">
          <button type="button" class="swarmcast-share-copy" aria-label="Copy link">
            <i class="fa-regular fa-copy" aria-hidden="true"></i>
          </button>
          <a class="swarmcast-share-open swarmcast-transcript-link" target="_blank" rel="noopener noreferrer" aria-label="Open Swarmcast" hidden>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </a>
        </div>
      </section>
      <div class="swarmcast-toolbar" role="toolbar" aria-label="Swarmcast playback">
        <button type="button" class="swarmcast-mute" aria-pressed="false">
          <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
          <span>Mute</span>
        </button>
        <div class="swarmcast-layouts" role="group" aria-label="Presentation">
          <button type="button" class="swarmcast-layout" data-layout="auto" aria-pressed="true">
            <i class="fa-solid fa-table-cells" aria-hidden="true"></i>
            <span>Automatic</span>
          </button>
          <button type="button" class="swarmcast-layout" data-layout="grid" aria-pressed="false">
            <i class="fa-solid fa-border-all" aria-hidden="true"></i>
            <span>Grid</span>
          </button>
          <button type="button" class="swarmcast-layout" data-layout="focus" aria-pressed="false">
            <i class="fa-solid fa-users-viewfinder" aria-hidden="true"></i>
            <span>Focus</span>
          </button>
        </div>
        <button type="button" class="swarmcast-fullscreen">
          <i class="fa-solid fa-expand" aria-hidden="true"></i>
          <span>Full screen</span>
        </button>
        <button type="button" class="swarmcast-leave">
          <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
          <span>Leave</span>
        </button>
      </div>
    </div>
  </div>
`;
