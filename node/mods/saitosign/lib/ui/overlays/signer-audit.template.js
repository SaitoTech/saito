const { escapeHTML } = require('./publish.escape');

function result(ok, yes, no) {
  return ok
    ? `<span class="audit-badge ok">${escapeHTML(yes)}</span>`
    : `<span class="audit-badge">${escapeHTML(no)}</span>`;
}

function valueBlock(id, label, value) {
  const text = String(value || '');
  if (!text) {
    return `
      <p class="audit-label">${escapeHTML(label)}</p>
      <p class="audit-missing">Unavailable.</p>
    `;
  }
  return `
    <p class="audit-label">${escapeHTML(label)}</p>
    <pre class="evidence-copy" data-audit-value="${escapeHTML(id)}">${escapeHTML(text)}</pre>
    <div class="copy-row"><button type="button" data-audit-copy="${escapeHTML(id)}">Copy</button></div>
  `;
}

function emailPanel(view) {
  if (!view.emails.length) {
    return '<p class="audit-missing">Email verification evidence is unavailable for this signer.</p>';
  }
  return view.emails.map((entry, index) => `
    <article class="evidence-block">
      <h4>Server-signed verification challenge</h4>
      <p class="audit-note">The server signed the message below. That signature is also the verification code emailed to the address in the message. It shows that the server issued this challenge. It does not, by itself, show that anyone controls the email address, and it is not a signature produced by the signer.</p>
      ${valueBlock(`email-${index}-message`, 'Original signed message', entry.message)}
      ${valueBlock(`email-${index}-email`, 'Email address on the signer record', view.email)}
      ${valueBlock(`email-${index}-signer`, 'Signer public key named for this challenge', entry.signerKey)}
      ${valueBlock(`email-${index}-server`, 'Server public key', entry.serverKey)}
      ${valueBlock(`email-${index}-signature`, 'Server signature (verification code)', entry.code)}
      <p class="audit-label">Cryptographic verification</p>
      <p class="audit-value">${result(entry.valid, 'The signature verifies against the server public key and the message above.', 'The signature does not verify.')}</p>
    </article>
    <article class="evidence-block">
      <h4>Signer-submitted verification response</h4>
      <p class="audit-note">Submitting the code does not create a second message or a signature from the signer's key. The document only records whether the signer returned the code. The returned code is not stored separately from the server signature above.</p>
      ${entry.returned
        ? `<p class="audit-value">${entry.valid
          ? 'The signer returned the verification code, and that code matches the server signature above.'
          : 'A code return is recorded, but the stored server signature does not verify.'}</p>`
        : '<p class="audit-missing">No code submission is recorded. Possession of the emailed code has not been shown.</p>'}
      <p class="audit-label">Separate signer signature</p>
      <p class="audit-missing">Unavailable. The protocol does not produce one.</p>
    </article>
  `).join('');
}

function signaturePanel(view) {
  if (!view.signatures.length) {
    return '<p class="audit-missing">No signature fields are recorded for this signer.</p>';
  }
  const cards = view.signatures.map((entry) => {
    const kind = entry.type === 'initial' ? 'Initials' : 'Signature';
    const status = !entry.recorded
      ? result(false, '', 'Not signed')
      : result(entry.valid, 'Signature verifies', 'Signature does not verify');
    const proof = entry.recorded
      ? `
        ${valueBlock(`field-${entry.id}-payload`, 'Signed message', entry.payload)}
        ${valueBlock(`field-${entry.id}-signature`, 'Cryptographic signature', entry.signature)}
        ${valueBlock(`field-${entry.id}-key`, 'Public key used for verification', entry.publicKey)}
        ${valueBlock(`field-${entry.id}-hash`, 'Document commitment included in the signed message', entry.documentHash)}
        <p class="audit-label">Verification</p>
        <p class="audit-value">${status}</p>
        <p class="audit-missing">No timestamp is recorded.</p>
        <p class="audit-missing">No transaction reference is recorded.</p>
      `
      : '<p class="audit-missing">No cryptographic signature is recorded for this field.</p>';
    return `
      <article class="evidence-block">
        <h4>${escapeHTML(kind)} on page ${escapeHTML(entry.page)}</h4>
        <p class="audit-note">This is one field. It is signed separately from the other fields and does not cover the whole document by itself.</p>
        <p class="audit-label">Field</p>
        <p class="audit-value">${escapeHTML(String(entry.id))}${entry.group ? ' · repeated placement' : ''}</p>
        ${proof}
      </article>
    `;
  }).join('');
  return `
    <p class="audit-note">Each signature or initial field has its own signature over that field and the document commitment.</p>
    ${cards}
  `;
}

