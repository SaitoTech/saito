module.exports = () => {
  return `
    <div class="settings-overlay">
      <div class="settings-title">Settings</div>
      <label class="settings-option">
        <input type="checkbox" data-setting="mouseover_for_movement">
        <span>mouseover for movement</span>
      </label>
      <label class="settings-option">
        <input type="checkbox" data-setting="remove_card_popups">
        <span>remove card popups</span>
      </label>
      <label class="settings-option">
        <input type="checkbox" data-setting="use_combat_overlays">
        <span>use combat overlays</span>
      </label>
    </div>
  `;
};
