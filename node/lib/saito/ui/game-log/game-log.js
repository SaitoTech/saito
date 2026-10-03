const GameLogTemplate = require('./game-log.template');

/**
 * Creates a sidebar window for a reverse-ordered list of moves that have occurred in the game.
 * By default, only displays the most recent 150 log messages and will refuse to display consecutive identical messages
 * Included in GameTemplate by default and accessible through property: log.
 * Functionality completely encoded within gameTemplate through wrapper functions updateLog (to add a message)
 * but must call render (in initializeHTML) when we want a log in our game
 *
 */
class GameLog {
  /**
   *  @constructor
   *  @param app - Saito app
   *  @param mod - reference to the game module
   */
  constructor(app, mod) {
    this.app = app;
    this.game_mod = mod;

    this.rendered = false;
    this.logs = [];
    this.log_length = 150;
    this.logs_last_msg = '';
    this.event_listeners = {};
  }

  /**
   * Adds Log to the DOM
   */
  render() {
    try {
      if (this.logs.length === 0) {
        this.logs = [...this.game_mod.game.log];
      }
    } catch (err) {}

    if (this.logs_last_msg === '' && this.logs.length > 0) {
      this.logs_last_msg = this.entryText(this.logs[0]);
    }
    if (!document.querySelector('#log')) {
      this.app.browser.addElementToDom(GameLogTemplate());
      this.attachEvents();
    }
    const log = document.getElementById('log');
    if (log) {
      log.innerHTML = this.logs
        .slice(0, this.log_length)
        .map((line) => `<div>> ${this.renderEntry(line)}</div>`)
        .join('');
    } else {
      console.error('Unable to render game log');
    }

    this.rendered = true;
  }

  /**
   * Adds functionality to open/close log by clicking (with some tolerance for click-drag actions
   */
  attachEvents() {
    let xpos = 0;
    let ypos = 0;

    document.querySelector('#log').onmousedown = (e) => {
      xpos = e.clientX;
      ypos = e.clientY;
    };
    document.querySelector('#log').onmouseup = (e) => {
      if (Math.abs(xpos - e.clientX) > 4 || Math.abs(ypos - e.clientY) > 4) {
        return;
      }
      this.toggleLog();
    };

    document.querySelector('.mobile-log-tab').onclick = (e) => {
      this.toggleLog();
    };
  }

  /**
   * Internal function to toggle display of the log
   */
  toggleLog() {
    document.querySelector('#log-wrapper').classList.toggle('log-lock');
  }

  /**
   * Prepend a log entry and re-render.
   * An event type is stored with the entry. It changes rendering only when a listener is registered for that type.
   * @param log_str - the message to prepend to the log
   * @param eventType - optional event type, ignored when no listener is registered
   * @param data - optional structured payload stored with a typed entry
   */
  updateLog(log_str, eventType = '', data = null) {
    this.logs_last_msg = log_str;
    let type = typeof eventType === 'string' ? eventType.trim() : '';
    if (type) {
      this.logs.unshift({ msg: log_str, type, data });
    } else {
      this.logs.unshift(log_str);
    }
    this.render(this.app, this.game_mod);
  }

  /**
   * Register a renderer for one event type.
   * The listener is called from render with an array of the entries for that line.
   * It should return the HTML string for the line. Any other return value leaves the plain message in place.
   * @param type - event type passed to updateLog
   * @param listener - function(entries) => string
   */
  registerEventType(type, listener) {
    if (!type || typeof listener !== 'function') {
      return;
    }
    this.event_listeners[type] = listener;
    if (this.rendered) {
      this.render();
    }
  }

  entryText(entry) {
    if (entry != null && typeof entry === 'object') {
      return entry.msg != null ? entry.msg : '';
    }
    return entry != null ? entry : '';
  }

  renderEntry(entry) {
    let text = this.entryText(entry);
    if (entry == null || typeof entry !== 'object' || !entry.type) {
      return text;
    }
    let listener = this.event_listeners[entry.type];
    if (typeof listener !== 'function') {
      return text;
    }
    try {
      let interpreted = listener([entry]);
      if (typeof interpreted === 'string') {
        return interpreted;
      }
    } catch (err) {}
    return text;
  }
}

module.exports = GameLog;