function photoPanel(view, photo) {
  if (!view.images.length) {
    return '<p class="audit-missing">No photographs are recorded for this signer.</p>';
  }
  const open = Number.isInteger(photo) ? view.images[photo] : null;
  if (open) {
    const count = view.images.length;
    const nav = count > 1
      ? `<div class="audit-photo-nav"><button type="button" data-audit-photo="prev">Previous</button><button type="button" data-audit-photo="next">Next</button></div>`
      : '';
    return `
      <div class="audit-photo-nav"><button type="button" data-audit-photo="back">Back to photographs</button></div>
      <figure class="audit-frame">
        <img src="${escapeHTML(open.src)}" alt="${escapeHTML(open.kind)}">
        <figcaption>${escapeHTML(open.kind)} ${result(open.valid, 'Signature verifies', 'Signature does not verify')}</figcaption>
      </figure>
      ${nav}
      ${valueBlock(`photo-${photo}-message`, 'Signed message', open.message)}
      ${valueBlock(`photo-${photo}-signature`, 'Cryptographic signature', open.signature)}
      ${valueBlock(`photo-${photo}-key`, 'Public key', open.publicKey)}
      <p class="audit-note">A photograph is signed by the signer's own key over a message that includes the image hash. It is not an email verification.</p>
    `;
  }
  const thumbs = view.images.map((image, index) => `
    <button type="button" class="audit-thumb" data-audit-photo="${index}">
      <img src="${escapeHTML(image.src)}" alt="${escapeHTML(image.kind)}">
      <span>${escapeHTML(image.kind)}</span>
      ${result(image.valid, 'Signature verifies', 'Signature does not verify')}
    </button>
  `).join('');
  return `<div class="audit-gallery">${thumbs}</div>`;
}

function signerSlide(state) {
  const view = state.auditView;
  const audit = state.audit || {};
  if (!view) {
    return {
      title: 'Signer Verification Details',
      body: '<p class="audit-missing">This signer is no longer available.</p>'
    };
  }
  const section = audit.section === 'signatures' || audit.section === 'photos'
    ? audit.section
    : 'email';
  const photos = view.images.length
    ? `<button type="button" data-audit-section="photos"${section === 'photos' ? ' class="active"' : ''}>Photos</button>`
    : '';
  const panel = section === 'signatures'
    ? signaturePanel(view)
    : section === 'photos'
      ? photoPanel(view, Number.isInteger(audit.photo) ? audit.photo : null)
      : emailPanel(view);
  return {
    title: 'Signer Verification Details',
    body: `
      <div class="signer-evidence">
        <div class="signer-side">
          <dl class="signer-identity">
            <dt>Name</dt>
            <dd>${view.name ? escapeHTML(view.name) : 'Unavailable.'}</dd>
            <dt>Email address</dt>
            <dd>${view.email ? escapeHTML(view.email) : 'Unavailable.'}</dd>
            <dt>Public key</dt>
            <dd class="audit-key">${view.publicKey ? escapeHTML(view.publicKey) : 'Unavailable.'}</dd>
          </dl>
          <div class="signer-sections">
            <button type="button" data-audit-section="email"${section === 'email' ? ' class="active"' : ''}>Email Verification</button>
            <button type="button" data-audit-section="signatures"${section === 'signatures' ? ' class="active"' : ''}>Document Signatures</button>
            ${photos}
          </div>
        </div>
        <div class="signer-view">${panel}</div>
      </div>
    `
  };
}

module.exports = signerSlide;
