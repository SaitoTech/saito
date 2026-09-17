module.exports = (app, mod) => {
  // Defaults/load live on the Chat module (see Chat constructor + loadOptions):
  // - audio_notifications: default true; falsy/'', false → off; true|'all'|'groups'|'tabs' → on
  // - auto_open_community: default false; Boolean from options
  const chimeOn = Boolean(mod?.audio_notifications);
  const autoOpen = Boolean(mod?.auto_open_community);

  return `
  <div class="saito-module-settings chat-settings" data-chat-settings-stage="home">
    <div class="chat-settings-stages">
      <div class="chat-settings-stage chat-settings-home" data-chat-settings-view="home">
        <h2 class="chat-settings-panel-title">Contacts</h2>
        <div class="chat-settings-toolbar">
          <div class="chat-settings-search-wrap">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input
              type="search"
              class="saito-input chat-settings-search"
              id="chat-settings-search"
              placeholder="search contacts..."
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <button type="button" class="saito-button-secondary compact chat-settings-add-contact" id="chat-settings-add-contact">
            Add Contact
          </button>
        </div>

        <div class="chat-settings-list" id="chat-settings-list" role="list"></div>

        <div class="chat-settings-prefs-block">
          <h3 class="chat-settings-prefs-heading">Chat Settings</h3>
          <div class="chat-settings-prefs">
            <div class="chat-settings-pref">
              <input class="saito-checkbox" type="checkbox" id="audio-notifications" ${chimeOn ? 'checked' : ''}/>
              <label class="chat-settings-pref-label" for="audio-notifications">Incoming message chime</label>
            </div>
            <div class="chat-settings-pref">
              <input class="saito-checkbox" type="checkbox" id="auto-open" ${autoOpen ? 'checked' : ''}/>
              <label class="chat-settings-pref-label" for="auto-open">Always open community chat</label>
            </div>
          </div>
        </div>
      </div>

      <div class="chat-settings-stage chat-settings-detail" data-chat-settings-view="detail" aria-hidden="true">
        <div class="chat-settings-detail-header">
          <button type="button" class="saito-button-square chat-settings-back" id="chat-settings-back" aria-label="Back" title="Back">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h2 class="chat-settings-panel-title">Contacts</h2>
        </div>
        <div class="chat-settings-detail-scroll" id="chat-settings-detail-body"></div>
      </div>
    </div>
  </div>`;
};
