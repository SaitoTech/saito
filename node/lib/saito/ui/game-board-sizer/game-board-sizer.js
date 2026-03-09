const GameBoardSizerTemplate = require('./game-board-sizer.template');

/**
 * TODO - remove JQUERY
 * Adds a slider to screen to allow players to magnify or shrink the game board
 * Will check user's saved game preferences for the size of the board, or do some math to fill the screen (but not overflow) with the gameboard (can specify sizing target in attachEvents)
 * Included by default in gameTemplate as "sizer", must call render/attachEvents in individual game module to display and use it (preferably in initializeHTML function)
 */
class GameBoardSizer {
  /**
   * @constructor
   * @param app - the Saito application
   */
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.maxZoom = 200;
    this.container = '.hamburger-container';
  }

  /**
   * Creates the gameBoardSizer if it does not already exist
   * @param selector - DOM reference for where to attach the gameBoardSizer, default = body
   */
  render(selector = '') {
    try {
      if (!document.getElementById('game_board_sizer')) {
        if (selector) {
          this.app.browser.addElementToSelector(GameBoardSizerTemplate(this.maxZoom), selector);
        } else {
          this.app.browser.prependElementToSelector(
            GameBoardSizerTemplate(this.maxZoom),
            this.container
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Adds event listener to slider and makes target draggable (via JQuery). Changes to the board size and position are saved for subsequent game loads
   * @param target - DOM reference to object to be scaled in size
   *
   */
  attachEvents(target = '#gameboard') {
    const sizer_self = this;
    const targetObject = document.querySelector(target);

    if (!targetObject) {
      console.error(target + ' not found');
      return;
    }

    if (!this.rendered) {
      this.app.connection.on('browser-fullscreen-toggle', () => {
	try {
          centerBoard(document.querySelector('#game_board_sizer input'));
	} catch (err) {}
      });
      this.rendered = true;
    }

    let centerBoard = (input) => {
      let topAdjustment = 0;
      let boardWidth = parseInt(window.getComputedStyle(targetObject).width) || 0;
      let boardHeight = parseInt(window.getComputedStyle(targetObject).height) || 0;
      if (window.getComputedStyle(targetObject).boxSizing == 'content-box') {
        boardWidth +=
          parseInt(window.getComputedStyle(targetObject).paddingLeft) +
          parseInt(window.getComputedStyle(targetObject).paddingRight);
        boardHeight +=
          parseInt(window.getComputedStyle(targetObject).paddingTop) +
          parseInt(window.getComputedStyle(targetObject).paddingBottom);
        topAdjustment += parseInt(window.getComputedStyle(targetObject).paddingTop);
      }
      boardWidth +=
        parseInt(window.getComputedStyle(targetObject).marginLeft) +
        parseInt(window.getComputedStyle(targetObject).marginRight);
      boardHeight +=
        parseInt(window.getComputedStyle(targetObject).marginTop) +
        parseInt(window.getComputedStyle(targetObject).marginBottom);
      topAdjustment += parseInt(window.getComputedStyle(targetObject).marginTop);

      let screenRatio = Math.min(window.innerWidth / boardWidth, window.innerHeight / boardHeight);

      input.value = Math.floor(100 * screenRatio);
      targetObject.style.transformOrigin = 'top left';
      targetObject.style.transform = `scale(${input.value / 100})`;
      targetObject.style.left = '';
      targetObject.style.top = '';

      if (targetObject.getBoundingClientRect().width < window.innerWidth) {
        let offset =
          Math.round((window.innerWidth - targetObject.getBoundingClientRect().width) / 2) - 10;
        targetObject.style.left = offset + 'px';
      }

      if (targetObject.getBoundingClientRect().height < window.innerHeight) {
        let offset = 0;
        if (window.innerHeight - targetObject.getBoundingClientRect().height >= 40) {
          offset = Math.min(50, window.innerHeight - targetObject.getBoundingClientRect().height);
        } else {
          offset =
            Math.round((window.innerHeight - targetObject.getBoundingClientRect().height) / 2) + 5;
        }
        offset = Math.max(0, offset - topAdjustment);
        targetObject.style.top = offset + 'px';
      }
    };

    // adjust scale
    let boardScaler = document.querySelector('#game_board_sizer input');
    if (boardScaler) {
      try {
        if (sizer_self.mod.loadGamePreference(sizer_self.mod.returnSlug() + '-board-scale')) {
          boardScaler.value = sizer_self.mod.loadGamePreference(
            sizer_self.mod.returnSlug() + '-board-scale'
          );
          sizer_self.scaleBoard(targetObject);
        } else {
          setTimeout(centerBoard, 250, boardScaler);
        }
      } catch (err) {
        sizer_self.mod.deleteGamePreference(sizer_self.mod.returnSlug() + '-board-scale');
        console.error(err);
      }

      boardScaler.addEventListener('change', () => {
        sizer_self.scaleBoard(targetObject);
      });
    }

    $('#game_board_sizer i').off();
    $('#game_board_sizer i').on('click', function () {
      centerBoard(document.querySelector('#game_board_sizer input'));
      sizer_self.mod.saveGamePreference(
        sizer_self.mod.returnSlug() + '-board-scale',
        document.querySelector('#game_board_sizer input').value
      );
    });

    // and adjust positioning
    try {
      let boardoffset = sizer_self.mod.loadGamePreference(
        sizer_self.mod.returnSlug() + '-board-offset'
      );
      if (boardoffset) {
        $(target).offset(boardoffset);
      }
    } catch (err) {
      sizer_self.mod.deleteGamePreference(sizer_self.mod.returnSlug() + '-board-offset');
      console.error(err);
    }

    // and make draggable
    $(target).draggable({
      stop: function (event, ui) {
        sizer_self.mod.saveGamePreference(sizer_self.mod.returnSlug() + '-board-offset', ui.offset);
      }
    });
  }

  /**
   * Internal function to scale targetObject based on slider
   * @param targetObject - by default, the "#gameboard" DOM object
   *
   */
  scaleBoard(targetObject) {
    targetObject.style.transform = `scale(${
      document.querySelector('#game_board_sizer input').value / 100
    })`;
    this.mod.saveGamePreference(
      this.mod.returnSlug() + '-board-scale',
      document.querySelector('#game_board_sizer input').value
    );
  }
}

module.exports = GameBoardSizer;
