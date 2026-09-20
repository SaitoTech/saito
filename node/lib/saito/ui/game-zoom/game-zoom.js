const GameZoomTemplate = require('./game-zoom.template');

class GameZoom {
  constructor(app, mod, minimap) {
    this.app = app;
    this.mod = mod;
    this.minimap = minimap;
    this.min = 2;
    this.max = 200;
    this.step = 5;
    this.el = null;
    this.fill_el = null;
    this.track_el = null;
    this.hide_delay = 1400;
    this.interaction_hide_delay = 3200;
    this.fade_ms = 450;
    this.hide_timer = null;
    this.fade_timer = null;
    this.interacted = false;
    this.dragging = false;
    this.attached = false;
    this.initialized = false;
  }

  render(parent_el) {
    if (!parent_el) {
      return;
    }

    if (!this.el) {
      this.app.browser.addStylesheet('/saito/css-imports/ui/game-zoom.css');
      this.app.browser.addElementToElement(GameZoomTemplate(), parent_el);
      this.el = parent_el.querySelector('.game-zoom');
      if (this.el) {
        this.track_el = this.el.querySelector('.track');
        this.fill_el = this.el.querySelector('.fill');
        this.attachEvents();
      }
    }

    if (!this.initialized) {
      this.initialized = true;
      const board = document.querySelector('.gameboard:not(.gameboard-clone)');
      if (board) {
        let saved_scale = this.mod.loadGamePreference(this.mod.returnSlug() + '-board-scale');
        if (saved_scale) {
          this.mod.setBoardScale(saved_scale, false);
          try {
            let boardoffset = this.mod.loadGamePreference(this.mod.returnSlug() + '-board-offset');
            if (boardoffset) {
              if (typeof $ !== 'undefined' && boardoffset.top !== undefined) {
                $(board).offset(boardoffset);
              } else {
                this.mod.setBoardPosition(boardoffset.left, boardoffset.top);
              }
            }
          } catch (err) {}
        } else if (this.mod.default_board_scale) {
          this.mod.setBoardScale(this.mod.default_board_scale);
        } else {
          this.mod.centerBoard();
        }
      }
    }

    const b = this.mod.getBoardState();
    if (!b || !this.fill_el) {
      return;
    }

    let scale = Math.round(b.scale * 100);
    let t = (this.max - scale) / (this.max - this.min);
    t = Math.max(0, Math.min(1, t));
    this.fill_el.style.width = t * 100 + '%';
  }

  show() {
    if (!this.el || !this.minimap.minimap_el) {
      return;
    }

    clearTimeout(this.hide_timer);
    clearTimeout(this.fade_timer);
    this.hide_timer = null;
    this.fade_timer = null;
    this.minimap.minimap_el.classList.add('has-zoom');
    this.minimap.minimap_el.classList.remove('zoom-fading');
  }

  hide() {
    if (this.dragging || !this.minimap.minimap_el) {
      return;
    }
    if (this.hide_timer || this.fade_timer) {
      return;
    }

    let delay = this.interacted ? this.interaction_hide_delay : this.hide_delay;
    this.hide_timer = setTimeout(() => {
      this.hide_timer = null;
      if (this.dragging) {
        return;
      }
      if (this.minimap.minimap_el && this.minimap.minimap_el.matches(':hover')) {
        return;
      }
      this.minimap.minimap_el.classList.add('zoom-fading');
      this.fade_timer = setTimeout(() => {
        this.fade_timer = null;
        this.interacted = false;
        if (this.minimap.minimap_el) {
          this.minimap.minimap_el.classList.remove('has-zoom', 'zoom-fading');
        }
      }, this.fade_ms);
    }, delay);
  }

  setZoom(scale) {
    scale = Math.max(this.min, Math.min(this.max, Math.round(Number(scale) || this.min)));
    this.mod.setBoardScale(scale);
    this.minimap.render();
  }

  attachEvents() {
    if (this.attached || !this.el) {
      return;
    }
    this.attached = true;

    const zoom_self = this;

    this.el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      zoom_self.interacted = true;
      zoom_self.show();
    });
    this.el.addEventListener(
      'touchstart',
      (e) => {
        e.stopPropagation();
      },
      { passive: true }
    );

    this.el.querySelector('.center').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoom_self.mod.centerBoard();
      zoom_self.minimap.render();
      zoom_self.interacted = true;
      zoom_self.show();
    });

    this.el.querySelector('.plus').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const b = zoom_self.mod.getBoardState();
      zoom_self.setZoom((b ? Math.round(b.scale * 100) : 100) + zoom_self.step);
      zoom_self.interacted = true;
      zoom_self.show();
    });

    this.el.querySelector('.minus').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const b = zoom_self.mod.getBoardState();
      zoom_self.setZoom((b ? Math.round(b.scale * 100) : 100) - zoom_self.step);
      zoom_self.interacted = true;
      zoom_self.show();
    });

    this.track_el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoom_self.dragging = true;
      zoom_self.track_el.setPointerCapture(e.pointerId);
      const box = zoom_self.track_el.getBoundingClientRect();
      if (box.width) {
        let t = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
        zoom_self.setZoom(zoom_self.max - t * (zoom_self.max - zoom_self.min));
      }
      zoom_self.interacted = true;
      zoom_self.show();
    });
    this.track_el.addEventListener('pointermove', (e) => {
      if (!zoom_self.dragging) {
        return;
      }
      const box = zoom_self.track_el.getBoundingClientRect();
      if (!box.width) {
        return;
      }
      let t = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
      zoom_self.setZoom(zoom_self.max - t * (zoom_self.max - zoom_self.min));
    });
    this.track_el.addEventListener('pointerup', () => {
      zoom_self.dragging = false;
      zoom_self.interacted = true;
      zoom_self.show();
    });
    this.track_el.addEventListener('pointercancel', () => {
      zoom_self.dragging = false;
    });

    const board = document.querySelector('.gameboard:not(.gameboard-clone)');
    if (board) {
      board.addEventListener(
        'wheel',
        (event) => {
          if (event.deltaY === 0) {
            return;
          }
          event.preventDefault();
          const b = zoom_self.mod.getBoardState();
          let scale = b ? Math.round(b.scale * 100) : 100;
          zoom_self.setZoom(scale + (event.deltaY < 0 ? 1 : -1) * zoom_self.step);
        },
        { passive: false }
      );

      if (typeof $ !== 'undefined') {
        $(board).draggable({
          stop: function (event, ui) {
            zoom_self.mod.saveGamePreference(
              zoom_self.mod.returnSlug() + '-board-offset',
              ui.offset
            );
            zoom_self.minimap.render();
          }
        });
      }
    }
  }
}

module.exports = GameZoom;
