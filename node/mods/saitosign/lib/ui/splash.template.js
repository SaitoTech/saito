function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stepsHTML() {
  return `
    <section class="steps" aria-label="How to sign a document">
      <ol>
        <li>
          <p class="title">Upload Document</p>
          <p>Provide a PDF file or SaitoSign doc prepared for your signature.</p>
        </li>
        <li>
          <p class="title">Add Signatures</p>
          <p>SaitoSign Documents show you exactly where each party needs to sign.</p>
        </li>
        <li>
          <p class="title">Sign and Share</p>
          <p>Sign it yourself and share it with others to collect their signatures.</p>
        </li>
      </ol>
    </section>
  `;
}

function uploadedSummary(count) {
  if (count === 1) {
    return 'Your document has been uploaded. Add another document or click Continue.';
  }
  return `${count} documents uploaded. Add another document or click Continue.`;
}

function emptyHeader() {
  return `
    <header class="intro">
      <h1>Saito<span class="sign">Sign</span></h1>
      <p class="summary">Share and sign documents with digital signatures.</p>
    </header>
  `;
}

function confirmedHeader(count, celebrate) {
  const summary = uploadedSummary(count);
  if (!celebrate) {
    return `
      <header class="intro confirmed">
        <h1>Upload <span class="sign">Complete</span></h1>
        <p class="summary">${summary}</p>
      </header>
    `;
  }

  return `
    <header class="intro confirming">
      <div class="heading-stage">
        <div class="heading-flip">
          <div class="face front" aria-hidden="true">
            <h1>Saito<span class="sign">Sign</span></h1>
          </div>
          <div class="face back">
            <h1>Upload <span class="sign">Complete</span></h1>
          </div>
        </div>
        <span class="heading-sheen" aria-hidden="true"></span>
      </div>
      <p class="summary arriving">${summary}</p>
    </header>
  `;
}

function stagedHTML(files, freshIndex) {
  const tiles = files
    .map((file, index) => {
      const name = escapeHTML(file.name);
      const arrived = index === freshIndex ? ' just-added' : '';
      return `
        <li class="staged-item doc-tile${arrived}" draggable="true" data-staged-index="${index}">
          <button type="button" class="staged-remove" data-remove-staged="${index}" aria-label="Remove ${name}">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
          <div class="tile-body">
            <i class="fa-solid fa-file-pdf tile-icon" aria-hidden="true"></i>
            <span class="staged-name" title="${name}">${name}</span>
          </div>
        </li>
      `;
    })
    .join('');

  return `
    <section class="staged" aria-label="Uploaded documents">
      <ul class="staged-list">
        ${tiles}
      </ul>
      <button type="button" class="prepare primary" data-prepare>Continue</button>
    </section>
  `;
}

module.exports = function splashTemplate(view = {}) {
  const notice = view.notice ? `<p class="notice">${escapeHTML(view.notice)}</p>` : '';
  const files = Array.isArray(view.files) ? view.files : [];
  const confirmed = files.length > 0;
  const celebrate = confirmed && Boolean(view.celebrate);
  const freshIndex = Number.isInteger(view.freshIndex) ? view.freshIndex : -1;
  const header = confirmed ? confirmedHeader(files.length, celebrate) : emptyHeader();
  const right = confirmed ? stagedHTML(files, freshIndex) : stepsHTML();

  return `
    <main class="splash">
      <div class="workspace">
        ${header}

        <section class="start" aria-label="Start with a PDF or a SaitoSign Doc">
          <div class="dropzone" role="button" tabindex="0">
            <i class="fa-solid fa-file-pdf mark" aria-hidden="true"></i>
            <p class="prompt">upload pdf or saitosign doc</p>
            <p class="hint">or click to choose a file</p>
            ${notice}
          </div>
        </section>

        ${right}

        <p class="more">
          Want to know more?
          <button type="button" class="saito-text-link" data-faq>Learn how SaitoSign works...</button>
        </p>
      </div>
    </main>
  `;
};
