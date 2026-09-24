module.exports = function howTemplate() {
  return `
    <main class="how">
      <button type="button" class="back" data-back>
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        Back
      </button>

      <header class="intro">
        <h1>SaitoSign</h1>
        <p class="summary">Share and sign documents with cryptographic proofs.</p>
      </header>

      <section>
        <p class="title">What SaitoSign does</p>
        <p>SaitoSign is for sharing a document and collecting signatures, together with a cryptographic record of who signed it.</p>
        <p>You start with a PDF on your computer, mark the places that need a signature, and pass the document to the people who need to sign.</p>
      </section>

      <section>
        <p class="title">How a document is signed</p>
        <ol>
          <li>
            <p class="title">Upload document</p>
            <p>Choose a PDF from your computer. SaitoSign keeps that file locally while you prepare it.</p>
          </li>
          <li>
            <p class="title">Add signature fields</p>
            <p>Place a field where someone needs to sign, initial, or date the document, and say who that person is.</p>
          </li>
          <li>
            <p class="title">Share and sign it</p>
            <p>Sign the fields that are yours, or share the document with another person so they can sign theirs.</p>
          </li>
        </ol>
      </section>

      <section>
        <p class="title">The document stays with the people involved</p>
        <p>SaitoSign does not upload your PDF to a server while you prepare it. The file stays on your computer until you choose to share it.</p>
        <p>When a document is shared, it is meant to go directly from one person to another, along with cryptographic proof of who signed which part. There is no signing service holding the only copy.</p>
      </section>
    </main>
  `;
};
