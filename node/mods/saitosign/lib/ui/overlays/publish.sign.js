const { keyPreviewHTML } = require('./publish.escape');

function signSlide(state) {
  const count = Number(state.places) || 0;
  const places = count === 1 ? '1 place' : `${count} places`;
  return {
    title: `Your signature is still required in ${places}...`,
    body: `
      <div class="sign-step">
        ${keyPreviewHTML(state.you)}
        <p>Click the button below to confirm that you have read the document and add your signature as required. You may also <button type="button" class="review-link" data-publish-action="review">review the document</button> and add your signature manually.</p>
      </div>
    `
  };
}

module.exports = signSlide;
