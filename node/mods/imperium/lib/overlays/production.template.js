module.exports = (
  imperium_self,
  resources_available,
  production_limit,
  cost_limit = 0,
  available_units
) => {
  let goods = 0;
  try {
    goods = imperium_self.game.state.players_info[imperium_self.game.player - 1].goods || 0;
  } catch (err) {
    goods = 0;
  }
  let limit_label = production_limit + (production_limit == 1 ? ' unit' : ' units');
  let goods_row = '';
  if (goods > 0) {
    goods_row = `
        <div class="production-stat-key">Trade goods</div>
        <div><span class="goods_box">${goods}</span></div>`;
  }

  let html = '';
  html += `

<div class="production-overlay" style="">
  <div class="production-info">
    <div class="production-header">
      <div class="production-description">
        <div class="production-stat">
          <div class="production-stat-label">Resources</div>
          <div class="production-stat-key">Available</div>
          <div><span class="resources_box available">${resources_available} resources</span></div>
          <div class="production-stat-key">Required</div>
          <div><span class="resources_box required">0 resources</span></div>
        </div>
        <div class="production-stat">
          <div class="production-stat-label">Production</div>
          <div class="production-stat-key">Limit</div>
          <div><span class="resources_box production_limit">${limit_label}</span></div>
          ${goods_row}
        </div>
      </div>
      <div class="production-button saito-button-secondary">CONTINUE</div>
    </div>
    <div class="production-table">
  `;

  for (let i = 0; i < available_units.length; i++) {
    let preobj = imperium_self.units[available_units[i]];
    let obj = JSON.parse(JSON.stringify(preobj));
    obj.owner = imperium_self.game.player;
    obj = imperium_self.upgradeUnit(obj, imperium_self.game.player);
    html += preobj.returnCardImage(obj, 'square');
  }

  html += `
    </div>
  </div>
</div>
  `;

  return html;
};
