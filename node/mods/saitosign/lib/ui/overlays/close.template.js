function closeTemplate(mode, busy) {
  const disabled = busy ? ' disabled' : '';
  if (mode === 'saved') {
    return `
      <form class="saitosign-close">
        <p class="title">You've downloaded this document.</p>
        <p class="note">You can now close this document or return to continue editing. Any changes you make after this export will not be included in the downloaded copy.</p>
        <div class="actions">
          <button type="button" data-close="leave">Close document</button>
          <button type="button" class="primary" data-close="cancel">Continue editing</button>
        </div>
      </form>
    `;
  }

  const status = mode === 'exporting'
    ? '<p class="note">Preparing your download...</p>'
    : mode === 'error'
      ? '<p class="note fail">That document could not be exported. You can try again or continue editing.</p>'
      : '';
  return `
    <form class="saitosign-close">
      <p class="title">Do you want to close this document?</p>
      ${status}
      <div class="actions">
        <button type="button" data-close="leave"${disabled}>Yes, close the document</button>
        <button type="button" class="primary" data-close="export"${disabled}>Export a copy to continue working later</button>
        <button type="button" data-close="cancel"${disabled}>Continue editing</button>
      </div>
    </form>
  `;
}

module.exports = closeTemplate;
