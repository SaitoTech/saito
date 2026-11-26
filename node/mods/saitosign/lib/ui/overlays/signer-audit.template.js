const { escapeHTML } = require('./publish.escape');

function verdict(ok) {
  return ok
    ? '<span class="audit-badge ok">Cryptographically verified</span>'
    : '<span class="audit-badge">Verification failed</span>';
}

function evidenceField(label, value) {
  const text = String(value || '');
  if (!text) {
    return `
      <p class="audit-label">${escapeHTML(label)}</p>
      <p class="audit-missing">Not yet provided.</p>
    `;
  }
  const rows = Math.min(8, Math.max(2, text.split('\n').length));
  return `
    <label class="audit-label">${escapeHTML(label)}
      <textarea class="evidence-copy" readonly rows="${rows}">${escapeHTML(text)}</textarea>
    </label>
  `;
}

function emailPanel(view) {
  if (!view.emails.length) {
    return '<p class="audit-missing">Email verification: Not yet completed.</p>';
  }
  return view.emails.map((entry) => `
    <article class="evidence-block">
      <h4>Server-signed challenge</h4>
      <p class="audit-note">The signer supplied an email address. SaitoSign built a challenge that names that address and the signer's public key. The server signed the challenge, and that signature was emailed to the address as the verification code.</p>
      ${evidenceField('Signed message', entry.message)}
      ${evidenceField('Server signature', entry.code)}
      ${evidenceField('Server public key', entry.serverKey)}
      <p class="audit-label">Verification</p>
      <p class="audit-value">${verdict(entry.valid)}</p>
    </article>
    <article class="evidence-block">
      <h4>Signer's response</h4>
      <p class="audit-note">The signer returns the server signature above. That shows the code was received. The protocol does not create a second signature with the signer's private key, so there is no separate signer signature to display.</p>
      <p class="audit-value">${entry.returned
        ? 'The signer returned the verification code.'
        : 'The signer has not returned the verification code.'}</p>
    </article>
  `).join('');
}

function signaturePanel(view) {
  if (!view.signatures.length) {
    return '<p class="audit-missing">Digital signature: Not yet provided.</p>';
  }
  const cards = view.signatures.map((entry) => {
    const kind = entry.type === 'initial' ? 'Initials' : 'Digital signature';
    const proof = entry.recorded
      ? `
        <p class="audit-note">The signer produced this signature with the public key shown on the left. It covers this field and the document commitment. It does not, by itself, cover every field in the document.</p>
        ${evidenceField('Signed message', entry.payload)}
        ${evidenceField('Signer signature', entry.signature)}
        ${evidenceField('Public key', entry.publicKey)}
        ${evidenceField('Document commitment', entry.documentHash)}
        <p class="audit-label">Verification</p>
        <p class="audit-value">${verdict(entry.valid)}</p>
      `
      : `<p class="audit-missing">${escapeHTML(kind)}: Not yet provided.</p>`;
    return `
      <article class="evidence-block">
        <h4>${escapeHTML(kind)} on page ${escapeHTML(entry.page)}</h4>
        ${proof}
      </article>
    `;
  }).join('');
  return cards;
}

function photoPanel(view, photo) {
  if (!view.images.length) {
    return '<p class="audit-missing">Photo verification: Not yet provided.</p>';
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
        <figcaption>${escapeHTML(open.kind)}</figcaption>
      </figure>
      ${nav}
      <p class="audit-note">The signer signed this image with the public key shown on the left. The signed message includes a hash of the image. This is not an email verification.</p>
      ${evidenceField('Signed message', open.message)}
      ${evidenceField('Signer signature', open.signature)}
      ${evidenceField('Public key', open.publicKey)}
      <p class="audit-label">Verification</p>
      <p class="audit-value">${verdict(open.valid)}</p>
    `;
  }
  const thumbs = view.images.map((image, index) => `
    <button type="button" class="audit-thumb" data-audit-photo="${index}">
      <img src="${escapeHTML(image.src)}" alt="${escapeHTML(image.kind)}">
      <span>${escapeHTML(image.kind)}</span>
      ${verdict(image.valid)}
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
  const photos = `<button type="button" data-audit-section="photos"${section === 'photos' ? ' class="active"' : ''}>Photos</button>`;
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
