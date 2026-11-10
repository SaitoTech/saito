const { escapeHTML } = require('./publish.escape');

function compact(value) {
  const text = String(value || '');
  if (text.length <= 36) {
    return text;
  }
  return `${text.slice(0, 18)}…${text.slice(-12)}`;
}

function badge(valid, readyLabel, missingLabel) {
  if (valid) {
    return '<span class="audit-badge ok">Verified</span>';
  }
  return `<span class="audit-badge">${escapeHTML(missingLabel || readyLabel || 'Not verified')}</span>`;
}

function secret(id, value, label) {
  const text = String(value || '');
  if (!text) {
    return '<p class="audit-missing">Not recorded.</p>';
  }
  return `
    <div class="audit-secret">
      <code class="audit-compact">${escapeHTML(compact(text))}</code>
      <button type="button" data-audit-copy="${escapeHTML(id)}">Copy</button>
      <details>
        <summary>Show full ${escapeHTML(label)}</summary>
        <code data-audit-value="${escapeHTML(id)}">${escapeHTML(text)}</code>
      </details>
    </div>
  `;
}

function identityHTML(view) {
  const rows = [];
  if (view.name) {
    rows.push(['Name', view.name, 'Supplied by the signer.']);
  }
  if (view.email) {
    rows.push([
      'Email address',
      view.email,
      view.emailVerified
        ? 'Supplied by the signer and confirmed by the email verification signature.'
        : 'Supplied by the signer. It has not been confirmed by a valid email verification signature.'
    ]);
  }
  if (view.publicKey) {
    rows.push(['Saito public key', view.publicKey, 'Recorded for this signer. Document signatures are checked against this key.']);
  }
  const facts = rows.map(([label, value, note]) => `
    <div class="audit-fact">
      <p class="audit-label">${escapeHTML(label)}</p>
      <p class="audit-value">${escapeHTML(value)}</p>
      <p class="audit-note">${escapeHTML(note)}</p>
    </div>
  `).join('');
  const status = view.verified
    ? '<span class="audit-badge ok">Verified</span>'
    : '<span class="audit-badge">Incomplete</span>';
  return `
    <section class="audit-section">
      <div class="audit-section-head">
        <h4>Signer Identity</h4>
        ${status}
      </div>
      ${facts || '<p class="audit-missing">No identity details are recorded for this signer.</p>'}
    </section>
  `;
}

function emailHTML(view) {
  const blocks = view.emails.length
    ? view.emails.map((entry, index) => `
      <article class="audit-card">
        <div class="audit-section-head">
          <h5>Email verification</h5>
          ${badge(entry.valid && entry.returned, '', entry.valid ? 'Code not returned' : 'Not verified')}
        </div>
        <p class="audit-note">The server signed the message below. That signature is the verification code. It shows that the server issued this challenge for the email address and public key in the message. It is not a signature produced by the signer.</p>
        <p class="audit-label">Original verification message</p>
        <pre class="audit-message">${escapeHTML(entry.message || 'Not recorded.')}</pre>
        <p class="audit-label">Server signature</p>
        ${secret(`email-signature-${index}`, entry.code, 'server signature')}
        <p class="audit-label">Code returned by the signer</p>
        <p class="audit-value">${escapeHTML(entry.returned && entry.valid
          ? 'Yes. The signer returned this code, and it matches the server signature.'
          : entry.returned
            ? 'A returned code is recorded, but it does not verify against the server signature.'
            : 'Not recorded. Possession of the emailed code has not been recorded.')}</p>
        <p class="audit-label">Server public key</p>
        ${entry.serverKey ? `<p class="audit-value">${escapeHTML(entry.serverKey)}</p>` : '<p class="audit-missing">Not recorded.</p>'}
        <p class="audit-label">Signer public key named by the message</p>
        ${entry.signerKey ? `<p class="audit-value">${escapeHTML(entry.signerKey)}</p>` : '<p class="audit-missing">Not recorded.</p>'}
      </article>
    `).join('')
    : '<p class="audit-missing">No email verification evidence is recorded for this signer.</p>';
  return `
    <section class="audit-section">
      <h4>Email Verification</h4>
      ${blocks}
    </section>
  `;
}

