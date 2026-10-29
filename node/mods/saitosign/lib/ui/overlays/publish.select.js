function optionRow(state, label, freeAvailable, key) {
  const included = state.plan === 'premium' || freeAvailable;
  const selectable = included && state.canChooseTier;
  const checked = state.options?.[key] === true;
  const control = selectable
    ? `<input type="checkbox" data-share-option="${key}" aria-label="${label}"${checked ? ' checked' : ''}>`
    : `<span class="feature-indicator" role="img" aria-label="${included ? checked ? 'Required by this document' : 'Available with this tier' : 'Not available on this tier'}">${included && checked ? '✓' : ''}</span>`;
  return `
    <label class="verify-row${included ? ' included' : ' unavailable'}" data-tier-feature data-free-available="${freeAvailable}">
      ${control}
      <span class="verify-label">${label}</span>
    </label>
  `;
}

function selectSlide(state) {
  const free = state.plan !== 'premium';
  const disabled = state.canChooseTier ? '' : ' disabled';
  const benefits = free
    ? ''
    : `
      <section class="upgrade-for">
        <p class="section-label">Additional Benefits</p>
        <div class="benefit-box">
          <div class="benefit">
            <p class="benefit-label">Easier Document Sharing</p>
            <p class="benefit-copy">Avoid exporting and importing documents; share a link instead.</p>
          </div>
          <div class="benefit">
            <p class="benefit-label">Archive</p>
            <p class="benefit-copy">Avoid manual archiving. SaitoSign will store documents for five years.</p>
          </div>
        </div>
      </section>
    `;
  return {
    title: 'How should users verify their identity before signing this document?',
    body: `
      <div class="choice">
        <div class="options" role="tablist" aria-label="Account level">
          <button type="button" class="option${free ? ' active' : ''}" data-plan="free" role="tab" aria-selected="${free}"${disabled}>
            <span class="kicker">Free</span>
            <span class="label">High security</span>
          </button>
          <button type="button" class="option${free ? '' : ' active'}" data-plan="premium" role="tab" aria-selected="${!free}"${disabled}>
            <span class="kicker">Premium</span>
            <span class="label">More convenient</span>
          </button>
        </div>
        <section class="tier-details" role="tabpanel">
          <div class="verify-group">
            <p class="section-label">Verification Options</p>
            <div class="verify-box" aria-label="Verification options">
              ${optionRow(state, 'email', true, 'email')}
              ${optionRow(state, 'supporting photo', true, 'photo')}
              ${optionRow(state, 'passport photo', true, 'passport')}
            </div>
          </div>
          ${benefits}
        </section>
      </div>
    `
  };
}

module.exports = selectSlide;
