const StatusHeaderTemplate = require('./status-header.template');

class StatusHeader {
  constructor(app, mod, containerSelector) {
    this.app = app;
    this.mod = mod;
    this.container = '.saito-header';
  }

  async render() {
    this.app.browser.addElementToSelector(StatusHeaderTemplate(this.app, this.mod), this.container);

    this.attachEvents();
  }

  attachEvents() {
    const hamburgerButton = document.getElementById('hamburger-button');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const menuContainer = document.getElementById('menu-container');

    let isMenuOpen = false;

    const toggleMenu = () => {
      isMenuOpen = !isMenuOpen;
      dropdownMenu.style.display = isMenuOpen ? 'block' : 'none';
      hamburgerButton.setAttribute('aria-expanded', isMenuOpen);
    };

    hamburgerButton.addEventListener('click', toggleMenu);

    document.addEventListener('mousedown', (event) => {
      if (isMenuOpen && !menuContainer.contains(event.target)) {
        isMenuOpen = false;
        dropdownMenu.style.display = 'none';
        hamburgerButton.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

module.exports = StatusHeader;
