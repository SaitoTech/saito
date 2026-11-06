const UsaTemplate = require('./usa.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

// Conditions follow Paths of Glory rule 16.3 (US Entry).
const STEPS = [
  {
    name: 'U.S. Neutral',
    note: '',
    next: 'Combined War Status reaches 30. The marker then moves to Zimmermann Telegram Allowed, and that event may be played.',
    stop: 'Keep Combined War Status below 30.'
  },
  {
    name: 'Zimmermann Telegram Allowed',
    note: 'War Status 30+',
    next: 'The Allies play Zimmermann Telegram as an event. The marker moves to Zimmermann Telegram. The United States becomes an active Allied nation, but US Reinforcement cards still may not be played.',
    stop: 'Keep the Allies from playing Zimmermann Telegram. Once Combined War Status has reached 30, the marker does not move back.'
  },
  {
    name: 'Zimmermann Telegram',
    note: '',
    next: 'On the turn after Zimmermann Telegram, the Allies play Over There. The marker moves to Over There, and US Reinforcement cards may be played, no more than one per turn.',
    stop: 'This step does not retreat. Over There cannot be played on the same turn as Zimmermann Telegram.'
  },
  {
    name: 'Over There!',
    note: '',
    next: 'The track is complete. The United States is fully in the war. The Allies may play US Reinforcement cards, but not more than one per turn.',
    stop: 'Nothing sends the marker back. The United States has entered the war.'
  }
];

const EMPHASIS = [
  'Zimmermann Telegram',
  'Over There',
  'Combined War Status',
  'US Reinforcement',
  'below 30',
  'reaches 30'
];

function emphasize(text) {
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  let terms = EMPHASIS.slice().sort((a, b) => b.length - a.length);
  for (let i = 0; i < terms.length; i++) {
    html = html.split(terms[i]).join('<strong>' + terms[i] + '</strong>');
  }
  return html;
}

class UsaOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.current = 1;
  }

  hide() {
    this.overlay.hide();
  }

  currentPosition() {
    let position = 1;
    try {
      position = parseInt(this.mod.game.state.us_commitment_track, 10);
    } catch (err) {
      position = 1;
    }
    if (position < 1 || position > STEPS.length) {
      position = 1;
    }
    return position;
  }

  render() {
    this.current = this.currentPosition();
    this.overlay.show(UsaTemplate());
    this.pushHudUnderOverlay();
    this.buildTrack();
    this.showStep(this.current);
    this.attachEvents();
  }

  buildTrack() {
    let track = document.querySelector('.usa-overlay .paths-track-grid');
    if (!track) {
      return;
    }

    let html = '';
    for (let i = 0; i < STEPS.length; i++) {
      let step = i + 1;
      let note = STEPS[i].note ? `<span class="paths-stage-note">${STEPS[i].note}</span>` : '';
      let index = String(step).padStart(2, '0');
      html += `
        <button type="button" class="paths-stage" data-step="${step}">
          <span class="paths-stage-index">${index}</span>
          <span class="paths-stage-name">${STEPS[i].name}</span>
          ${note}
          <span class="paths-stage-badge">Current</span>
        </button>
      `;
    }
    track.innerHTML = html;

    let current = track.querySelector(`.paths-stage[data-step="${this.current}"]`);
    if (current) {
      current.classList.add('is-current');
      current.setAttribute('aria-current', 'true');
    }
  }

  showStep(step) {
    let index = parseInt(step, 10);
    if (index < 1 || index > STEPS.length) {
      index = this.current;
    }
    let entry = STEPS[index - 1];
    let root = document.querySelector('.usa-overlay');
    if (!root || !entry) {
      return;
    }

    root.querySelectorAll('.paths-stage').forEach((el) => {
      el.classList.toggle('is-focus', parseInt(el.dataset.step, 10) === index);
    });
    root.querySelector('.paths-track-focus').textContent = entry.name;
    root.querySelector('.paths-track-next').innerHTML = emphasize(entry.next);
    root.querySelector('.paths-track-stop').innerHTML = emphasize(entry.stop);
  }

  attachEvents() {
    let root = document.querySelector('.usa-overlay');
    if (!root) {
      return;
    }

    root.querySelectorAll('.paths-stage').forEach((el) => {
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') {
          this.showStep(el.dataset.step);
        }
      });
      el.addEventListener('focus', () => {
        this.showStep(el.dataset.step);
      });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.showStep(el.dataset.step);
      });
    });

    let board = root.querySelector('.paths-track-board');
    if (board) {
      board.addEventListener('pointerleave', (e) => {
        if (!e.pointerType || e.pointerType === 'mouse') {
          this.showStep(this.current);
        }
      });
    }
  }

  pushHudUnderOverlay() {
    let overlay_zindex = parseInt(this.overlay.zIndex);
    let hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = overlay_zindex - 2;
    }
  }
}

module.exports = UsaOverlay;
