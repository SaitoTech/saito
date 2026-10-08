function feature(title, text) {
  return `
    <div class="feature">
      <p class="heading">${title}</p>
      <p>${text}</p>
    </div>
  `;
}

function tierFeature(state, label, description, freeAvailable, wide, key) {
  const included = state.plan === 'premium' || freeAvailable;
  const classes = ['share-option', included ? 'included' : 'unavailable'];
  if (wide) {
    classes.push('share-wide');
  }
  const selectable = Boolean(key && included && state.canChooseTier);
  const checked = state.options?.[key] === true;
  const indicator = selectable
    ? `<input type="checkbox" data-share-option="${key}" aria-label="Require ${label}"${checked ? ' checked' : ''}>`
    : `<span class="feature-indicator" role="img" aria-label="${included ? checked ? 'Required by this document' : 'Available with this tier' : 'Premium feature'}">${included ? checked ? '✓' : '○' : '×'}</span>`;
  return `
    <div class="${classes.join(' ')}" data-tier-feature data-free-available="${freeAvailable}">
      ${indicator}
      <span class="share-option-copy">
        <span class="share-option-title">${label}</span>
        ${description ? `<span class="share-option-description">${description}</span>` : ''}
      </span>
    </div>
  `;
}

function selectSlide(state) {
  const free = state.plan !== 'premium';
  const disabled = state.canChooseTier ? '' : ' disabled';
  return {
    title: 'How do you want to share this document?',
    body: `
      <div class="choice">
        <div class="options" role="tablist" aria-label="Account level">
          <button type="button" class="option${free ? ' active' : ''}" data-plan="free" role="tab" aria-selected="${free}"${disabled}>
            <span class="kicker">Freemium</span>
            <span class="label">Basic verification</span>
          </button>
          <button type="button" class="option${free ? '' : ' active'}" data-plan="premium" role="tab" aria-selected="${!free}"${disabled}>
            <span class="kicker">Premium</span>
            <span class="label">Full verification and signing</span>
          </button>
        </div>
        <section class="tier-details" role="tabpanel">
          <div class="tier-features">
            ${feature('Premium Verification Methods', '')}
            <div class="share-flags" aria-label="Basic verification methods">
              ${tierFeature(state, 'Email', 'Verify each signer by email.', true, false, 'email')}
              ${tierFeature(state, 'Mobile', 'Verify a mobile number.', false, false, 'phone')}
              ${tierFeature(state, 'Photo', 'Request a supporting photograph.', true, false, 'photo')}
              ${tierFeature(state, 'Passport', 'Verify identity with a passport.', false, false, 'passport')}
              ${tierFeature(state, 'Legal review', 'Request third-party identity review.', false, false, 'legal_review')}
            </div>
            ${feature('Extra Benefits', '')}
            ${tierFeature(state, 'Automatic File-Sharing', 'Avoid the need for manual file-sharing completely.', false, true, 'online_signing')}
            ${tierFeature(state, 'Archive completed contract', 'Save an encrypted copy after signing is complete.', false, true, 'archive_contract')}
          </div>
        </section>
      </div>
    `
  };
}

module.exports = selectSlide;
