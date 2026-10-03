function feature(title, text) {
  return `
    <div class="feature">
      <p class="heading">${title}</p>
      <p>${text}</p>
    </div>
  `;
}

function optionBox(state, key, label, wide) {
  const checked = state.options?.[key] === true ? ' checked' : '';
  const klass = wide ? ' class="share-wide"' : '';
  return `<label${klass}><input type="checkbox" data-share-option="${key}"${checked}> ${label}</label>`;
}

function selectSlide(state) {
  const free = state.plan !== 'premium';
  return {
    title: 'How do you want to share this document?',
    body: `
      <div class="choice">
        <div class="options" role="listbox" aria-label="How to share this document">
          <button type="button" class="option${free ? ' active' : ''}" data-plan="free" aria-selected="${free}">
            <span class="kicker">Freemium</span>
            <div class="features">
              ${feature('Basic Verification', 'Signers verify email addresses, can attach supporting photos')}
              ${feature('Private File Sharing', 'You share the document with your peers, they import and sign manually.')}
              ${feature('Update to Enable:', 'One-click links, advanced verification options, secure contract archiving')}
            </div>
          </button>
          <button type="button" class="option${free ? '' : ' active'}" data-plan="premium" aria-selected="${!free}">
            <span class="kicker">Premium</span>
            <div class="features">
              ${feature('Full Verification', 'Email, mobile, passport, photo and video verification options available')}
              ${feature('Easy Signing', 'Share links with others. The server manages the entire signing process.')}
              ${feature('Full Archive Support', 'All contracts saved in encrypted form.')}
            </div>
          </button>
        </div>
        <div class="share-config" data-share-config${free ? ' hidden' : ''}>
          <div class="share-flags">
            ${optionBox(state, 'email', 'Email')}
            ${optionBox(state, 'phone', 'Phone')}
            ${optionBox(state, 'photo', 'Photo')}
            ${optionBox(state, 'passport', 'Passport')}
            ${optionBox(state, 'legal_review', 'Legal Review')}
          </div>
          ${optionBox(state, 'online_signing', 'Fully online document signing (no documents to download!)', true)}
          ${optionBox(state, 'archive_contract', 'Archive copy of my contract after signing is complete', true)}
        </div>
      </div>
    `
  };
}

module.exports = selectSlide;
