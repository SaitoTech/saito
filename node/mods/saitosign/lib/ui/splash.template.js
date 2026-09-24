function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = function splashTemplate(view = {}) {
  const notice = view.notice ? `<p class="notice">${escapeHTML(view.notice)}</p>` : '';

  return `
    <main class="splash">
      <div class="workspace">
        <header class="intro">
          <h1>Saito<span class="sign">Sign</span></h1>
          <p class="summary">Share and sign documents with cryptographic proofs.</p>
        </header>

        <section class="start" aria-label="Start with a PDF or a SaitoSign Doc">
          <div class="dropzone" role="button" tabindex="0">
            <i class="fa-solid fa-file-pdf mark" aria-hidden="true"></i>
            <p class="prompt">upload pdf or saitosign doc</p>
            <p class="hint">or click to choose a file</p>
            ${notice}
          </div>
        </section>

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

        <p class="more">
          Want to know more?
          <button type="button" class="saito-text-link" data-how>Learn how SaitoSign works...</button>
        </p>
      </div>
    </main>
  `;
};
