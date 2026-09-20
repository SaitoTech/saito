module.exports = (imperium_self, i = 0, agenda_phase = 0) => {
  let html = '';
  let pinfo = imperium_self.game.state.players_info[i];
  let is_speaker = imperium_self.game.state.speaker == i + 1;

  html += `
    <div data-id="${i + 1}" class="dash-faction p${i + 1}${is_speaker ? ' is-speaker' : ''}">
     <div data-id="${i + 1}" class="dash-faction-name bk"></div>
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
          <i data-id="${i + 1}" class="fas fa-database pc white-stroke"></i>
          <div data-id="${i + 1}" id="dash-item-goods" class="dash-item-goods">
            ${pinfo.goods}
          </div>
        </div>
      </div>
    `;
  }

  html += `
      <div data-id="${i + 1}" class="dash-faction-base">
        <div data-id="${i + 1}" class="dash-faction-status-${i + 1} dash-faction-status"></div>
	<div class="dash-faction-status-text">
          commodities : <span data-id="${i + 1}" class="dash-item-commodities">${
            pinfo.commodities
          }</span> / <span data-id="${i + 1}" class="dash-item-commodity-limit">${
            pinfo.commodity_limit
          }</span>
        </div>
      </div>

      <div data-id="${i + 1}" class="dash-faction-footer">
        <div data-id="${i + 1}" class="dash-faction-vp">
          <span class="dash-vp-label">VP</span>
          <span data-id="${i + 1}" class="dash-item-vp">${pinfo.vp}</span>
        </div>
      </div>

      <div data-id="${i + 1}" class="dash-faction-speaker`;
  if (is_speaker) {
    html += ` speaker">Speaker · ${imperium_self.returnFactionNickname(i + 1)}`;
  } else {
    html += '">';
  }
  html += `</div>
    </div>
  `;

  return html;
};
