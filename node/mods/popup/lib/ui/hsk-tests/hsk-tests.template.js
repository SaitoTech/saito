function escapeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function archive(groups, selectedId) {
  const sections = groups
    .map((collection) => {
      const tests = collection.tests
        .map((test) => {
          const selected = Number(selectedId) === Number(test.id) ? ' is-selected' : '';
          const pressed = selected ? 'true' : 'false';
          return `
            <li>
              <button type="button" class="popup-hsk-test${selected}" data-lesson-id="${Number(test.id)}" aria-pressed="${pressed}">
                <span class="popup-hsk-test-title">${escapeText(test.title || 'Untitled test')}</span>
              </button>
            </li>`;
        })
        .join('');
      return `
        <section class="popup-hsk-collection">
          <h2>${escapeText(collection.label)}</h2>
          <ul>${tests}</ul>
        </section>`;
    })
    .join('');

  return `
    <div class="popup-hsk">
      <header class="popup-hsk-intro">
        <h1>HSK Test</h1>
        <p>Archived HSK exercises from Popup Chinese. Choose a test, then start. The questions come from that archive.</p>
      </header>
      <div class="popup-hsk-startbar">
        <button type="button" class="popup-hsk-start" data-action="start" ${selectedId ? '' : 'disabled'}>Start Testing</button>
      </div>
      <div class="popup-hsk-archive">${sections || '<p class="popup-hsk-empty">The HSK archive is still loading.</p>'}</div>
      <p class="popup-hsk-notice" role="status"></p>
    </div>
  `;
}

function runner() {
  return `
    <div class="popup-hsk popup-hsk-runner">
      <p class="popup-hsk-progress"></p>
      <div class="popup-hsk-question"></div>
      <div class="popup-hsk-choices"></div>
      <p class="popup-hsk-feedback" role="status"></p>
      <div class="popup-hsk-actions">
        <button type="button" class="popup-hsk-next" data-action="next" hidden>Next</button>
        <button type="button" class="popup-hsk-back" data-action="archive">Back to archive</button>
      </div>
    </div>
  `;
}

module.exports = { archive, runner };
