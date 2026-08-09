module.exports = (app, mod) => {
  let title = mod.active_rom_name ? mod.active_rom_name.trim() : 'Saved Games';

  return `
    <div class="nwasm-save-games saito-overlay-form">
      <div class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Load Save — ${title}</h2>
      </div>
      <div class="body" id="nwasm-saved-games">
        <div class="empty">No saved games yet.</div>
      </div>
    </div>
  `;
};
