const ZoomTemplate = require('./zoom.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ZoomOverlay {

  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod, false, false, false);
    this.overlay.callback_on_close = () => { this.visible = false; }

    //
    // optional callback when selecting spaces via zoom
    //
    this.spaces_onclick_callback = null;
  }

  remove() {
    this.visible = false;
    this.overlay.remove();
  }

  hide() {
    this.visible = false;
    this.overlay.hide();
  }

  render() {

    this.visible = true;

    this.overlay.show(ZoomTemplate());

    let container = document.querySelector('.zoom-overlay');
    let originalBoard = document.querySelector('#gameboard');
    let boardClone = document.querySelector('.gameboard-clone');

    if (!originalBoard) { return; }

    if (!boardClone) {
      boardClone = originalBoard.cloneNode(true);
      boardClone.removeAttribute('id');
      boardClone.removeAttribute('style');
      boardClone.classList.add('gameboard-clone');
      container.appendChild(boardClone);
    }

    if (typeof $ !== 'undefined' && $.fn.draggable) {
      $('.gameboard-clone').draggable({
        cancel: '.country, .country *'
      });
    }

    this.attachEvents();
  }

  attachEvents() {

    if (!this.mod.countries) { return; }

    const jq = (typeof jQuery !== 'undefined') ? jQuery : $;

    for (let key in this.mod.countries) {

      let el = document.querySelector(`.zoom-overlay .gameboard-clone .${key}`);
      if (!el) { continue; }

      const country_id = key;

      el.onmouseup = (e) => {
        e.stopPropagation();

        if (this.spaces_onclick_callback) {
          let selectable = false;
          document.querySelectorAll(`.${key}`).forEach((node) => {
            if (node.classList.contains('selectable')) {
              selectable = true;
            }
          });
          if (selectable) {
            this.spaces_onclick_callback(country_id);
          }
          return;
        }

        this.forwardPlacementToGameboard(country_id, jq);
      };
    }
  }

  forwardPlacementToGameboard(country_id, jq) {

    const board = document.getElementById('gameboard');
    if (!board || !jq) { return; }

    const real = board.querySelector(`#${country_id}.country`);
    if (!real) { return; }

    const $r = jq(real);

    // Setup / coup paths use .click on .westerneurope / .easterneurope
    if (real.classList.contains('westerneurope') || real.classList.contains('easterneurope')) {
      $r.trigger('click');
      return;
    }

    // Ops placement uses jQuery mousedown + mouseup on #country
    const o = { bubbles: true, clientX: 0, clientY: 0 };
    $r.trigger(jq.Event('mousedown', o));
    $r.trigger(jq.Event('mouseup', o));
  }


  renderAtCountry(countrykey = "") {
    if (!this.mod.countries || !this.mod.countries[countrykey]) { return; }

    let c = this.mod.countries[countrykey];
    this.renderAtCoordinates(c.top, c.left);
  }



renderAtCoordinates(x = 0, y = 0) {

  const scale = 2;

  this.render();

  const zoomOverlay = document.querySelector(".zoom-overlay");
  const board = document.querySelector(".zoom-overlay .gameboard-clone");

  if (!zoomOverlay || !board) return;

  const viewportWidth = zoomOverlay.clientWidth;
  const viewportHeight = zoomOverlay.clientHeight;

  const boardWidth = board.offsetWidth;
  const boardHeight = board.offsetHeight;

  // compute translation in unscaled space
  let translateX = -(x - viewportWidth / (2 * scale));
  let translateY = -(y - viewportHeight / (2 * scale));

  // clamp in unscaled space
  const maxX = 0;
  const maxY = 0;
  const minX = viewportWidth / scale - boardWidth;
  const minY = viewportHeight / scale - boardHeight;

  translateX = Math.min(maxX, Math.max(translateX, minX));
  translateY = Math.min(maxY, Math.max(translateY, minY));

  board.style.transformOrigin = "top left";
  board.style.transform =
    `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
}


}

module.exports = ZoomOverlay;
