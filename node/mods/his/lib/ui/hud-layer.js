function pullHudOverOverlay() {
  this.mod.hud_above_overlay = true;
  if (this.mod.hud) {
    this.mod.hud.pullToFront();
  }
}

function pushHudUnderOverlay() {
  this.mod.hud_above_overlay = false;
  if (this.mod.hud) {
    this.mod.hud.render();
  }
}

// HUD updates call render(), which resets z-index to 50. While an overlay has
// asked for the HUD above it, re-apply pullToFront after those updates.
function bindHudAboveOverlay(game) {
  let hud = game.hud;
  if (!hud || hud._his_above_overlay_bound) {
    return;
  }
  hud._his_above_overlay_bound = true;
  game.hud_above_overlay = false;

  let wrap = (name) => {
    let orig = hud[name];
    if (typeof orig !== 'function') {
      return;
    }
    hud[name] = function (...args) {
      let result = orig.apply(hud, args);
      if (game.hud_above_overlay) {
        hud.pullToFront();
      }
      return result;
    };
  };

  wrap('updateStatus');
  wrap('updateMenu');
  wrap('updateCards');
  wrap('showBackButton');
  wrap('showPopup');
}

module.exports = {
  pullHudOverOverlay,
  pushHudUnderOverlay,
  bindHudAboveOverlay,
};
