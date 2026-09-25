const GameMinimapTemplate = require('./game-minimap.template');
const GameZoom = require('../game-zoom/game-zoom');

class GameMinimap {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.enable_zoom = 0;
    this.zoom = null;
    this.dragging = false;
    this.dragged = false;
    this.drag_x = 0;
    this.drag_y = 0;
    this.drag_start_x = 0;
    this.drag_start_y = 0;
    this.moving = false;
    this.move_x = 0;
    this.move_y = 0;
    this.move_start_x = 0;
    this.move_start_y = 0;
    this.markers = {};
    this.redraw_markers = true;
    this.minimap_el = null;
    this.board_el = null;
    this.viewport_el = null;
    this.markers_el = null;
    this.clone_el = null;
    this.restore_el = null;
    this.minimized = false;
    this.saved_box = null;
    this.resizing = false;
    this.resize_right = 0;
    this.resize_bottom = 0;
    this.resize_ratio = 1;
    this.resize_start_x = 0;
    this.resize_start_y = 0;
    this.resize_start_width = 0;
  }

  render() {
    if (!this.mod.browser_active) {
      return;
    }

    let b = this.mod.getBoardState();
    if (!b) {
      return;
    }

    if (!this.minimap_el) {
      this.app.browser.addStylesheet('/saito/css-imports/ui/game-minimap.css');
      this.app.browser.addElementToDom(GameMinimapTemplate());
      this.minimap_el = document.querySelector('.game-minimap');
      this.board_el = document.querySelector('.game-minimap .board');
      this.viewport_el = document.querySelector('.game-minimap .viewport');
      this.markers_el = document.querySelector('.game-minimap .markers');
      this.attachEvents();
    }

    this.ensureRestoreButton();

    if (this.minimized) {
      return;
    }

    if (this.enable_zoom && this.minimap_el) {
      if (!this.zoom) {
        this.zoom = new GameZoom(this.app, this.mod, this);
      }
      this.zoom.render(this.minimap_el);
      b = this.mod.getBoardState();
      if (!b) {
        return;
      }
    }

    if (!this.board_el || !this.viewport_el || !this.markers_el) {
      return;
    }

    if (!this.board_el.style.aspectRatio) {
      this.board_el.style.aspectRatio = `${b.width} / ${b.height}`;
    }
    if (b.image && !this.board_el.style.backgroundImage) {
      this.board_el.style.backgroundImage = `url("${b.image}")`;
    }

    const map = this.board_el.getBoundingClientRect();
    if (!b.image) {
      this.syncClone(b, map);
    }
    let vis_x = -b.x / b.scale;
    let vis_y = -b.y / b.scale;
    let vis_right = vis_x + window.innerWidth / b.scale;
    let vis_bottom = vis_y + window.innerHeight / b.scale;

    vis_x = Math.max(0, vis_x);
    vis_y = Math.max(0, vis_y);
    vis_right = Math.min(b.width, vis_right);
    vis_bottom = Math.min(b.height, vis_bottom);

    this.viewport_el.style.left = (vis_x / b.width) * map.width + 'px';
    this.viewport_el.style.top = (vis_y / b.height) * map.height + 'px';
    this.viewport_el.style.width = ((vis_right - vis_x) / b.width) * map.width + 'px';
    this.viewport_el.style.height = ((vis_bottom - vis_y) / b.height) * map.height + 'px';

    if (this.redraw_markers) {
      if (!map.width) {
        return;
      }
      this.markers_el.innerHTML = '';
      for (let id in this.markers) {
        const obj = this.markers[id];
        const el = document.createElement('div');
        el.className = 'circle';
        if (obj.type) {
          el.classList.add(obj.type);
        }
        if (obj.flash) {
          el.classList.add('flash');
        }
        el.style.background = obj.color;
        el.style.width = obj.size + 'px';
        el.style.height = obj.size + 'px';
        el.style.left = obj.x * map.width - obj.size / 2 + 'px';
        el.style.top = obj.y * map.height - obj.size / 2 + 'px';
        this.markers_el.appendChild(el);
      }
      this.redraw_markers = false;
    }
  }

  syncClone(b, map) {
    if (!b.el || !this.board_el || !map.width) {
      return;
    }

    if (!this.dragging && !this.moving && !this.resizing) {
      if (this.clone_el) {
        this.clone_el.remove();
      }
      this.clone_el = b.el.cloneNode(true);
      this.clone_el.removeAttribute('id');
      this.clone_el.classList.remove('gameboard-clone');
      this.clone_el.classList.add('game-minimap-clone');
      this.clone_el.querySelectorAll('[id]').forEach((el) => {
        el.id = 'minimap-' + el.id;
      });
      this.clone_el.style.position = 'absolute';
      this.clone_el.style.top = '0px';
      this.clone_el.style.left = '0px';
      this.clone_el.style.right = 'auto';
      this.clone_el.style.bottom = 'auto';
      this.clone_el.style.margin = '0px';
      this.clone_el.style.transformOrigin = 'top left';
      this.clone_el.style.pointerEvents = 'none';
      this.board_el.insertBefore(this.clone_el, this.board_el.firstChild);
    }

    if (this.clone_el && b.width) {
      this.clone_el.style.width = b.width + 'px';
      this.clone_el.style.height = b.height + 'px';
      this.clone_el.style.transform = `scale(${map.width / b.width})`;
    }
  }

  snapshot() {
    if (!this.mod.browser_active || this.minimized) {
      return;
    }
    if (!this.minimap_el) {
      this.render();
    }
    if (!this.board_el) {
      return;
    }

    const b = this.mod.getBoardState();
    if (!b) {
      return;
    }

    const map = this.board_el.getBoundingClientRect();
    if (!map.width) {
      if (!this.snapshot_wait) {
        this.snapshot_wait = true;
        requestAnimationFrame(() => {
          this.snapshot_wait = false;
          this.snapshot();
        });
      }
      return;
    }

    this.board_el.style.backgroundImage = 'none';
    this.syncClone(b, map);
  }

  attachEvents() {
    const minimap = this.minimap_el;
    const board = this.board_el;
    const viewport = this.viewport_el;

    if (minimap) {
      minimap.addEventListener('mouseenter', () => {
        if (this.zoom) {
          this.zoom.show();
        }
      });
      minimap.addEventListener('mouseleave', () => {
        if (this.zoom) {
          this.zoom.hide();
        }
      });
      const close_el = minimap.querySelector('.game-minimap-close');
      if (close_el) {
        close_el.addEventListener('mousedown', (e) => {
          e.stopPropagation();
        });
        close_el.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.minimize();
        });
      }
      const resize_el = minimap.querySelector('.game-minimap-resize');
      if (resize_el) {
        resize_el.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.beginResize(e);
        });
      }
      minimap.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (
          e.target.closest('.viewport') ||
          e.target.closest('.game-zoom') ||
          e.target.closest('.game-minimap-close') ||
          e.target.closest('.game-minimap-resize')
        ) {
          return;
        }
        this.moving = true;
        this.dragged = false;
        const box = minimap.getBoundingClientRect();
        this.move_x = e.clientX - box.left;
        this.move_y = e.clientY - box.top;
        this.move_start_x = e.clientX;
        this.move_start_y = e.clientY;
      });
      minimap.addEventListener('click', (e) => {
        e.stopPropagation();
        if (
          e.target.closest('.game-minimap-close') ||
          e.target.closest('.game-minimap-resize')
        ) {
          return;
        }
        if (this.zoom && !this.dragged) {
          this.zoom.interacted = true;
          this.zoom.show();
        }
      });
    }

    if (board) {
      board.addEventListener('click', (e) => {
        this.onClick(e);
      });
    }

    if (viewport) {
      viewport.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      viewport.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dragging = true;
        this.dragged = false;
        const box = viewport.getBoundingClientRect();
        this.drag_x = e.clientX - box.left;
        this.drag_y = e.clientY - box.top;
        this.drag_start_x = e.clientX;
        this.drag_start_y = e.clientY;
      });
    }

    document.addEventListener('mousemove', (e) => {
      if (this.resizing) {
        this.onResize(e);
        return;
      }

      if (this.moving) {
        this.onDrag(e);
        return;
      }

      if (!this.dragging) {
        return;
      }

      if (
        Math.abs(e.clientX - this.drag_start_x) > 4 ||
        Math.abs(e.clientY - this.drag_start_y) > 4
      ) {
        this.dragged = true;
      }

      if (!this.dragged) {
        return;
      }

      const b = this.mod.getBoardState();
      if (!b || !this.board_el) {
        return;
      }

      const box = this.board_el.getBoundingClientRect();
      const view_w = window.innerWidth / b.scale;
      const view_h = window.innerHeight / b.scale;
      let vis_x = ((e.clientX - box.left - this.drag_x) / box.width) * b.width;
      let vis_y = ((e.clientY - box.top - this.drag_y) / box.height) * b.height;
      vis_x = Math.max(0, Math.min(vis_x, Math.max(0, b.width - view_w)));
      vis_y = Math.max(0, Math.min(vis_y, Math.max(0, b.height - view_h)));

      this.mod.setBoardPosition(-vis_x * b.scale, -vis_y * b.scale);
      this.render();
    });

    document.addEventListener('mouseup', (e) => {
      if (!this.dragging && !this.moving && !this.resizing) {
        return;
      }
      if (!this.dragged) {
        if (
          !this.resizing &&
          (!e.target.closest || !e.target.closest('.game-zoom'))
        ) {
          this.onClick(e);
        }
      } else {
        const swallow = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          document.removeEventListener('click', swallow, true);
        };
        document.addEventListener('click', swallow, true);
      }
      this.dragging = false;
      this.moving = false;
      this.resizing = false;
      this.dragged = false;
      if (this.minimap_el) {
        this.minimap_el.classList.remove('resizing');
      }
    });

    const el = document.querySelector('.gameboard:not(.gameboard-clone)');
    if (el) {
      if (typeof $ !== 'undefined') {
        $(el).on('drag dragstop', () => {
          this.render();
        });
      }
      el.addEventListener('wheel', () => {
        this.render();
      });
    }

    const scaler = document.querySelector('#game_board_sizer input');
    if (scaler) {
      scaler.addEventListener('input', () => {
        this.render();
      });
    }

    document.querySelectorAll('#game_board_sizer button').forEach((button) => {
      button.addEventListener('click', () => {
        this.render();
      });
    });

    window.addEventListener('resize', () => {
      this.redraw_markers = true;
      this.render();
    });
  }

  ensureRestoreButton() {
    if (this.restore_el && document.body.contains(this.restore_el)) {
      return;
    }

    let restore_el = document.getElementById('game-minimap-restore');
    if (!restore_el) {
      const hamburger = document.querySelector('#saito-header .hamburger-container');
      if (!hamburger) {
        return;
      }
      hamburger.insertAdjacentHTML('afterbegin', GameMinimapTemplate.restoreButton());
      restore_el = document.getElementById('game-minimap-restore');
    }

    if (!restore_el) {
      return;
    }

    this.restore_el = restore_el;
    if (!this.restore_el.dataset.bound) {
      this.restore_el.dataset.bound = '1';
      this.restore_el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.restore();
      });
    }
  }

  minimize() {
    if (!this.minimap_el || this.minimized) {
      return;
    }

    const box = this.minimap_el.getBoundingClientRect();
    this.saved_box = {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height
    };

    this.minimized = true;
    this.moving = false;
    this.dragging = false;
    this.resizing = false;
    this.minimap_el.classList.add('minimized');

    if (this.zoom) {
      this.zoom.hide();
    }

    this.ensureRestoreButton();
    if (this.restore_el) {
      this.restore_el.classList.add('visible');
    }
  }

  restore() {
    if (!this.minimap_el || !this.minimized) {
      return;
    }

    if (this.saved_box) {
      this.minimap_el.style.left = this.saved_box.left + 'px';
      this.minimap_el.style.top = this.saved_box.top + 'px';
      this.minimap_el.style.width = this.saved_box.width + 'px';
      this.minimap_el.style.height = this.saved_box.height + 'px';
      this.minimap_el.style.right = 'auto';
      this.minimap_el.style.bottom = 'auto';
    }

    this.minimized = false;
    this.minimap_el.classList.remove('minimized');
    if (this.restore_el) {
      this.restore_el.classList.remove('visible');
    }

    this.redraw_markers = true;
    this.render();
  }

  onClick(e) {
    const b = this.mod.getBoardState();
    if (!b || !this.board_el) {
      return;
    }

    const box = this.board_el.getBoundingClientRect();
    const board_x = ((e.clientX - box.left) / box.width) * b.width;
    const board_y = ((e.clientY - box.top) / box.height) * b.height;
    const view_w = window.innerWidth / b.scale;
    const view_h = window.innerHeight / b.scale;
    let vis_x = board_x - view_w / 2;
    let vis_y = board_y - view_h / 2;
    vis_x = Math.max(0, Math.min(vis_x, Math.max(0, b.width - view_w)));
    vis_y = Math.max(0, Math.min(vis_y, Math.max(0, b.height - view_h)));

    this.mod.setBoardPosition(-vis_x * b.scale, -vis_y * b.scale);
    this.render();
  }

  beginResize(e) {
    if (!this.minimap_el || !this.board_el || this.minimized) {
      return;
    }

    const board = this.board_el.getBoundingClientRect();
    if (!board.width || !board.height) {
      return;
    }

    this.resizing = true;
    this.moving = false;
    this.dragging = false;
    this.dragged = false;
    this.resize_right = board.right;
    this.resize_bottom = board.bottom;
    this.resize_ratio = board.height / board.width;
    this.resize_start_x = e.clientX;
    this.resize_start_y = e.clientY;
    this.resize_start_width = board.width;
    this.minimap_el.classList.add('resizing');
  }

  onResize(e) {
    if (!this.resizing || !this.minimap_el) {
      return;
    }

    if (
      Math.abs(e.clientX - this.resize_start_x) > 4 ||
      Math.abs(e.clientY - this.resize_start_y) > 4
    ) {
      this.dragged = true;
    }

    if (!this.dragged) {
      return;
    }

    const dw = this.resize_start_x - e.clientX;
    const dh = this.resize_start_y - e.clientY;
    let width = this.resize_start_width + (dw + dh / this.resize_ratio) / 2;

    const min_width = 140;
    const max_width = Math.min(
      window.innerWidth * 0.7,
      this.resize_right,
      this.resize_bottom / this.resize_ratio
    );
    width = Math.max(min_width, Math.min(width, max_width));
    const height = width * this.resize_ratio;

    this.minimap_el.style.width = width + 'px';
    this.minimap_el.style.height = 'auto';
    this.minimap_el.style.left = this.resize_right - width + 'px';
    this.minimap_el.style.top = this.resize_bottom - height + 'px';
    this.minimap_el.style.right = 'auto';
    this.minimap_el.style.bottom = 'auto';

    this.redraw_markers = true;
    this.render();
  }

  onDrag(e) {
    if (this.dragging || !this.moving) {
      return;
    }

    if (
      Math.abs(e.clientX - this.move_start_x) > 4 ||
      Math.abs(e.clientY - this.move_start_y) > 4
    ) {
      this.dragged = true;
    }

    if (!this.dragged || !this.minimap_el) {
      return;
    }

    const box = this.minimap_el.getBoundingClientRect();
    let left = e.clientX - this.move_x;
    let top = e.clientY - this.move_y;
    const visible = 36;
    left = Math.max(visible - box.width, Math.min(left, window.innerWidth - visible));
    top = Math.max(visible - box.height, Math.min(top, window.innerHeight - visible));

    this.minimap_el.style.left = left + 'px';
    this.minimap_el.style.top = top + 'px';
    this.minimap_el.style.right = 'auto';
    this.minimap_el.style.bottom = 'auto';
  }

  add(id, obj) {
    this.markers[id] = obj;
    this.redraw_markers = true;
    this.render();
  }

  remove(id) {
    delete this.markers[id];
    this.redraw_markers = true;
    this.render();
  }

  clear() {
    this.markers = {};
    this.redraw_markers = true;
    this.render();
  }
}

module.exports = GameMinimap;
