/**
 * Lightweight event controller for the observer timeline slider.
 * The slider DOM (#game-observer-state-slider) is owned by the HUD template.
 * This component only binds input and change events.
 */
class GameObserverSlider {

  constructor(app, observerOrGameMod, container = '', observer) {

    this.app = app || null;
    this.observer = observer != null ? observer : observerOrGameMod;

  }

  /**
   * Bind events to the HUD's slider element (#game-observer-state-slider).
   * Call after HUD has rendered.
   */
  attachToSliderElement(root) {

    const slider = root ? root.querySelector('#game-observer-state-slider') : null;

    if (!slider) return;

    const timelineTooltip = root.querySelector('#observer-timeline-tooltip');

    slider.addEventListener('input', () => {

      const idx = parseInt(slider.value, 10);

      if (Number.isNaN(idx)) return;

      const total = this.observer?.all_moves?.length ?? 0;

      const max = Math.max(0, total - 1);

      const progress = max > 0 ? `${(idx / max) * 100}%` : '0%';

      slider.style.setProperty('--progress', progress);

      if (timelineTooltip && total > 0) {

        timelineTooltip.textContent = `Move ${idx + 1}`;

        timelineTooltip.classList.add('visible');

        timelineTooltip.setAttribute('aria-hidden', 'false');

      }

    });

    slider.addEventListener('change', () => {

      const idx = parseInt(slider.value, 10);

      if (Number.isNaN(idx)) return;

      if (timelineTooltip) {

        timelineTooltip.classList.remove('visible');

        timelineTooltip.textContent = '';

        timelineTooltip.setAttribute('aria-hidden', 'true');

      }

      if (this.observer && typeof this.observer.replayToIndex === 'function') {

        this.observer.replayToIndex(idx);

      }

    });

  }

  /**
   * No-op: slider DOM is owned by the HUD. When the HUD is removed, the slider is removed with it.
   */
  remove() {

  }

}

module.exports = GameObserverSlider;
