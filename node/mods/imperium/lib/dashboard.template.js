module.exports = (imperium_self, i = 0, agenda_phase = 0) => {
  let html = '';
  let pinfo = imperium_self.game.state.players_info[i];
  let is_speaker = imperium_self.game.state.speaker == i + 1;

  html += `
    <div data-id="${i + 1}" class="dash-faction p${i + 1}${is_speaker ? ' is-speaker' : ''}">
     <div data-id="${i + 1}" class="dash-faction-name bk"></div>
     <div class="dash-faction-body">
     <div class="dash-faction-main">
  `;

  if (agenda_phase == 1) {
    html += `
      <div data-id="${i + 1}" class="dash-faction-agenda">
        <div data-id="${i + 1}" class="dash-item-agenda-influence agenda-influence">
          <span data-id="${i + 1}" class="avail">${
            imperium_self.game.state.votes_available[i]
          }</span>
        </div>
      </div>
    `;
  } else {
    html += `
      <div data-id="${i + 1}" class="dash-faction-info">
        <div data-id="${i + 1}" class="dash-item tooltip dash-item-resources resources">
          <span data-id="${i + 1}" class="avail"></span>
          <span data-id="${i + 1}" class="total"></span>
        </div>

        <div data-id="${i + 1}" class="dash-item tooltip dash-item-influence influence">
          <span data-id="${i + 1}" class="avail"></span>
          <span data-id="${i + 1}" class="total"></span>
        </div>

        <div data-id="${i + 1}" class="dash-item tooltip dash-item-trade trade">
          <div data-id="${i + 1}" class="credits-icon pc"></div>
          <div data-id="${i + 1}" id="dash-item-goods" class="dash-item-goods">
            ${pinfo.goods}
          </div>
        </div>
      </div>
    `;
  }

  html += `
      <div class="dash-faction-rule"></div>
      <div data-id="${i + 1}" class="dash-faction-footer">
        <div data-id="${i + 1}" class="dash-faction-base" title="commodities">
          <div class="dash-faction-status-text">
            <span data-id="${i + 1}" class="dash-item-commodities">${pinfo.commodities}</span>
            <span class="dash-commodity-slash">/</span>
            <span data-id="${i + 1}" class="dash-item-commodity-limit">${pinfo.commodity_limit}</span>
          </div>
          <div data-id="${i + 1}" class="dash-faction-status-${i + 1} dash-faction-status"></div>
        </div>
        <div data-id="${i + 1}" class="dash-faction-speaker${is_speaker ? ' speaker' : ''}">${is_speaker ? 'speaker' : ''}</div>
        <div data-id="${i + 1}" class="dash-faction-vp">
          <span class="dash-vp-label">VP</span>
          <span data-id="${i + 1}" class="dash-item-vp">${pinfo.vp}</span>
        </div>
      </div>
    </div>
    <div class="dash-resource-rail" aria-label="tokens">
      <div class="dash-resource">
        <span class="dash-resource-icon strategy" title="strategy tokens"></span>
        <span data-id="${i + 1}" class="dash-resource-count dash-item-strategy">${pinfo.strategy_tokens}</span>
      </div>
      <div class="dash-resource-rule"></div>
      <div class="dash-resource">
        <span class="dash-resource-icon command" title="command tokens"></span>
        <span data-id="${i + 1}" class="dash-resource-count dash-item-command">${pinfo.command_tokens}</span>
      </div>
      <div class="dash-resource-rule"></div>
      <div class="dash-resource">
        <span class="dash-resource-icon fleet" title="fleet supply"></span>
        <span data-id="${i + 1}" class="dash-resource-count dash-item-fleet">${pinfo.fleet_supply}</span>
      </div>
    </div>
  </div>
    </div>
  `;

  return html;
};
