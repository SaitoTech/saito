module.exports = (app, mod) => {
  return `

    <div class="saito-admin-main">
      <div class="saito-admin-sidebar">
        <div class="saito-admin-nav-item overview active" data-admin-view="overview">Overview</div>
        <div class="saito-admin-nav-item modules" data-admin-view="modules">Modules</div>
        <div class="saito-admin-nav-item peers" data-admin-view="peers">Peers</div>
        <div class="saito-admin-nav-item database" data-admin-view="database">Database</div>
        <div class="saito-admin-nav-item blocks" data-admin-view="blocks">Blocks</div>
        <div class="saito-admin-nav-item mempool" data-admin-view="mempool">Mempool</div>
        <div class="saito-admin-nav-item options" data-admin-view="options">Config</div>
      </div>

      <div class="saito-admin-content" id="saito-admin-content">

	<div class="admin-overview">
        </div>

        <div class="admin-modules">
        </div>

        <div class="admin-peers">
        </div>

        <div class="admin-database">
        </div>

        <div class="admin-blocks">
        </div>

        <div class="admin-memepool">
        </div>

        <div class="admin-options">
        </div>

        <div class="admin-wiki">For manual setup instructions, please see our install instructions in the <a target='_blank' href="https://wiki.saito.io">Saito Wiki</a>.</div>

      </div>
    </div>

    `;
}

