const FormTemplate = require('./form.template');
const ImageUploadOverlay = require('./overlays/image-upload');
const NonCardConfirm = require('./overlays/non-card-confirm');

class Form {
  constructor(app, mod, main, container = '.tscardgen-controls') {
    this.app = app;
    this.mod = mod;
    this.main = main;
    this.card_ui = main.card_ui;
    this.container = container;
    this.image_upload = new ImageUploadOverlay(app, mod);
    this.non_card_confirm = new NonCardConfirm(app, mod);
  }

  render() {
    const host = document.querySelector(this.container);
    if (!host) {
      return;
    }

    host.innerHTML = '';
    this.app.browser.addElementToSelector(FormTemplate(this.mod.card), this.container);
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
    form.onchange = (event) => {
      const target = event?.target;
      if (target?.name === 'card_type' && target.value === 'programmable') {
        const previous = this.currentCardType();
        target.value = previous;
        this.askProgrammableConfirm(target);
        return;
      }
      this.syncFromForm();
    };

    form.querySelector('.ts-add-image')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.openImageUpload();
    });

    form.querySelector('.ts-download-png')?.addEventListener('click', async (event) => {
      event.preventDefault();
      await this.main.downloadPng();
    });

    form.querySelector('.ts-create-nft')?.addEventListener('click', async () => {
      this.syncFromForm();
      await this.main.requestCreateNft();
    });
  }

  currentCardType() {
    if (this.mod.card.non_card) {
      return 'programmable';
    }
    if (this.mod.card.scoring) {
      return 'scoring';
    }
    return 'normal';
  }

  askProgrammableConfirm(select) {
    this.non_card_confirm.on_confirm = () => {
      select.value = 'programmable';
      this.syncFromForm();
    };
    this.non_card_confirm.on_cancel = () => {
      select.value = this.currentCardType();
      this.syncFromForm();
    };
    this.non_card_confirm.render();
  }

  openImageUpload() {
    this.image_upload.callbackAfterConfirm = (data_url) => {
      this.applyImageDataUrl(data_url);
    };
    this.image_upload.render(this.mod.card.image_url || null);
  }

  applyImageDataUrl(data_url) {
    if (!data_url) {
      this.mod.card.image = null;
      this.mod.card.image_url = '';
      this.syncFromForm({ skip_autosave: true });
      this.updateImageButtonLabel();
      this.main.scheduleCardSave({ immediate: true });
      return;
    }

    const image = new Image();
    image.onload = () => {
      this.mod.card.image = image;
      this.mod.card.image_url = String(data_url);
      this.syncFromForm({ skip_autosave: true });
      this.updateImageButtonLabel();
      this.main.scheduleCardSave({ immediate: true });
    };
    image.onerror = () => {
      console.error('TSCardGen: failed to load confirmed image');
    };
    image.src = String(data_url);
  }

  updateImageButtonLabel() {
    const button = this.form()?.querySelector('.ts-add-image');
    if (!button) {
      return;
    }
    const has_image = Boolean(this.mod.card.image_url || this.mod.card.image);
    button.textContent = has_image ? 'Change Image' : 'Add Image';
  }

  applyCardType(type) {
    if (type === 'scoring') {
      this.mod.card.scoring = true;
      this.mod.card.non_card = false;
      return;
    }
    if (type === 'programmable') {
      this.mod.card.scoring = false;
      this.mod.card.non_card = true;
      return;
    }
    this.mod.card.scoring = false;
    this.mod.card.non_card = false;
  }

  syncFromForm(options = {}) {
    const form = this.form();
    if (!form) {
      return;
    }

    const data = new FormData(form);
    const card = this.mod.card;

    card.card_id = String(data.get('card_id') ?? '');
    card.deck = Number(data.get('deck') ?? 0);
    card.player = card.normalizePlayer(data.get('player') ?? 'both');
    card.ops = String(data.get('ops') ?? '');
    card.title = String(data.get('title') ?? '');
    card.font_size = Number(data.get('font_size') ?? 20);
    card.event = String(data.get('event') ?? '');
    card.event2 = String(data.get('event2') ?? '');
    card.event3 = String(data.get('event3') ?? '');
    card.pre_text = String(data.get('pre_text') ?? '');
    card.post_text = String(data.get('post_text') ?? '');
    card.removed = form.querySelector('input[name="removed"]')?.checked === true;
    card.permanent = form.querySelector('input[name="permanent"]')?.checked === true;
    this.applyCardType(String(data.get('card_type') ?? 'normal'));
    card.image_style =
      form.querySelector('input[name="photo_border"]')?.checked === true ? 'photo' : 'logo';

    this.card_ui.draw();

    if (!options.skip_autosave) {
      this.main.scheduleCardSave();
    }
  }
}

module.exports = Form;
