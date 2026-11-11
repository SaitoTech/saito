const { escapeHTML } = require('./publish.escape');
const flow = require('./publish.flow');
const selectSlide = require('./publish.select');
const signSlide = require('./publish.sign');
const verifySlide = require('./publish.verify');
const shareSlide = require('./publish.share');
const readySlide = shareSlide.readySlide;
const decideSlide = shareSlide.decideSlide;
const shareFlowSlide = require('./distribute.template');
const premiumSlide = require('./publish.premium');
const signerSlide = require('./signer-audit.template');

const slides = {
  select: selectSlide,
  identity: signSlide,
  sign: signSlide,
  verify: verifySlide,
  share: shareSlide,
  ready: readySlide,
  'decide-sign': decideSlide,
  premium: premiumSlide,
  'share-method': shareFlowSlide,
  'share-manual': shareFlowSlide,
  'share-exported': shareFlowSlide,
  'share-privacy': shareFlowSlide,
  'share-password': shareFlowSlide,
  'share-recipients': shareFlowSlide,
  'share-progress': shareFlowSlide,
  'share-sent': shareFlowSlide,
  'share-unlock': shareFlowSlide,
  'share-retry': shareFlowSlide,
  signer: signerSlide
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
    case 'signer':
    case 'ready':
    case 'decide-sign':
    case 'share-method':
    case 'share-privacy':
    case 'share-exported':
    case 'share-progress':
    case 'share-sent':
      return null;
    case 'share-manual':
      return { label: 'Export Document', action: 'share-export' };
    case 'share-password':
      return { label: 'Continue', action: 'share-password' };
    case 'share-recipients':
      return { label: 'Send emails', action: 'share-upload', disabled: state.shareView?.busy === true };
    case 'share-unlock':
      return { label: 'Unlock Document', action: 'share-unlock', disabled: state.shareView?.busy === true };
    case 'share-retry':
      return {
        label: state.shareView?.conflict ? 'Reload latest document' : 'Retry Upload',
        action: state.shareView?.conflict ? 'share-reload' : 'share-retry',
        disabled: state.shareView?.busy === true
      };
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

function canGoBack(state) {
  if (state.shareView?.busy || state.step === 'share-sent') {
    return false;
  }
  if (
    state.entry === 'recipient' &&
    !state.history.length &&
    (state.step === 'share-method' || state.step === 'share-recipients' || state.step === 'share-manual')
  ) {
    return true;
  }
  return state.history.length > 0;
}

function publishTemplate(state) {
  const slide = (slides[state.step] || selectSlide)(state);
  const action = primary(state);
  const back = canGoBack(state)
    ? `<button type="button" class="saito-button-square" data-publish-action="back" aria-label="Back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>`
    : '';
  const heading = slide.title
    ? `<div class="step-head">${back}<h3 class="title">${escapeHTML(slide.title)}</h3></div>`
    : '';
  const subtitle = slide.subtitle
    ? `<p class="subtitle">${escapeHTML(slide.subtitle)}</p>`
    : '';
  const disclosure = slide.disclosure
    ? `<p class="disclosure">${escapeHTML(slide.disclosure)}</p>`
    : '';
  const choiceScreen = state.step === 'share' || state.step === 'signer' || state.step === 'ready' || state.step === 'decide-sign' || state.step === 'share-method' || state.step === 'share-privacy' || state.step === 'share-exported' || state.step === 'share-progress' || state.step === 'share-sent';
  const forward = !choiceScreen && action
    ? `<button type="button" class="${action.disabled ? 'saito-button-secondary' : 'saito-button-primary'}" data-publish-action="${action.action}"${action.disabled ? ' disabled' : ''}>${escapeHTML(action.label)}</button>`
    : '';

  return `
    <div class="saitosign-publish">
      <div class="content">
        <div class="viewport">
          <div id="saitosign-publish-step" class="step" data-step="${escapeHTML(state.step)}"${canGoBack(state) ? ' data-has-back="1"' : ''}>
            ${heading}
            ${subtitle}
            ${disclosure}
            <div class="stage">${slide.body}</div>
          </div>
        </div>
        ${forward ? `<div class="actions">${forward}</div>` : ''}
      </div>
    </div>
  `;
}

module.exports = publishTemplate;
