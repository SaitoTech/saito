const { escapeHTML } = require('./publish.escape');
const flow = require('./publish.flow');
const selectSlide = require('./publish.select');
const signSlide = require('./publish.sign');
const verifySlide = require('./publish.verify');
const shareSlide = require('./publish.share');
const premiumSlide = require('./publish.premium');

const slides = {
  select: selectSlide,
  sign: signSlide,
  verify: verifySlide,
  share: shareSlide,
  premium: premiumSlide
};

function primary(state) {
  switch (state.step) {
    case 'select':
      return { label: 'Continue', action: 'advance', disabled: !state.identified };
    case 'sign':
      return { label: 'Sign', action: 'advance' };
    case 'verify':
      return { label: 'Continue', action: 'advance', disabled: !flow.requiredComplete(state) };
    case 'share':
      return { label: 'Download SaitoSign Document', action: 'share' };
    case 'premium': {
      const from = state.history[state.history.length - 1];
      if (from && from !== 'select') {
        return { label: 'Back to signing', action: 'back' };
      }
      return { label: 'Continue with Free', action: 'advance' };
    }
    default:
      return { label: 'Continue', action: 'advance' };
  }
}

function publishTemplate(state) {
  const slide = (slides[state.step] || selectSlide)(state);
  const action = primary(state);
  const back = state.history.length
    ? `<button type="button" class="saito-button-square" data-publish-action="back" aria-label="Back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>`
    : state.step === 'select'
      ? `<button type="button" class="saito-text-link draft-export" data-publish-action="export-draft">export draft</button>`
      : '<span class="spacer"></span>';
  const forward = action
    ? `<button type="button" class="${action.disabled ? 'saito-button-secondary' : 'saito-button-primary'}" data-publish-action="${action.action}"${action.disabled ? ' disabled' : ''}>${escapeHTML(action.label)}</button>`
    : '<span class="spacer"></span>';

  return `
    <div class="saitosign-publish">
      <div class="content">
        <div class="viewport">
          <div id="saitosign-publish-step" class="step" data-step="${escapeHTML(state.step)}">
            <h3 class="title">${escapeHTML(slide.title)}</h3>
            <div class="stage">${slide.body}</div>
          </div>
        </div>
        <div class="actions">
          <div class="actions-left">${back}</div>
          ${forward}
        </div>
      </div>
    </div>
  `;
}

module.exports = publishTemplate;
