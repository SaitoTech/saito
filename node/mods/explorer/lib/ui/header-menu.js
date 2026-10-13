const HeaderMenuTemplate = require('./header-menu.template');

class HeaderMenu {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.events = null;
  }

  render() {
    this.events?.abort();
    document.querySelector('.explorer-header-menu')?.remove();
    const host = document.querySelector('.explorer-utility-inner');
    if (!host) return;

    host.insertAdjacentHTML('beforeend', HeaderMenuTemplate());
    const root = host.querySelector('.explorer-header-menu');
    const toggle = root.querySelector('button');
    const navigation = root.querySelector('nav');
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      navigation.hidden = !open;
    };

    this.events = new AbortController();
    const options = { signal: this.events.signal };
    toggle.addEventListener('click', () => setOpen(navigation.hidden), options);
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !navigation.hidden) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        toggle.focus();
      }
    }, options);
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) setOpen(false);
    }, options);
    document.addEventListener('click', (event) => {
      if (!root.contains(event.target)) setOpen(false);
    }, options);
    navigation.addEventListener('click', (event) => {
      const link = event.target.closest('[data-explorer-header-nav]');
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      toggle.focus();
      const view = link.dataset.explorerHeaderNav;
      if (view === 'chain') this.mod.renderChain('');
      if (view === 'supply') this.mod.renderSupply({ pushState: true, animate: true });
      if (view === 'holders') this.mod.renderHolders();
    }, options);
  }
}

module.exports = HeaderMenu;
