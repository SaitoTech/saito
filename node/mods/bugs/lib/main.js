const Template = require('./main.template');

class BugsMain {
  constructor(app, mod, container = '#saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.state = {
      bugs: [],
      loading: true,
      error: '',
      filters: {
        view: 'active',
        status: '',
        severity: '',
        priority: '',
        assignee_publickey: '',
        reporter_publickey: '',
        search: '',
        sort: 'weight'
      }
    };
    app.connection.on('bugs-updated', () => {
      if (this.isActiveRoute()) return this.refreshCurrentView();
    });
    app.connection.on('bugs-candidate-discovered', () => {
      if (this.isActiveRoute() && !this.detailId()) return this.render();
    });
  }

  isActiveRoute() {
    return typeof window !== 'undefined' && /^\/bugs(?:\/|$)/.test(window.location.pathname);
  }

  detailId() {
    if (typeof window === 'undefined') return '';
    const match = window.location.pathname.match(/^\/bugs\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  async render() {
    const detailId = this.detailId();
    if (detailId) return this.renderDetail(detailId);
    this.replace(Template.list(this.state, this.mod));
    this.restoreFilters();
    this.attachListEvents();
    if (this.state.loading) await this.refresh();
  }

  replace(html) {
    if (document.querySelector(this.container)) {
      this.app.browser.replaceElementContentBySelector(html, this.container);
    } else {
      this.app.browser.addElementToDom(
        `<div id="saito-container" class="saito-container">${html}</div>`
      );
    }
  }

  restoreFilters() {
    const form = document.querySelector('.bugs-filters');
    if (!form) return;
    for (const [name, value] of Object.entries(this.state.filters)) {
      if (form.elements[name]) form.elements[name].value = value;
    }
  }

  async refresh() {
    this.state.loading = true;
    this.state.error = '';
    this.replace(Template.list(this.state, this.mod));
    this.restoreFilters();
    this.attachListEvents();
    try {
      this.state.bugs = await this.mod.loadBugs(this.state.filters);
    } catch (err) {
      this.state.error = err.message || String(err);
    }
    this.state.loading = false;
    this.replace(Template.list(this.state, this.mod));
    this.restoreFilters();
    this.attachListEvents();
  }

  async refreshCurrentView() {
    const id = this.detailId();
    return id ? this.renderDetail(id) : this.refresh();
  }

  attachListEvents() {
    document
      .querySelector('.bugs-create')
      ?.addEventListener('click', () => this.mod.editor.open('create'));
    const viewToggles = [...document.querySelectorAll('.bugs-view-input')];
    for (const viewToggle of viewToggles) {
      viewToggle.onchange = () => {
        const active = document.querySelector('[data-view="active"]');
        const completed = document.querySelector('[data-view="completed"]');
        if (!active.checked && !completed.checked) {
          viewToggle.checked = true;
          return;
        }
        this.state.filters.view =
          active.checked && completed.checked ? 'all' : completed.checked ? 'completed' : 'active';
        this.refresh();
      };
    }
    const filters = document.querySelector('.bugs-filters');
    if (filters) {
      filters.onchange = () => this.readFilters(filters);
      filters.onsubmit = (event) => {
        event.preventDefault();
        this.readFilters(filters);
      };
      let timer;
      filters.elements.search.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.readFilters(filters), 250);
      };
    }
    document.querySelectorAll('.bug-row').forEach((element) => {
      const id = element.dataset.id;
      element.querySelector('.bug-row-open').onclick = () => this.navigate(`/bugs/${id}`);
      element.querySelector('.bug-row-up')?.addEventListener('click', () => this.move(id, -1));
      element.querySelector('.bug-row-down')?.addEventListener('click', () => this.move(id, 1));
      element.querySelector('.bug-row-edit')?.addEventListener('click', () => {
        const bug = this.state.bugs.find((candidate) => candidate.root_tx_sig === id);
        if (bug) this.mod.editor.open('edit', bug);
      });
      element.ondragstart = (event) => event.dataTransfer.setData('text/plain', id);
      element.ondragover = (event) => event.preventDefault();
      element.ondrop = (event) => {
        event.preventDefault();
        this.mod.moveBug(
          event.dataTransfer.getData('text/plain'),
          id,
          this.state.bugs.map((bug) => bug.root_tx_sig)
        );
      };
    });
    document.querySelectorAll('.bugs-candidate-capture').forEach((button) => {
      button.onclick = () => {
        const candidate = this.mod.discoveredCandidates.get(button.dataset.id);
        if (candidate) this.mod.editor.open('capture', candidate);
      };
    });
  }

  readFilters(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    Object.assign(this.state.filters, data);
    this.refresh();
  }

  move(id, direction) {
    const index = this.state.bugs.findIndex((bug) => bug.root_tx_sig === id);
    const target = this.state.bugs[index + direction];
    if (target)
      this.mod.moveBug(
        id,
        target.root_tx_sig,
        this.state.bugs.map((bug) => bug.root_tx_sig)
      );
  }

  navigate(path) {
    window.history.pushState({}, '', path);
    this.render();
  }

  async renderDetail(id) {
    let bug = this.mod.clientBugs.get(id);
    if (!bug) bug = await this.mod.loadBug(id);
    if (!bug) {
      this.replace(
        '<main class="bugs-main"><div class="bugs-state" role="alert">Bug not found.</div></main>'
      );
      return;
    }
    this.replace(Template.detail(bug, this.mod));
    this.attachDetailEvents(bug);
    try {
      await this.mod.redsquare.renderThread('.bug-thread', {
        root_tx_sig: bug.root_tx_sig,
        source_tx_sig: bug.source_tx_sig,
        reply: true
      });
    } catch (err) {
      const host = document.querySelector('.bug-thread');
      if (host)
        host.innerHTML = `<div class="bugs-state" role="alert">${this.app.browser.escapeHTML(
          err.message
        )}</div>`;
    }
  }

  attachDetailEvents(bug) {
    document.querySelector('.bug-detail-back').onclick = () => this.navigate('/bugs');
    document.querySelector('.bug-detail-open-redsquare').onclick = () =>
      this.openInRedSquare(bug).catch((err) => this.mod.showError(err));
    document
      .querySelector('.bug-detail-edit')
      ?.addEventListener('click', () => this.mod.editor.open('edit', bug));
    document
      .querySelector('.bug-detail-delete')
      ?.addEventListener('click', () => this.mod.handleWorkflowAction(bug, 'untrack'));
    document.querySelector('.bug-detail-reply').onclick = () =>
      this.mod.replyToBug(bug).catch((err) => this.mod.showError(err));
    const metadataControls = [
      ['.bug-detail-status', 'set-status'],
      ['.bug-detail-severity', 'set-severity'],
      ['.bug-detail-priority', 'set-priority']
    ];
    for (const [selector, action] of metadataControls) {
      const control = document.querySelector(selector);
      if (control) {
        control.onchange = () => this.mod.handleWorkflowAction(bug, action, control.value);
      }
    }
  }

  async openInRedSquare(bug) {
    const bugsView = document.querySelector('.bugs-main');
    await this.mod.redsquare.openThread(bug.root_tx_sig, bug.source_tx_sig);

    // RedSquare may use Saito's soft navigation even though it is not the
    // active module. If that leaves the Bugs DOM mounted, complete the route
    // transition with a normal page load.
    if (bugsView?.isConnected && !window.location.pathname.startsWith('/bugs')) {
      window.location.reload();
    }
  }
}

module.exports = BugsMain;
