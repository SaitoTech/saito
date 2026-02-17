const SaitoLinkTemplate = require('./link.template');

/**
 *  Class to pretty print a link (in Chat or RedSquare)
 */
class SaitoLink {
  constructor(app, mod, container = '', url = '', link_properties = null) {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.url = url;
    this.display_url = url;
    this.link_properties = link_properties;

    this.show_photo = false;
    this.src = '';
    this.title = '';
    this.description = '';

    if (this.link_properties) {
      if (this.link_properties['og:image']) {
        this.src = this.link_properties['og:image'];
        this.show_photo = true;
      }
      if (this.link_properties['og:url'] && this.link_properties['og:url'] != 'undefined') {
        this.display_url = this.link_properties['og:url'];
      }
      if (this.link_properties['og:title']) {
        this.title = this.link_properties['og:title'];
      }
      if (this.link_properties['saito:title']) {
        this.title = this.link_properties['saito:title'];
      }
      if (this.link_properties['og:description']) {
        this.description = this.link_properties['og:description'];
      }
      if (this.link_properties['saito:description']) {
        this.description = this.link_properties['saito:description'];
      }
    }
  }

  render() {
    //
    // replace element or insert into page
    //
    if (this.url) {
      let qs = this.container + ' > .link-preview';

      if (document.querySelector(qs)) {
        this.app.browser.replaceElementBySelector(SaitoLinkTemplate(this), qs);
      } else if (document.querySelector(this.container)) {
        this.app.browser.addElementToSelector(SaitoLinkTemplate(this), this.container);
      }

      this.attachEvents();
    }
  }

  attachEvents() {
    if (this.src) {
      if (!this.test) {
        this.test = new Image();
        this.test.onerror = () => {
          this.show_photo = false;
          console.warn('Saito image load failed! \n', this.title, this.src);
          if (this.src.toLowerCase().includes('saito')) {
            //
            // Fallback if missing our own hosted photo
            this.src = '/saito/img/backgrounds/red_cube_dark.jpg';
            this.show_photo = true;
          } else if (!this.app.browser.urlRegexp().test(this.src) && !this.src.includes('data:')) {
            //
            // Fall back for raw data
            let img_type = 'jpeg';
            if (this.src.charAt(0) == 'i') {
              img_type = 'png';
            }
            if (this.src.charAt(0) == 'R') {
              img_type = 'gif';
            }
            this.src = `data:image/${img_type};base64,` + this.src;
            this.show_photo = true;
          } else {
            this.src = '/saito/img/dreamscape.png';
          }
          this.render();
        };
        this.test.src = this.src;
      }
    }
  }
}

module.exports = SaitoLink;
