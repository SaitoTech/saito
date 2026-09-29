module.exports = (view) => {
  let sectors = '';
  if (!view.groups.length) {
    sectors = '<div class="mm-empty">No ships can move to this sector.</div>';
  }
  for (let g = 0; g < view.groups.length; g++) {
    let group = view.groups[g];
    let ships = '';
    for (let s = 0; s < group.ships.length; s++) {
      let ship = group.ships[s];
      let key = g + '_' + s;
      let selected = !!view.selected[key];
      let cargo = view.cargo[key] || { infantry: {}, fighters: 0 };
      let cap = view.capacityLeft(key);
      let cargo_html = '';
      if (selected && ship.can_carry) {
        let rows = '';
        for (let p = 0; p < group.planets.length; p++) {
          let planet = group.planets[p];
          if (planet.infantry <= 0 && !(cargo.infantry[p] > 0)) {
            continue;
          }
          let count = cargo.infantry[p] || 0;
          let left = view.infantryLeft(g, p);
          rows += `
            <div class="mm-row">
              <div class="mm-row-label">
                <span class="mm-row-name">${escapeHtml(planet.name)}</span>
                <span class="mm-row-note">${left} infantry left on planet</span>
              </div>
              <button type="button" class="mm-step" data-act="minus" data-kind="infantry" data-key="${key}" data-planet="${p}" aria-label="remove one infantry">−</button>
              <span class="mm-count">${count}</span>
              <button type="button" class="mm-step" data-act="plus" data-kind="infantry" data-key="${key}" data-planet="${p}" aria-label="add one infantry">+</button>
            </div>`;
        }
        if (group.fighters > 0 || cargo.fighters > 0) {
          rows += `
            <div class="mm-row">
              <div class="mm-row-label">
                <span class="mm-row-name">Fighters</span>
                <span class="mm-row-note">${view.fightersLeft(g)} can still be carried</span>
              </div>
              <button type="button" class="mm-step" data-act="minus" data-kind="fighter" data-key="${key}" aria-label="remove one fighter">−</button>
              <span class="mm-count">${cargo.fighters || 0}</span>
              <button type="button" class="mm-step" data-act="plus" data-kind="fighter" data-key="${key}" aria-label="add one fighter">+</button>
            </div>`;
        }
        cargo_html = `
          <div class="mm-cargo">
            ${rows || '<div class="mm-row-note">Nothing in this sector can be loaded.</div>'}
            <div class="mm-capacity">${cap} capacity left on this ship</div>
          </div>`;
      }
      let rift = ship.hazard === 'rift' ? '<span class="mm-rift">gravity rift</span>' : '';
      let aboard = '';
      if (ship.aboard) {
        aboard = `<span class="mm-aboard">${escapeHtml(ship.aboard)}</span>`;
      }
      ships += `
        <article class="mm-ship${selected ? ' is-selected' : ''}" data-key="${key}">
          <button type="button" class="mm-ship-toggle" data-key="${key}">
            <span class="mm-check" aria-hidden="true"></span>
            <span class="mm-ship-name">${escapeHtml(ship.name)}</span>
            <span class="mm-ship-meta">move ${ship.move} · capacity ${ship.capacity}${rift}</span>
            ${aboard}
          </button>
          ${cargo_html}
        </article>`;
    }
    sectors += `
      <section class="mm-sector">
        <h3>${escapeHtml(group.name)}</h3>
        ${ships || '<div class="mm-empty">No ships in this sector can make the trip.</div>'}
      </section>`;
  }

  return `
    <div class="manual-movement-overlay">
      <header class="mm-header">
        <div class="mm-title">Move to ${escapeHtml(view.destination_name)}</div>
        <div class="mm-summary">${escapeHtml(view.summary)}</div>
      </header>
      <div class="mm-body">${sectors}</div>
      <footer class="mm-footer">
        <div class="mm-note">${escapeHtml(view.note || '')}</div>
        <button type="button" class="mm-cancel">back</button>
        <button type="button" class="mm-confirm">move</button>
      </footer>
    </div>
  `;
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
