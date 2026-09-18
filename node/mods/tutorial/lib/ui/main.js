const MainTemplate = require('./main.template');

class Main {

  constructor(app, mod, container = '#saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }


  render(container = '') {

    if (container) {
      this.container = container;
    }

    if (!document.querySelector(this.container)) {
      this.app.browser.addElementToDom(MainTemplate());
    } else {
      this.app.browser.replaceElementContentBySelector(MainTemplate(), this.container);
    }

    this.attachEvents();

  }


  attachEvents() {

    let el = document.querySelector(".main-button");
    if (el) {
      el.onclick = (e) => {
	alert("Click");
      }
    };

  }

}

module.exports = Main;
