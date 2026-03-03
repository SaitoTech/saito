const ZoomTemplate = require('./zoom.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ZoomOverlay {

  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);
    this.visible = false;

    //
    // optional callback when selecting spaces via zoom
    //
    this.spaces_onclick_callback = null;
  }

  //
  // Public API
  //

  hide() {
    this.visible = false;
    this.overlay.hide();
  }

  renderAtCountry(countrykey = "") {
    if (!this.mod.countries || !this.mod.countries[countrykey]) { return; }

    let c = this.mod.countries[countrykey];
    this.renderAtCoordinates(c.top, c.left);
  }

  renderAtCoordinates(top = 0, left = 0) {
    this.render();

    let zoomOverlay = document.querySelector(".zoom-overlay");
    let board = document.querySelector(".zoom-overlay .gameboard-clone");

    if (!zoomOverlay || !board) { return; }

    const zoomWidth = zoomOverlay.clientWidth;
    const zoomHeight = zoomOverlay.clientHeight;

    const boardWidth = board.offsetWidth;
    const boardHeight = board.offsetHeight;

    let scrollLeft = left - zoomWidth / 2;
    let scrollTop = top - zoomHeight / 2;

    scrollLeft = Math.max(0, Math.min(scrollLeft, boardWidth - zoomWidth));
    scrollTop = Math.max(0, Math.min(scrollTop, boardHeight - zoomHeight));

    board.style.transform = `translate(-${scrollLeft}px, -${scrollTop}px)`;
  }

  //
  // Core Render
  //

  render() {

    if (this.visible) { return; }

    this.visible = true;
    this.overlay.show(ZoomTemplate());

    let container = document.querySelector('.zoom-overlay');
    let originalBoard = document.querySelector('.gameboard');

    if (!originalBoard) { return; }

    //
    // clone board
    //
    let boardClone = originalBoard.cloneNode(true);
    boardClone.removeAttribute('id');
    boardClone.removeAttribute('style');
    boardClone.classList.add('gameboard-clone');

    container.appendChild(boardClone);

    //
    // allow drag panning
    //
    if (typeof $ !== "undefined" && $('.gameboard-clone').draggable) {
      $('.gameboard-clone').draggable({});
    }

    this.attachEvents();
  }

  //
  // Event Handling
  //

  attachEvents() {

    if (!this.mod.countries) { return; }

    for (let key in this.mod.countries) {

      let selector = `.zoom-overlay .gameboard-clone .${key}`;
      let el = document.querySelector(selector);

      if (!el) { continue; }

      el.onclick = (e) => {

        let country_id = e.currentTarget.id;

        //
        // Selection mode
        //
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

        } else {

console.log("PASSIVE INSPECT MOVE IN ZOOM...");
console.log("PASSIVE INSPECT MOVE IN ZOOM...");
console.log("PASSIVE INSPECT MOVE IN ZOOM...");
console.log("PASSIVE INSPECT MOVE IN ZOOM...");
console.log("PASSIVE INSPECT MOVE IN ZOOM...");

          //
          // Passive inspect mode
          //
//          if (this.mod.displayCountryDetailedView) {
//            this.mod.displayCountryDetailedView(country_id);
//          }
        }
      };
    }
  }

}

module.exports = ZoomOverlay;
