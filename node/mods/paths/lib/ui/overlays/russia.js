const RussiaTemplate = require('./russia.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

// Conditions follow Paths of Glory rule 16.4 (Russian Capitulation).
const STEPS = [
  {
    name: 'God Save the Tsar',
    note: '',
    next: 'The Central Powers control three or more VP spaces in Russia. The marker then moves to Tsar Takes Command Allowed, and that event may be played.',
    stop: 'Keep Central Powers control of Russian VP spaces below three.'
  },
  {
    name: 'Tsar Takes Command Allowed',
    note: '3+ Russian VP spaces',
    next: 'The Central Powers play Tsar Takes Command as an event. The marker then moves to Tsar Takes Command.',
    stop: 'Recapture Russian VP spaces so the Current CP Russian VP marker falls below 3 before that event is played. The capitulation marker returns to God Save the Tsar.'
  },
  {
    name: 'Tsar Takes Command',
    note: '',
    next: 'Combined War Status plus the Current CP Russian VP reaches 33 or higher. The marker then moves to Fall of the Tsar Allowed.',
    stop: 'Keep Combined War Status plus the Current CP Russian VP below 33.'
  },
  {
    name: 'Fall of the Tsar Allowed',
    note: 'War Status + Current CP Russian VP = 33+',
    next: 'The Central Powers play Fall of the Tsar as an event. The marker moves to Fall of the Tsar, and the Tsar Fell CP Russian VP marker is set to the Current CP Russian VP.',
    stop: 'Bring Combined War Status plus the Current CP Russian VP back below 33 before the event is played. The marker returns to Tsar Takes Command until the total is 33 or higher again.'
  },
  {
    name: 'Fall of the Tsar',
    note: '',
    next: 'On a turn after Fall of the Tsar, either the Current CP Russian VP marker is higher than the Tsar Fell CP Russian VP marker (a captured Baku counts), or the Central Powers control all seven VP spaces in Russia, excluding Baku. The marker then moves to Bolshevik Revolution Allowed.',
    stop: 'Do not let the Central Powers gain Russian VP spaces beyond the level recorded when the Tsar fell, and do not let them hold all seven VP spaces in Russia (excluding Baku).'
  },
  {
    name: 'Bolshevik Revolution Allowed',
    note: 'CP Russian VP > Tsar Fell CP Russian VP marker *',
    next: 'The Central Powers play Bolshevik Revolution as an event. It cannot be played before the turn after Fall of the Tsar. The marker then moves to Bolshevik Revolution.',
    stop: 'Bring the Current CP Russian VP marker back to the Tsar Fell level or below, and deny the Central Powers all seven VP spaces in Russia. The marker returns to Fall of the Tsar until one of those conditions is true again.'
  },
  {
    name: 'Bolshevik Revolution',
    note: '',
    next: 'The Central Powers play Treaty of Brest-Litovsk. The marker moves to Treaty of Brest-Litovsk and Russia is forced out of the war.',
    stop: 'This step does not retreat. Prevent the Central Powers from playing Treaty of Brest-Litovsk.'
  },
  {
    name: 'Treaty of Brest-Litovsk',
    note: '',
    next: 'The track is complete. Russia has left the war. Russian units may not attack, may not operate outside Russia, Germany, Turkey, Austria, and Romania, and may not move through or stack with Allied units.',
    stop: 'Nothing sends the marker back. The treaty has already been played.'
  }
];

const EMPHASIS = [
  'Tsar Takes Command',
  'Fall of the Tsar',
  'Bolshevik Revolution',
  'Treaty of Brest-Litovsk',
  'Combined War Status',
  'Current CP Russian VP',
  'Tsar Fell CP Russian VP',
  'three or more',
  'below three',
  'below 3',
  '33 or higher',
  'below 33',
  'all seven'
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

class RussiaOverlay {
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
      position = parseInt(this.mod.game.state.russian_capitulation_track, 10);
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
    this.overlay.show(RussiaTemplate());
    this.pushHudUnderOverlay();
    this.buildTrack();
    this.showStep(this.current);
    this.attachEvents();
  }

  buildTrack() {
    let track = document.querySelector('.russia-overlay .paths-track-grid');
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
    let root = document.querySelector('.russia-overlay');
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
    let root = document.querySelector('.russia-overlay');
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

module.exports = RussiaOverlay;
