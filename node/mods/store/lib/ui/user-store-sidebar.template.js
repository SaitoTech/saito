/**
 * Action rows for the seller profile menu. The sidebar wraps these with
 * the category list inside one nav.
 * @param {Array<{ action: string, label: string, icon: string }>} items
 */
module.exports = (items = []) => {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const action = String(item?.action || '').trim();
      const label = String(item?.label || '').trim();
      const icon = String(item?.icon || '').trim();
      if (!action || !label || !icon) {
        return '';
      }
      return `
      <div class="item" role="button" tabindex="0" data-nav-action="${action}">
        <span class="icon" aria-hidden="true"><i class="${icon}"></i></span>
        <span class="label">${label}</span>
      </div>`;
    })
    .filter(Boolean)
    .join('');
};
