const GameTemplate = require('./game.template');

class GamePage {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.gameId = '';
    this.stick = true;
  }

  render() {
    const gameId = this.mod.manager.gameIdFromHash();
    this.gameId = gameId;

    const html = GameTemplate();
    const existing = document.querySelector('.gamebot-container');
    if (existing) {
      existing.outerHTML = html;
    } else {
      this.app.browser.addElementToDom(html);
    }

    const session = this.mod.manager.captureContext(gameId);
    const heading = document.querySelector('.gamebot-game-heading');
    if (heading) {
      heading.textContent = session?.record
        ? session.record.module + ' · ' + session.record.status
        : 'Game not tracked';
    }

    const note = document.querySelector('.gamebot-board-note');
    if (note) {
      note.textContent = this.mod.dom.limitation;
    }

    const board = document.querySelector('.gamebot-board');
    if (board && session?.gameMod) {
      try {
        this.mod.dom.mount(session.gameMod, board);
      } catch (err) {
        board.textContent = err.message || 'The board could not be opened';
      }
    }

    this.drawLog();
    this.drawCurrent(session);
    this.attachEvents(session);
    this.mod.manager.onNote = (id) => {
      if (id === this.gameId && document.querySelector('.gamebot-log')) {
        this.drawLog();
        const current = this.mod.manager.ensure()[id];
        const gameMod = current ? this.mod.manager.gameModule(current.module) : null;
        if (gameMod?.game?.id === id) {
          this.mod.dom.paint(gameMod);
          this.drawCurrent({ gameMod, record: current });
        }
      }
    };
  }

  drawLog() {
    const log = document.querySelector('.gamebot-log');
    if (!log) {
      return;
    }
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    log.replaceChildren();
    for (const entry of this.mod.manager.log(this.gameId)) {
      const block = document.createElement('article');
      block.className = 'gamebot-log-entry';
      const head = document.createElement('header');
      head.textContent = '#' + entry.seq + '  ' + entry.at;
      block.append(head);
      if (entry.kind === 'activity') {
        const line = document.createElement('p');
        line.textContent = entry.text || '';
        block.append(line);
      } else {
        const reason = document.createElement('p');
        reason.textContent = entry.analysis?.reason || '';
        const body = document.createElement('pre');
        body.textContent = formatContext(entry.analysis?.context);
        block.append(reason, body);
      }
      log.append(block);
    }
    if (this.stick || nearBottom) {
      log.scrollTop = log.scrollHeight;
    }
    this.stick = false;
  }

  drawCurrent(session) {
    const decision = document.querySelector('.gamebot-decision');
    const list = document.querySelector('.gamebot-interactions');
    if (!decision || !list) {
      return;
    }
    const gameMod = session?.gameMod;
    const analysis = gameMod
      ? this.mod.ai.analyseMove(gameMod, this.mod.dom.interactions(gameMod))
      : session?.analysis;
    decision.textContent = analysis?.reason || 'This game has not reported context yet.';
    list.replaceChildren();
    const interactions = analysis?.interactions || [];
    interactions.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'saito-button-secondary';
      button.textContent = index + 1 + '. ' + item.id + ' — ' + item.label;
      button.onclick = () => {
        const field = document.querySelector('.gamebot-response [name="response"]');
        if (field) {
          field.value = String(index + 1);
        }
        this.submit(String(index + 1));
      };
      list.append(button);
    });
    if (!interactions.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No interactions are attached.';
      list.append(empty);
    }
  }

  attachEvents() {
    const back = document.querySelector('.gamebot-back');
    if (back) {
      back.onclick = () => {
        window.location.hash = '';
      };
    }
    const form = document.querySelector('.gamebot-response');
    if (!form) {
      return;
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      const field = form.querySelector('[name="response"]');
      this.submit(field.value);
      field.value = '';
    };
    const log = document.querySelector('.gamebot-log');
    if (log) {
      log.onscroll = () => {
        const distance = log.scrollHeight - log.scrollTop - log.clientHeight;
        this.stick = distance < 48;
      };
    }
  }

  async submit(response) {
    const record = this.mod.manager.ensure()[this.gameId];
    const gameMod = record ? this.mod.manager.gameModule(record.module) : null;
    if (!gameMod) {
      this.notice('That game is not installed');
      return;
    }
    this.notice('Sending response...');
    try {
      const chosen = await this.mod.ai.executeMove(gameMod, response, this.mod.dom);
      this.notice('Ran ' + chosen.id);
      this.mod.manager.captureContext(this.gameId);
      this.drawCurrent({ gameMod, record });
    } catch (err) {
      this.notice(err.message || 'The interaction failed');
    }
  }

  notice(text) {
    const el = document.querySelector('.gamebot-notice');
    if (el) {
      el.textContent = text || '';
    }
  }
}

function formatContext(context) {
  try {
    return JSON.stringify(context ?? {}, null, 2);
  } catch (err) {
    return err.message || 'Context could not be formatted';
  }
}

module.exports = GamePage;
