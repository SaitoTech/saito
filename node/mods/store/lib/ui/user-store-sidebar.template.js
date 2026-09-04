/**
 * Store-owned profile footer nav (injected into SaitoProfile footer slot).
 * @param {Array<{ action: string, state?: string, label: string, icon: string }>} items
 */
module.exports = (items = []) => {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => {
      const action = String(item?.action || '').trim();
      const state = String(item?.state || '').trim();
      const label = String(item?.label || '').trim();
      const icon = String(item?.icon || '').trim();
      if (!action || !label || !icon) {
        return '';
      }
      const stateAttr = state ? ` data-contact-state="${state}"` : '';
      return `
      <div
        class="item"
        role="button"
        tabindex="0"
        data-nav-action="${action}"${stateAttr}
      >
        <span class="icon" aria-hidden="true"><i class="${icon}"></i></span>
        <span class="label">${label}</span>
      </div>`;
    })
    .filter(Boolean)
    .join('');

  if (!rows) {
    return '';
  }

  return `
    <nav class="user-store-nav saito-menu-select-subtle" aria-label="Store profile">
      ${rows}
    </nav>
  `;
};
