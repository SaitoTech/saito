module.exports = (create) => {
  const [primary, ...secondary] = create.getActions?.() || create.actions || [];
  const icon = (action) =>
    action.image
      ? `<span
          class="logo"
          style="--redsquare-create-logo: url('${action.image}')"
          aria-hidden="true"
        ></span>`
      : `<i class="${action.icon || 'fa-solid fa-plus'}" aria-hidden="true"></i>`;
  const primaryAction = primary
    ? `
        <div class="primary-action">
          <button
            type="button"
            class="action saito-button-primary compact"
            data-create="${primary.id}"
            aria-label="${primary.label}"
          >
            ${icon(primary)}
            <span>${primary.label}</span>
          </button>
          ${
            secondary.length
              ? `
                <button
                  type="button"
                  class="toggle saito-button-primary compact"
                  data-create-toggle
                  aria-label="Show publishing options"
                  aria-haspopup="menu"
                  aria-expanded="false"
                  aria-controls="redsquare-create-options"
                >
                  <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
                </button>
              `
              : ''
          }
        </div>
      `
    : '';
  const options = secondary
    .map(
      (action) => `
        <button
          type="button"
          class="action saito-button-secondary compact"
          data-create="${action.id}"
          aria-label="${action.label}"
          role="menuitem"
        >
          ${icon(action)}
          <span>${action.label}</span>
        </button>
      `
    )
    .join('');

  return `
      <div class="actions saito-sidebar-element">
        ${primaryAction}
        ${
          options
            ? `
              <div
                class="options"
                id="redsquare-create-options"
                data-create-menu
                role="menu"
                hidden
              >
                ${options}
              </div>
            `
            : ''
        }
      </div>
  `;
};
