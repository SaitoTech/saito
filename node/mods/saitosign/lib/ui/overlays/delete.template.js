function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deleteTemplate(view = {}) {
  const label = String(view.label || '').trim();
  const subject = label ? `<p class="subject">${escapeHTML(label)}</p>` : '';
  const documentName = String(view.documentName || '').trim();
  const documentCopy = documentName
    ? `Remove this item from every page of ${documentName} only.`
    : 'Remove this item from every page of the current PDF only.';
  const singleDocument = Number(view.documentCount) === 1;
  const everyCopy = singleDocument
    ? 'Remove this item from every page across the uploaded document.'
    : 'Remove this item from every page across all uploaded documents.';
  const documentChoice = singleDocument
    ? ''
    : `
        <button type="button" class="choice" data-delete-scope="document">
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
          <span class="choice-text">
            <span class="choice-title">Every page in this document</span>
            <span class="choice-copy">${escapeHTML(documentCopy)}</span>
          </span>
        </button>
      `;

  return `
    <form class="saitosign-delete">
      <p class="title">Delete item</p>
      ${subject}
      <p class="prompt">Where would you like to delete this item?</p>
      <div class="choices">
        <button type="button" class="choice" data-delete-scope="all">
          <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
          <span class="choice-text">
            <span class="choice-title">Every page</span>
            <span class="choice-copy">${everyCopy}</span>
          </span>
        </button>
        ${documentChoice}
        <button type="button" class="choice" data-delete-scope="instance">
          <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
          <span class="choice-text">
            <span class="choice-title">Only this item</span>
            <span class="choice-copy">Remove just this individual instance.</span>
          </span>
        </button>
      </div>
      <div class="actions">
        <button type="button" data-delete-cancel>Cancel</button>
      </div>
    </form>
  `;
}

module.exports = deleteTemplate;
