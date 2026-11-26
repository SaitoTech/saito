module.exports = function faqTemplate() {
  return `
    <main class="faq">
      <button type="button" class="back" data-back>
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        Back
      </button>

      <header class="intro">
        <h1>SaitoSign</h1>
      </header>

      <section>
        <p>SaitoSign is a decentralized digital signing application built on the Saito Network. It allows you to import PDFs and mark them up to indicate where other parties should affix their digital signatures.</p>
        <p>The application then takes care of emailing all of the parties to the document, assisting them with verifying the private information and then affixing their signatures to the document. Once all parties have signed the document, SaitoSign then finalizes the document and distributes it to all of the signatories.</p>
        <p>The result is a document-signing application that is incredibly powerful but also trivially simple to use. At the same time, it is powered by sophisticated cryptographic functionality that ensures all signatures can be verified and linked to the email addresses of the users who are party to the contract.</p>
      </section>
    </main>
  `;
};
