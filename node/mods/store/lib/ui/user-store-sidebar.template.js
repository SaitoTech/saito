/**
 * Store-owned profile footer nav (injected into SaitoProfile footer slot).
 * @param {{ action: string, state: string, label: string, icon: string } | null} contact
 */
module.exports = (contact = null) => {
  if (!contact) {
    return '';
  }

  const action = String(contact.action || '').trim();
  const state = String(contact.state || '').trim();
  const label = String(contact.label || '').trim();
  const icon = String(contact.icon || '').trim();
  if (!action || !label || !icon) {
    return '';
  }

  return `
    <nav class="user-store-nav saito-menu-select-subtle" aria-label="Contact seller">
      <div
        class="item"
        role="button"
        tabindex="0"
        data-contact-action="${action}"
        data-contact-state="${state}"
      >
        <span class="icon" aria-hidden="true"><i class="${icon}"></i></span>
        <span class="label">${label}</span>
      </div>
    </nav>
  `;
};
