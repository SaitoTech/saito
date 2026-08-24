function pageWindow(current, total_pages, max_buttons = 5) {
  if (total_pages <= max_buttons) {
    return Array.from({ length: total_pages }, (_, i) => i + 1);
  }

  const half = Math.floor(max_buttons / 2);
  let start = Math.max(1, current - half);
  let end = start + max_buttons - 1;
  if (end > total_pages) {
    end = total_pages;
    start = Math.max(1, end - max_buttons + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

module.exports = ({ pagination = null, empty = false, categoryLabel = '' } = {}) => {
  if (empty) {
    const label = categoryLabel ? ` in ${categoryLabel}` : '';
    return `
      <div class="catalog-empty empty">
        <h2>No listings${label}</h2>
        <p>Nothing is for sale in this category yet.</p>
      </div>
    `;
  }

  if (!pagination || !pagination.total) {
    return '';
  }

  const { page, total, total_pages, has_next, has_previous } = pagination;

  if (total_pages <= 1) {
    return `
      <p class="catalog-info" role="status">Showing all listings.</p>
    `;
  }

  const pages = pageWindow(page, total_pages)
    .map((n) => {
      const active = n === page ? ' is-active' : '';
      const aria = n === page ? ' aria-current="page"' : '';
      return `<button type="button" class="page-btn${active}" data-page="${n}"${aria}>${n}</button>`;
    })
    .join('');

  const prev_disabled = has_previous ? '' : ' disabled';
  const next_disabled = has_next ? '' : ' disabled';

  return `
    <nav class="catalog-pagination" aria-label="Listings pages">
      <button type="button" class="nav-btn" data-page-action="prev"${prev_disabled}>Previous</button>
      <div class="pages">${pages}</div>
      <button type="button" class="nav-btn" data-page-action="next"${next_disabled}>Next</button>
    </nav>
    <p class="catalog-info" role="status">Page ${page} of ${total_pages} · ${total} listings</p>
  `;
};

function attachCatalogFooterEvents(footer, { page, pagination, onPage } = {}) {
  if (!footer || typeof onPage !== 'function') {
    return;
  }

  footer.querySelectorAll('[data-page]').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      const next = Number(btn.getAttribute('data-page'));
      if (next && next !== page) {
        onPage(next);
      }
    };
  });

  const prev = footer.querySelector('[data-page-action="prev"]');
  if (prev) {
    prev.onclick = (e) => {
      e.preventDefault();
      if (pagination?.has_previous) {
        onPage(page - 1);
      }
    };
  }

  const next = footer.querySelector('[data-page-action="next"]');
  if (next) {
    next.onclick = (e) => {
      e.preventDefault();
      if (pagination?.has_next) {
        onPage(page + 1);
      }
    };
  }
}

module.exports.attachCatalogFooterEvents = attachCatalogFooterEvents;
