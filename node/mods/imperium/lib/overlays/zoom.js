const ZoomTemplate = require('./zoom.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class ZoomOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod);
  }

  hide() {
    this.visible = false;
    this.overlay.hide();
  }

  render(sector = '') {
    this.visible = true;
    this.overlay.show(ZoomTemplate());

    let dw = document.querySelector('.zoom-overlay');
    let gb = this.mod.getBoardElement();
    if (!gb) {
      return;
    }
    let gb2 = gb.cloneNode(true);
    gb2.removeAttribute('id');
    gb2.removeAttribute('style');
    gb2.classList.add('gameboard-clone');

    dw.appendChild(gb2);

    let obj = document.querySelector('.gameboard-clone');
    obj.style.position = 'relative';
    obj.style.transformOrigin = '';
    obj.style.transform = '';
    obj.style.top = '0px';
    obj.style.bottom = 'auto';
    obj.style.left = '0px';
    obj.style.right = 'auto';

    $('.gameboard-clone').draggable({});
    this.centerClone(obj, sector);

    this.attachEvents(sector);
  }

  centerClone(clone, sector) {
    if (!clone || !sector) {
      return;
    }
    let hex = clone.querySelector('.sector_' + sector);
    let frame = clone.parentElement;
    if (!hex || !frame) {
      return;
    }

    let frame_box = frame.getBoundingClientRect();
    let hex_box = hex.getBoundingClientRect();
    if (!frame_box.width || !hex_box.width) {
      return;
    }

    let left = parseFloat(clone.style.left) || 0;
    let top = parseFloat(clone.style.top) || 0;
    let dx = frame_box.left + frame_box.width / 2 - (hex_box.left + hex_box.width / 2);
    let dy = frame_box.top + frame_box.height / 2 - (hex_box.top + hex_box.height / 2);
    clone.style.left = left + dx + 'px';
    clone.style.top = top + dy + 'px';
  }

  attachEvents() {
    let imperium_self = this.mod;

    for (let sector in this.mod.game.board) {
      let qs = `.gameboard-clone .sector_${sector}`;
      let sys = imperium_self.returnSectorAndPlanets(sector);

      console.log('attach events...');
      console.log('testing: ' + qs);
      console.log('to sector: ' + sector);

      let xpos = 0;
      let ypos = 0;

      try {
        $(qs).off();

        $(qs)
          .on('mouseenter', function () {
            let pid = $(this).attr('id');
            imperium_self.addSectorHighlight(pid, 1);
          })
          .on('mouseleave', function () {
            let pid = $(this).attr('id');
            imperium_self.removeSectorHighlight(pid, 1);
          });

        $(qs).on('mousedown', function (e) {
          xpos = e.clientX;
          ypos = e.clientY;
        });

        $(qs).on('mouseup', function (e) {
          if (Math.abs(xpos - e.clientX) > 4) {
            return;
          }
          if (Math.abs(ypos - e.clientY) > 4) {
            return;
          }

          imperium_self.sector_overlay.render(sector);
        });
      } catch (err) {
        console.log('error attaching events to sector...');
      }
    }
  }
}

module.exports = ZoomOverlay;