function signatureHTML(view) {
  const cards = view.signatures.length
    ? view.signatures.map((entry) => {
      const kind = entry.type === 'initial' ? 'Initials' : 'Signature';
      const result = !entry.recorded
        ? '<span class="audit-badge">Not signed</span>'
        : badge(entry.valid, '', 'Not verified');
      const group = entry.group
        ? '<p class="audit-note">This field belongs to a repeated placement. Each page still has its own signature.</p>'
        : '';
      const proof = entry.recorded
        ? `
          <p class="audit-label">Cryptographic signature</p>
          ${secret(`field-${entry.id}-signature`, entry.signature, 'signature')}
          <p class="audit-label">Signed content</p>
          <p class="audit-note">The signature covers this field's identifier, type, signer, page, and position, together with the document commitment hash. It does not include a time or a blockchain transaction.</p>
          ${secret(`field-${entry.id}-payload`, entry.payload, 'signed content')}
          <p class="audit-label">Document commitment</p>
          ${secret(`field-${entry.id}-hash`, entry.documentHash, 'document commitment')}
          <p class="audit-missing">No timestamp is recorded with this signature.</p>
          <p class="audit-missing">No transaction reference is recorded with this signature.</p>
        `
        : '<p class="audit-missing">No cryptographic signature is recorded for this field.</p>';
      return `
        <details class="audit-card">
          <summary>
            <span>${escapeHTML(kind)} — Page ${escapeHTML(entry.page)}</span>
            ${result}
          </summary>
          <p class="audit-label">Field</p>
          <p class="audit-value">${escapeHTML(String(entry.id))}</p>
          <p class="audit-label">Signer public key</p>
          ${entry.publicKey ? `<p class="audit-value">${escapeHTML(entry.publicKey)}</p>` : '<p class="audit-missing">Not recorded.</p>'}
          ${group}
          ${proof}
        </details>
      `;
    }).join('')
    : '<p class="audit-missing">No signature fields are recorded for this signer.</p>';
  return `
    <section class="audit-section">
      <h4>Document Signatures</h4>
      <p class="audit-note">Each signature field is signed separately over that field and the document commitment. Placing a signature on several pages produces one signature per field.</p>
      ${cards}
    </section>
  `;
}

function photoHTML(view, viewer) {
  if (!view.images.length) {
    return '';
  }
  const open = Number.isInteger(viewer) ? view.images[viewer] : null;
  if (open) {
    const count = view.images.length;
    const nav = count > 1
      ? `<div class="audit-nav"><button type="button" data-audit-photo="prev">Previous</button><button type="button" data-audit-photo="next">Next</button></div>`
      : '';
    return `
      <section class="audit-section">
        <div class="audit-section-head">
          <h4>Photographic Evidence</h4>
          <button type="button" data-audit-photo="back">Back to photographs</button>
        </div>
        <figure class="audit-frame">
          <img src="${escapeHTML(open.src)}" alt="${escapeHTML(open.kind)}">
          <figcaption>
            ${escapeHTML(open.kind)}
            ${badge(open.valid, '', 'Not verified')}
          </figcaption>
        </figure>
        ${nav}
        <p class="audit-label">Verification message</p>
        <pre class="audit-message">${escapeHTML(open.message || 'Not recorded.')}</pre>
        <p class="audit-label">Signature</p>
        ${secret(`photo-${viewer}-signature`, open.signature, 'signature')}
        <p class="audit-label">Public key</p>
        ${open.publicKey ? `<p class="audit-value">${escapeHTML(open.publicKey)}</p>` : '<p class="audit-missing">Not recorded.</p>'}
      </section>
    `;
  }
  const thumbs = view.images.map((image, index) => `
    <button type="button" class="audit-thumb" data-audit-photo="${index}">
      <img src="${escapeHTML(image.src)}" alt="${escapeHTML(image.kind)}">
      <span>${escapeHTML(image.kind)}</span>
      ${badge(image.valid, '', 'Not verified')}
    </button>
  `).join('');
  return `
    <section class="audit-section">
      <h4>Photographic Evidence</h4>
      <div class="audit-gallery">${thumbs}</div>
    </section>
  `;
}

function signerAuditTemplate(view, viewer = null) {
  const title = view.name || view.email || 'Signer';
  return `
    <div class="saitosign-audit">
      <div class="audit-head">
        <div>
          <p class="audit-kicker">Signer Verification Details</p>
          <h3>${escapeHTML(title)}</h3>
        </div>
        <button type="button" class="audit-close" data-audit="close">Close</button>
      </div>
      ${identityHTML(view)}
      ${emailHTML(view)}
      ${signatureHTML(view)}
      ${photoHTML(view, viewer)}
    </div>
  `;
}

module.exports = signerAuditTemplate;
