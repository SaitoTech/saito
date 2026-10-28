module.exports = (app, mod) => {
  const sidebars = (app.modules.getRespondTos?.('admin-sidebar') || []).filter(
    (panel) =>
      panel &&
      typeof panel.render === 'function' &&
      panel.name &&
      /^[a-z0-9_-]+$/i.test(String(panel.id || ''))
  );

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const sidebarNav = sidebars
    .map(
      (panel) =>
        `<div class="saito-admin-nav-item" data-admin-view="${escapeHtml(panel.id)}">${escapeHtml(
          panel.name
        )}</div>`
    )
    .join('');

  const sidebarPages = sidebars
    .map((panel) => `<div class="admin-page admin-${escapeHtml(panel.id)}"></div>`)
    .join('');

  return `
    <div class="saito-admin-main">
      <div class="saito-admin-sidebar">
        <a class="saito-admin-back" href="/" aria-label="Back to Saito" title="Back to Saito">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </a>
        <div class="saito-admin-nav-item overview active" data-admin-view="overview">Overview</div>
        <div class="saito-admin-nav-item peers" data-admin-view="peers">Network</div>
        <div class="saito-admin-nav-item modules" data-admin-view="modules">Modules</div>
        <div class="saito-admin-nav-item administrators" data-admin-view="administrators">Administrators</div>
        <div class="saito-admin-nav-item database" data-admin-view="database">Database</div>
        <div class="saito-admin-nav-item blocks" data-admin-view="blocks">Blocks</div>
        <div class="saito-admin-nav-item mempool" data-admin-view="mempool">Mempool</div>
        ${sidebarNav}
        <label class="admin-theme-option" for="admin-dark-mode" title="Save your appearance preference in this browser.">
          <input type="checkbox" id="admin-dark-mode" />
          <span>Dark mode</span>
        </label>
      </div>

      <div class="saito-admin-content" id="saito-admin-content">

        <div class="admin-page admin-overview"></div>

        <div class="admin-page admin-modules"></div>

        <div class="admin-page admin-peers"></div>
        <div class="admin-page admin-administrators"></div>

        <div class="admin-page admin-database"></div>

        <div class="admin-page admin-blocks"></div>

        <div class="admin-page admin-mempool"></div>

        ${sidebarPages}

        <div class="admin-wiki">For manual setup instructions, please see our install instructions in the <a target="_blank" href="https://wiki.saito.io">Saito Wiki</a>.</div>

      </div>
    </div>
  `;
};
