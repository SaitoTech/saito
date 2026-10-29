const { escapeHTML } = require('./publish.escape');
const flow = require('./publish.flow');
const selectSlide = require('./publish.select');
const signSlide = require('./publish.sign');
const verifySlide = require('./publish.verify');
const shareSlide = require('./publish.share');
const premiumSlide = require('./publish.premium');

const slides = {
  select: selectSlide,
  identity: signSlide,
  sign: signSlide,
  verify: verifySlide,
  share: shareSlide,
  premium: premiumSlide
};

function primary(state) {
  switch (state.step) {
    case 'select':
      return { label: 'Continue', action: 'advance' };
    case 'identity':
      return null;
    case 'sign':
      return { label: 'Sign', action: 'advance', disabled: !state.identified };
    case 'verify':
      return { label: 'Continue', action: 'advance', disabled: !flow.requiredComplete(state) };
    case 'share':
      return null;
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
  const heading = slide.title
    ? `<h3 class="title">${escapeHTML(slide.title)}</h3>`
    : '';
  const subtitle = slide.subtitle
    ? `<p class="subtitle">${escapeHTML(slide.subtitle)}</p>`
    : '';
  const back = state.step === 'share'
    ? (!state.finalized && state.history.length
      ? `<button type="button" class="saito-button-square" data-publish-action="back" aria-label="Back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>`
      : '<span class="spacer"></span>')
    : state.history.length
      ? `<button type="button" class="saito-button-square" data-publish-action="back" aria-label="Back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>`
      : state.step === 'select'
        ? ''
        : '<span class="spacer"></span>';
  const forward = state.step === 'share'
    ? '<span class="spacer"></span>'
    : action
      ? `<button type="button" class="${action.disabled ? 'saito-button-secondary' : 'saito-button-primary'}" data-publish-action="${action.action}"${action.disabled ? ' disabled' : ''}>${escapeHTML(action.label)}</button>`
      : '<span class="spacer"></span>';

  return `
    <div class="saitosign-publish">
      <div class="content">
        <div class="viewport">
          <div id="saitosign-publish-step" class="step" data-step="${escapeHTML(state.step)}">
            ${heading}
            ${subtitle}
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
