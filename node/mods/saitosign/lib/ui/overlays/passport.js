class Passport {
  constructor() {
    this.hooks = {};
    this.error = '';
  }

  attach(root, hooks = {}) {
    this.hooks = hooks;
    if (!root || root.dataset.passportBound === '1') {
      return;
    }
    root.dataset.passportBound = '1';

    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-passport-file]')) {
        return;
      }
      if (event.target.closest('[data-passport-remove]')) {
        event.preventDefault();
        this.error = '';
        this.hooks.onRemove?.();
        return;
      }
      if (event.target.closest('[data-passport-choose]')) {
        event.preventDefault();
        root.querySelector('[data-passport-file]')?.click();
        return;
      }
      if (event.target.closest('[data-passport-drop]')) {
        root.querySelector('[data-passport-file]')?.click();
      }
    });

    root.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-passport-drop]')) {
        event.preventDefault();
        root.querySelector('[data-passport-file]')?.click();
      }
    });

    root.addEventListener('change', (event) => {
      const input = event.target.closest('[data-passport-file]');
      if (input?.files?.[0]) {
        this.readFile(input.files[0], root);
        input.value = '';
      }
    });

    root.addEventListener('dragover', (event) => {
      if (event.target.closest('[data-passport-drop]')) {
        event.preventDefault();
        event.target.closest('[data-passport-drop]').classList.add('dragging');
      }
    });
    root.addEventListener('dragleave', (event) => {
      event.target.closest('[data-passport-drop]')?.classList.remove('dragging');
    });
    root.addEventListener('drop', (event) => {
      const drop = event.target.closest('[data-passport-drop]');
      if (!drop) {
        return;
      }
      event.preventDefault();
      drop.classList.remove('dragging');
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        this.readFile(file, root);
      }
    });
  }

  async readFile(file, root) {
    if (!file.type?.startsWith('image/')) {
      this.fail(root, 'Choose an image file.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      this.fail(root, 'Choose an image smaller than 12 MB.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const image = `data:${file.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.error = '';
      this.hooks.onUpload?.(image);
    } catch (err) {
      this.fail(root, 'That passport image could not be read.');
    }
  }

  fail(root, message) {
    this.error = message;
    const node = root.querySelector('[data-passport-error]');
    if (node) {
      node.textContent = message;
    }
    this.hooks.onError?.(message);
  }
}

module.exports = Passport;
