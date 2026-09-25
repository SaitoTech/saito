const GameHud2Template = require('./game-hud2.template');

class GameHUD2 {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.drag_bound = false;
    this.esc_bound = false;
    this.back_button_callback = null;
  }

  render() {
    if (!this.mod.browser_active) {
      return;
    }

    if (!document.getElementById('game-hud2')) {
      this.app.browser.addElementToDom(GameHud2Template());
      this.drag_bound = false;
    }

    this.attachEvents();
  }

  attachEvents() {
    let hud = document.getElementById('game-hud2');
    if (!hud || this.drag_bound) {
      return;
    }

    let handle = hud.querySelector('.hud-status-row');
    if (!handle) {
      return;
    }

    this.drag_bound = true;

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) {
        return;
      }
      if (e.target.closest('.hud-back-button')) {
        return;
      }

      e.preventDefault();

      let rect = hud.getBoundingClientRect();
      hud.style.left = rect.left + 'px';
      hud.style.top = rect.top + 'px';
      hud.style.right = 'auto';
      hud.style.bottom = 'auto';
      hud.style.transform = 'none';

      let start_x = e.clientX;
      let start_y = e.clientY;
      let orig_left = rect.left;
      let orig_top = rect.top;

      let on_move = (ev) => {
        hud.style.left = orig_left + (ev.clientX - start_x) + 'px';
        hud.style.top = orig_top + (ev.clientY - start_y) + 'px';
      };

      let on_up = () => {
        document.removeEventListener('mousemove', on_move);
        document.removeEventListener('mouseup', on_up);
        document.body.style.userSelect = '';
      };

      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', on_move);
      document.addEventListener('mouseup', on_up);
    });

    if (!this.esc_bound) {
      this.esc_bound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' && e.keyCode !== 27) {
          return;
        }
        if (!this.back_button_callback) {
          return;
        }
        let t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        let cb = this.back_button_callback;
        this.hideBackButton();
        cb();
      });
    }
  }

  hide() {
    document.querySelectorAll('#game-hud2').forEach((el) => {
      el.style.display = 'none';
    });
    let visual_menu = document.getElementById('hud-visual-menu');
    if (visual_menu) {
      visual_menu.innerHTML = '';
      visual_menu.className = 'hud-visual-menu';
    }
    this.back_button_callback = null;
  }

  updateStatus(status) {
    this.render();
    document.querySelectorAll('.hud-status, .zoom-overlay .status, .saito-overlay .status').forEach((el) => {
      el.innerHTML = status;
    });
  }

  showBackButton(callback) {
    this.render();

    this.back_button_callback = typeof callback === 'function' ? callback : null;

    let html = this.mod.back_button_html;
    if (!html) {
      html = `<i class="fa fa-arrow-left" aria-hidden="true"></i>`;
    }

    document.querySelectorAll('.hud-back-button').forEach((el) => {
      el.innerHTML = html;
      el.style.display = 'inline-block';
      el.onclick = (e) => {
        e.stopPropagation();
        let cb = this.back_button_callback;
        this.hideBackButton();
        if (typeof cb === 'function') {
          cb();
        }
      };
    });
  }

  hideBackButton() {
    this.back_button_callback = null;
    document.querySelectorAll('.hud-back-button').forEach((el) => {
      el.style.display = 'none';
      el.onclick = null;
    });
  }

  updateMenu(options, callback) {
    this.render();

    if (!options) {
      options = [];
    }

    let html = '';
    if (options.length > 0) {
      html = '<ul>';
      for (let i = 0; i < options.length; i++) {
        html += `<li class="option" id="${options[i].id}">${options[i].label}</li>`;
      }
      html += '</ul>';
    }

    document.querySelectorAll('.hud-menu, .zoom-overlay .controls, .saito-overlay .controls').forEach((el) => {
      el.innerHTML = html;
      if (typeof callback === 'function') {
        el.querySelectorAll('.option').forEach((item) => {
          item.onclick = (e) => {
            callback(e.currentTarget.id);
          };
        });
      }
    });

    let visual_menu = document.getElementById('hud-visual-menu');
    if (!visual_menu) {
      return;
    }

    let visual_html = '';
    let visual_count = 0;
    for (let i = 0; i < options.length; i++) {
      if (!options[i].img) {
        continue;
      }
      visual_count++;
      let title = options[i].title || options[i].label;
      visual_html += `<div class="hud-visual-option" id="hud-visual-${options[i].id}" style="--hud-option-img: url('${options[i].img}')"><div class="hud-visual-option-title">${title}</div></div>`;
    }

    visual_menu.innerHTML = visual_html;
    visual_menu.className = 'hud-visual-menu';
    visual_menu.onclick = null;
    if (visual_count > 0) {
      visual_menu.classList.add('m' + Math.min(visual_count, 9));
      visual_menu.onclick = (e) => {
        if (e.target.closest('.hud-visual-option')) {
          return;
        }
        visual_menu.innerHTML = '';
        visual_menu.className = 'hud-visual-menu';
        visual_menu.onclick = null;
      };
      if (typeof callback === 'function') {
        visual_menu.querySelectorAll('.hud-visual-option').forEach((item) => {
          item.onclick = (e) => {
            let id = e.currentTarget.id;
            if (id.indexOf('hud-visual-') === 0) {
              id = id.substring('hud-visual-'.length);
            }
            callback(id);
          };
        });
      }
    }
  }

  updateCards(cards, callback) {
    this.render();

    let html = '';
    if (cards && cards.length > 0) {
      for (let i = 0; i < cards.length; i++) {
        let card_id = cards[i];
        html += `<div id="${card_id}" class="card ${card_id}">${this.mod.returnCardImage(card_id)}</div>`;
      }
    }

    document.querySelectorAll('.hud-cards').forEach((el) => {
      el.innerHTML = html;
      if (typeof callback === 'function') {
        el.querySelectorAll('.card').forEach((card) => {
          card.onclick = (e) => {
            callback(e.currentTarget.id);
          };
        });
      }
    });
  }
}

module.exports = GameHUD2;
