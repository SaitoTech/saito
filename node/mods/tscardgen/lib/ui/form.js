const FormTemplate = require('./form.template');

class Form {
  constructor(app, mod, card_ui, container = '.tscardgen-controls') {
    this.app = app;
    this.mod = mod;
    this.card_ui = card_ui;
    this.container = container;
  }

  render() {
    const host = document.querySelector(this.container);
    if (!host) {
      return;
    }

    const existing = host.querySelector('.ts-form');
    const html = FormTemplate(this.mod.card);

    if (existing) {
      this.app.browser.replaceElementBySelector(html, `${this.container} .ts-form`);
    } else {
      this.app.browser.addElementToSelector(html, this.container);
    }

    this.attachEvents();
  }

  form() {
    return document.querySelector(`${this.container} .ts-form`);
  }

  attachEvents() {
    const form = this.form();
    if (!form) {
      return;
    }

    form.oninput = () => this.syncFromForm();
    form.onchange = () => this.syncFromForm();

    form.querySelector('.ts-redraw')?.addEventListener('click', () => {
      this.syncFromForm();
    });

    const file = form.querySelector('input[name="image"]');
    if (file) {
      file.onchange = () => this.onImageSelected(file);
    }
  }

  syncFromForm() {
    const form = this.form();
    if (!form) {
      return;
    }

    const data = new FormData(form);
    const card = this.mod.card;

    card.card_id = String(data.get('card_id') ?? '');
    card.deck = Number(data.get('deck') ?? 0);
    card.association = Number(data.get('association') ?? 0);
    card.ops = String(data.get('ops') ?? '');
    card.title = String(data.get('title') ?? '');
    card.font_size = Number(data.get('font_size') ?? 20);
    card.event = String(data.get('event') ?? '');
    card.event2 = String(data.get('event2') ?? '');
    card.event3 = String(data.get('event3') ?? '');
    card.pre_text = String(data.get('pre_text') ?? '');
    card.post_text = String(data.get('post_text') ?? '');
    card.optional = form.querySelector('input[name="optional"]')?.checked === true;
    card.removed = form.querySelector('input[name="removed"]')?.checked === true;
    card.permanent = form.querySelector('input[name="permanent"]')?.checked === true;
    card.image_style = data.get('image_style') === 'logo' ? 'logo' : 'photo';

    this.card_ui.draw();
  }

  onImageSelected(input) {
    const file = input.files && input.files[0];
    if (!file || !file.type.match(/^image\//)) {
      this.mod.card.image = null;
      this.mod.card.image_url = '';
      this.syncFromForm();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        this.mod.card.image = image;
        this.mod.card.image_url = String(reader.result || '');
        this.syncFromForm();
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }
}

module.exports = Form;
