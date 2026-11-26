function optionRow(state, label, freeAvailable, key) {
  const included = state.plan === 'premium' || freeAvailable;
  const mandatory = key === 'email';
  const selectable = included && state.canChooseTier && !mandatory;
  const checked = mandatory || state.options?.[key] === true;
  let control;
  if (mandatory && included) {
    control = `<input type="checkbox" data-share-option="${key}" aria-label="${label}" checked disabled>`;
  } else if (selectable) {
    control = `<input type="checkbox" data-share-option="${key}" aria-label="${label}"${checked ? ' checked' : ''}>`;
  } else {
    control = `<span class="feature-indicator" role="img" aria-label="${included ? checked ? 'Required by this document' : 'Available with this tier' : 'Not available on this tier'}">${included && checked ? '✓' : ''}</span>`;
  }
  return `
    <label class="verify-row${included ? ' included' : ' unavailable'}${mandatory ? ' mandatory' : ''}" data-tier-feature data-free-available="${freeAvailable}">
      ${control}
      <span class="verify-label">${label}</span>
    </label>
  `;
}

function selectSlide(state) {
  const free = state.plan !== 'premium';
  const disabled = state.canChooseTier ? '' : ' disabled';
  const panel = free
    ? `
          <div class="verify-group">
            <p class="section-label">Verification Options</p>
            <div class="verify-box" aria-label="Verification options">
              ${optionRow(state, 'email', true, 'email')}
              ${optionRow(state, 'supporting photo', true, 'photo')}
              ${optionRow(state, 'passport photo', true, 'passport')}
            </div>
          </div>
    `
    : `
          <div class="verify-group">
            <p class="section-label">Additional benefits</p>
            <div class="verify-box" aria-label="Additional benefits">
              <p class="coming-soon">More coming soon.</p>
            </div>
          </div>
    `;
  return {
    title: 'Select the Information Required for Verification',
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
          ${panel}
        </section>
      </div>
    `
  };
}

module.exports = selectSlide;
