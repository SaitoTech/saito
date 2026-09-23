const GameHudTemplate = require('./game-hud.template');

/**
 * The HUD is a general interface for users to interact with a (board) game.
 * Other than rendering and attaching events in your Game_Module, you will primarily interact
 * with GameHud indirectly. GameTemplate includes two functions for putting content into the HUD:
 *
 * updateStatusAndListCards -- display a status message (prompt) and graphical depiction of cards
 * updateStatusWithOptions -- display a status message (prompt) and a list of text commands
 *
 * HUD vs PlayerBox. HUD is best when information about game state is available on the game board
 * and we don't need persistent summaries of opponent statistics.
 *
 * GameHud is available in long (horizontal, along the bottom) and square modes.
 */
class GameHud {
  /**
   * @constructor
   * @param app - the Saito application
   * @param mod - the game module
   */
  constructor(app, mod) {
    this.app = app;
    this.game_mod = mod;
    this.is_draggable = 1;
    this.enable_mode_change = 0; //flag to allow users to toggle between hud-long and hud-square
    this.draggable_whole = true;
    this.hud_popup_timeout = null;
    this.back_button = false;
    this.back_button_callback = null;
    this.back_button_clicked = false;
    this.zIndex = 1;
    this.mode = 0; // 0 wide (HUD-long)
    // 1 classic (HUD-square)
    this.lastPosition = ''; //Remember where the hud was if toggling to hide offscreen
  }

  render() {
    //Needed for game engine to know to call HUD's internal updateStatus instead of basic updateStatus
    this.game_mod.useHUD = 1;

    if (!this.game_mod.browser_active) {
      return;
    }

    if (!document.querySelector('#hud')) {
      this.app.browser.addElementToDom(GameHudTemplate(this.enable_mode_change));
    }

    let hud = document.querySelector('#hud');

    if (this.mode >= 0 && this.mode <= 1) {
      hud.className = 'hud'; //Remove additional class names
      hud.removeAttribute('style'); //Remove all inline styling
    }

    switch (this.mode) {
      case 0:
        hud.classList.add('hud-long');
        hud.classList.add('hide-scrollbar');
        hud.style.top = '';
        break;
      case 1:
        hud.classList.add('hud-square');
        hud.classList.add('hide-scrollbar');
        break;
      default:
        console.error('Undefined HUD Mode');
    }

    hud.style.display = 'block';
    hud.style.zIndex = this.zIndex;
    this.attachEvents();
  }

  /**
   * HUD events:
   *    1) HUD can be dragged by the user to a new position
   *    2) HUD can be minimized/restored by clicking on an icon in its top right corner
   *    3) HUD mode can be toggled between available display modes (optional, requires changing the this.enable_mode_change property)
   */
  attachEvents() {
    let myself = this;
    try {
      if (this.is_draggable) {
        let drag_handle = this.draggable_whole ? 'hud' : 'hud-header';
        this.app.browser.makeDraggable('hud', drag_handle, true, () => {
          document.querySelector('.hud').classList.add('user_dragged');
        });
      }
    } catch (err) {
      console.log('HUD Events:', err);
    }
    try {
      let hud_toggle_button = document.getElementById('hud-toggle-button');
      if (hud_toggle_button) {
        hud_toggle_button.onclick = (e) => {
          e.stopPropagation();
          myself.toggleHud();
        };
      }
    } catch (err) {
      console.error('HUD Events:', err);
    }

    try {
      let hud_mode_button = document.getElementById('hud-mode-button');
      if (hud_mode_button) {
        hud_mode_button.onclick = (e) => {
          e.stopPropagation();
          myself.mode++;
          if (myself.mode > 1) {
            myself.mode = 0;
          }
          myself.render();
        };
      }
    } catch (err) {
      console.error('HUD Events:', err);
    }

    if (document.querySelector('.hud-notice')) {
      document.querySelector('.hud-notice').onclick = (e) => {
        this.hidePopup();
      };
    }
  }

  /**
   * (completely) hide Hud from the DOM
   */
  hide() {
    try {
      document.getElementById('hud').style.display = 'none';
    } catch (err) {}
  }

  updateStatus(msg) {
    if (this.back_button == true && this.back_button_callback != null) {
      this.back_button_clicked = false;
      msg = `<div class="back-button">${this.game_mod.back_button_html}</div>${msg}`;
    } else {
      msg = `<div class="back-button" style="display:none;">${this.game_mod.back_button_html}</div>${msg}`;
    }

    if (document.querySelector('.hud-body .status')) {
      document.querySelector('.hud-body .status').innerHTML = msg;
    }
    if (document.querySelector('.hud-body .status .back-button')) {
      document.querySelector('.hud-body .status .back-button').onclick = (e) => {
        this.back_button_clicked = true;
        this.back_button_callback();
      };
    }
  }

  updateControls(msg) {
    if (document.querySelector('#hud .controls')) {
      document.querySelector('#hud .controls').innerHTML = msg;
    }
  }

  //
  // regardless of whether we display CARDS (graphics) or OPTIONS (text)
  // we want to trigger the ability for users to click on the card and
  // have the ID submitted to the function provided. This takes care of
  // that issue, using the cardbox as needed.
  //
  attachControlCallback(mycallback = null) {
    if (this.game_mod.useCardbox) {
      this.game_mod.changeable_callback = mycallback;
      this.game_mod.cardbox.hide(1);
      this.game_mod.cardbox.attachCardEvents();
    }
    document.querySelectorAll('.controls ul li.option').forEach((opt) => {
      opt.onclick = (e) => {
        document.querySelectorAll('.controls ul li.option').forEach((opt) => {
          opt.onclick = (evt) => {};
          try {
            opt.remove();
          } catch (err) {}
        });
        let id = e.target.getAttribute('id');
        mycallback(id);
      };
    });
  }

  /**
   * Implement the toggle (slide on/offscreen) to minimize and restore HUD from display
   */
  toggleHud() {
    let hud = document.getElementById('hud');
    let hudToggle = document.getElementById('hud-toggle-button');
    if (!hud || !hudToggle) {
      console.error("Couldn't find HUD elements");
      return;
    }

    hudToggle.classList.toggle('fa-caret-up');
    hudToggle.classList.toggle('fa-caret-down');

    if (hudToggle.classList.contains('fa-caret-up')) {
      this.lastPosition = getComputedStyle(hud).top;
      hud.style.top = `${window.innerHeight - 20}px`;
      hud.style.marginTop = 'unset';
    } else {
      hud.style.top = this.lastPosition;
      hud.style.paddingTop = '';
      hud.style.background = '';
    }
  }

  hidePopup() {
    let hudnotice = document.querySelector('.hud-notice');
    if (hudnotice) {
      hudnotice.classList.remove('show');
      setTimeout(() => {
        hudnotice.style.display = 'none';
      }, 550);
    }
    clearTimeout(this.hud_popup_timeout);
  }

  showPopup(html = '', timeout = 0) {
    let hudnotice = document.querySelector('.hud-notice');

    if (hudnotice) {
      hudnotice.innerHTML = html;
      hudnotice.style.display = 'block';

      setTimeout(() => {
        hudnotice.classList.add('show');

        this.hud_popup_timeout = setTimeout(() => {
          this.hidePopup();
        }, timeout);
      }, 50);
    }
  }
}

module.exports = GameHud;
