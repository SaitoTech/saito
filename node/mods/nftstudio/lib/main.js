const MainTemplate = require('./main.template');
const { loadDraft, saveDraft } = require('./draft-store');
const { validateSource } = require('./validator');

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

class NFTStudioMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.editor = null;
    this.validationTimer = null;
    this.previewVisible = false;
    this.sidebarExpanded = true;
    this.type = 'js';
    this.title = 'Untitled NFT';
    this.source = '';
    this.isDirty = false;
  }

  render() {
    const container = document.querySelector('.saito-container');
    if (!container) {
      return;
    }

    this.teardown();
    document.body.classList.add('nftstudio-page');
    if (container.querySelector('.nftstudio')) {
      this.app.browser.replaceElementBySelector(MainTemplate(), '.nftstudio');
    } else {
      this.app.browser.addElementToSelector(MainTemplate(), '.saito-container');
    }

    this.restoreDraft();
    this.renderEditor();
    this.syncFields();
    this.attachEvents();
    this.syncLayout();
    this.validate();
  }

  teardown() {
    clearTimeout(this.validationTimer);
    this.editor?.getWrapperElement().remove();
    this.editor = null;
  }

  restoreDraft() {
    try {
      const draft = loadDraft(window.localStorage);
      if (!draft) {
        this.setDraftStatus('No local draft loaded');
        return;
      }
      this.type = draft.type;
      this.title = draft.title;
      this.source = draft.source;
      this.setDraftStatus(`Local draft restored from ${this.formatTime(draft.savedAt)}`);
    } catch (err) {
      this.setDraftStatus(err.message, true);
    }
  }

  renderEditor() {
    const parent = document.querySelector('.nftstudio .editor');
    this.editor = window.CodeMirror(parent, {
      value: this.source,
      mode: this.languageMode(),
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2
    });
    this.editor.on('change', () => {
      this.source = this.editor.getValue();
      this.markDirty();
      clearTimeout(this.validationTimer);
      this.validationTimer = setTimeout(() => {
        const validation = this.validate();
        if (this.type === 'css' && this.previewVisible) {
          if (validation.valid) {
            this.renderCssPreview();
          } else {
            this.clearPreview();
          }
        }
      }, 300);
    });
  }

  languageMode() {
    return this.type === 'css' ? 'css' : 'javascript';
  }

  syncFields() {
    document.querySelector('#nftstudio-title').value = this.title;
    document.querySelector('#nftstudio-type').value = this.type;
    this.updateFilename();
  }

  attachEvents() {
    document.querySelector('#nftstudio-title').addEventListener('input', (event) => {
      this.title = event.target.value;
      this.updateFilename();
      this.markDirty();
    });
    document.querySelector('#nftstudio-type').addEventListener('change', (event) => {
      this.type = event.target.value;
      this.editor.setOption('mode', this.languageMode());
      this.updateFilename();
      this.previewVisible = false;
      this.clearPreview();
      this.syncLayout();
      this.markDirty();
      this.validate();
    });

    document
      .querySelector('[data-action="new"]')
      .addEventListener('click', () => this.newDocument());
    document.querySelector('[data-action="save"]').addEventListener('click', () => this.save());
    document.querySelector('[data-action="import"]').addEventListener('click', () => {
      const input = document.querySelector('.nftstudio .file-input');
      input.value = '';
      input.click();
    });
    document
      .querySelector('[data-action="export"]')
      .addEventListener('click', () => this.exportFile());
    document.querySelector('[data-action="toggle-tools"]').addEventListener('click', () => {
      this.sidebarExpanded = !this.sidebarExpanded;
      this.syncLayout();
    });
    document.querySelector('[data-action="toggle-preview"]').addEventListener('click', () => {
      this.togglePreview();
    });
    document
      .querySelector('[data-action="validate"]')
      .addEventListener('click', () => this.validate(true));
    document.querySelector('[data-action="run"]').addEventListener('click', () => this.run());
    document
      .querySelector('[data-action="publish"]')
      .addEventListener('click', () => this.publish());
    document
      .querySelector('.nftstudio .file-input')
      .addEventListener('change', (event) => this.importFile(event.target.files?.[0]));
  }

  updateFilename() {
    const base = this.safeFilename(this.title || 'untitled-nft');
    document.querySelector('.nftstudio .filename').textContent = `${base}.${this.type}`;
  }

  syncLayout() {
    const studio = document.querySelector('.nftstudio');
    const workspace = studio.querySelector('.workspace');
    const previewPanel = studio.querySelector('.preview-panel');
    const toolsToggle = studio.querySelector('[data-action="toggle-tools"]');
    const previewToggle = studio.querySelector('[data-action="toggle-preview"]');
    const runAction = studio.querySelector('[data-action="run"]');
    const isCss = this.type === 'css';

    if (!isCss) {
      this.previewVisible = false;
    }

    studio.classList.toggle('tools-collapsed', !this.sidebarExpanded);
    toolsToggle.setAttribute('aria-expanded', String(this.sidebarExpanded));
    toolsToggle.setAttribute(
      'aria-label',
      this.sidebarExpanded ? 'Collapse tools' : 'Expand tools'
    );
    toolsToggle.title = this.sidebarExpanded ? 'Collapse tools' : 'Expand tools';
    toolsToggle.querySelector('i').className = this.sidebarExpanded
      ? 'fa-solid fa-chevron-left'
      : 'fa-solid fa-chevron-right';

    workspace.classList.toggle('preview-visible', isCss && this.previewVisible);
    previewPanel.hidden = !isCss || !this.previewVisible;
    previewToggle.hidden = !isCss;
    previewToggle.setAttribute('aria-pressed', String(this.previewVisible));
    previewToggle.setAttribute(
      'aria-label',
      this.previewVisible ? 'Hide side-by-side preview' : 'Show side-by-side preview'
    );
    previewToggle.title = this.previewVisible
      ? 'Hide side-by-side preview'
      : 'Show side-by-side preview';

    runAction.title = isCss ? 'Preview CSS theme' : 'Run JavaScript NFT';
    runAction.setAttribute('aria-label', runAction.title);
    runAction.querySelector('i').className = isCss ? 'fa-solid fa-eye' : 'fa-solid fa-play';
    runAction.querySelector('span').textContent = isCss ? 'Preview' : 'Run';

    window.requestAnimationFrame(() => this.editor?.refresh());
  }

  markDirty() {
    this.isDirty = true;
    this.setDraftStatus('Unsaved changes');
  }

  newDocument() {
    if (this.isDirty && !window.confirm('Discard unsaved changes and create a new NFT?')) {
      return false;
    }

    this.title = '';
    this.type = 'js';
    this.source = '';
    this.previewVisible = false;
    this.replaceEditorSource('');
    this.editor.setOption('mode', this.languageMode());
    this.syncFields();
    this.clearPreview();
    this.syncLayout();
    this.validate();
    this.isDirty = false;
    this.setDraftStatus('New NFT');
    this.editor.focus();
    return true;
  }

  save() {
    try {
      const draft = saveDraft(window.localStorage, {
        title: this.title,
        type: this.type,
        source: this.source
      });
      this.isDirty = false;
      this.setDraftStatus(`Saved locally at ${this.formatTime(draft.savedAt)}`);
    } catch (err) {
      this.setDraftStatus(`Draft could not be saved: ${err.message}`, true);
    }
  }

  async importFile(file) {
    if (!file) {
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.setDraftStatus('Import failed: file must be 2 MB or smaller', true);
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['js', 'css'].includes(extension)) {
      this.setDraftStatus('Import failed: choose a .js or .css file', true);
      return;
    }

    try {
      this.type = extension;
      this.title = file.name.replace(/\.(js|css)$/i, '') || 'Untitled NFT';
      this.source = await file.text();
      this.previewVisible = false;
      this.replaceEditorSource(this.source);
      this.editor.setOption('mode', this.languageMode());
      this.syncFields();
      this.clearPreview();
      this.syncLayout();
      this.markDirty();
      this.validate();
    } catch (err) {
      this.setDraftStatus(`Import failed: ${err.message}`, true);
    }
  }

  exportFile() {
    const blob = new Blob([this.source], {
      type: this.type === 'css' ? 'text/css;charset=utf-8' : 'text/javascript;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.safeFilename(this.title || 'untitled-nft')}.${this.type}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  replaceEditorSource(source) {
    this.editor.setValue(source);
  }

  validate(focusError = false) {
    const result = validateSource(this.type, this.source);
    const validation = document.querySelector('.nftstudio .validation');
    validation.dataset.state = result.valid ? 'valid' : 'invalid';
    validation.querySelector('.message').textContent = result.message;

    if (result.valid) {
      this.clearError();
    } else {
      const location = result.line ? `Line ${result.line}, column ${result.column || 1}: ` : '';
      this.showError(`${location}${result.message}`);
      if (focusError && result.line) {
        this.focusLine(result.line);
      }
    }
    return result;
  }

  focusLine(lineNumber) {
    const line = Math.min(Math.max(lineNumber - 1, 0), this.editor.lineCount() - 1);
    this.editor.setCursor({ line, ch: 0 });
    this.editor.scrollIntoView({ line, ch: 0 }, 100);
    this.editor.focus();
  }

  async run() {
    const validation = this.validate(true);
    if (!validation.valid) {
      this.clearPreview();
      return;
    }

    if (this.type === 'css') {
      this.previewVisible = true;
      this.syncLayout();
      this.renderCssPreview();
      return;
    }

    this.previewVisible = false;
    this.clearPreview();
    this.syncLayout();

    try {
      await this.executeJavascript();
    } catch (error) {
      this.showError(`Runtime error: ${error?.message || String(error)}`);
    }
  }

  togglePreview() {
    if (this.type !== 'css') {
      return;
    }
    if (this.previewVisible) {
      this.previewVisible = false;
      this.syncLayout();
      return;
    }
    this.run();
  }

  executeJavascript() {
    const execute = new Function(`return (async () => {\n${this.source}\n})()`);
    return execute.call(this.app?.wallet || this);
  }

  renderCssPreview() {
    document.querySelector('.nftstudio .preview').srcdoc = this.cssPreview();
  }

  publish() {
    const validation = this.validate(true);
    if (!validation.valid) {
      return;
    }

    const title = this.title.trim() || 'Untitled NFT';
    this.app.connection.emit('saito-nft-create-render-request', {
      type: this.type,
      content: this.source,
      title,
      description: `${this.type === 'css' ? 'CSS' : 'JavaScript'} NFT created with NFT Studio`,
      locked: ['type', 'content'],
      callback: (result = {}) => {
        if (result.status === 'created') {
          this.setDraftStatus('NFT published');
        } else if (result.status === 'error') {
          this.setDraftStatus(`Publish failed: ${result.error || 'unknown error'}`, true);
        }
      }
    });
  }

  cssPreview() {
    const stylesheet = `data:text/css;charset=utf-8,${encodeURIComponent(this.source)}`;
    return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/saito/saito.css">
  <style>
    body { margin: 0; padding: var(--saito-space-lg); }
    .theme-preview { display: grid; gap: var(--saito-space-lg); max-width: 96rem; margin: 0 auto; }
    .theme-preview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(28rem, 1fr)); gap: var(--saito-space-md); }
    .theme-preview-section { display: grid; gap: var(--saito-space-md); padding: var(--saito-space-lg); border: 1px solid var(--saito-border); border-radius: var(--saito-radius); background: var(--saito-card); }
    .theme-preview-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: var(--saito-space-md); }
    .theme-preview-field { display: grid; gap: var(--saito-space-xs); }
    .theme-preview-inline { display: flex; flex-wrap: wrap; align-items: center; gap: var(--saito-space-md); }
    .theme-preview-table { width: 100%; border-collapse: collapse; }
    .theme-preview-table :is(th, td) { padding: var(--saito-space-sm); border: 1px solid var(--saito-border); text-align: left; }
    figure { margin: 0; }
    svg { width: 100%; max-height: 16rem; color: var(--saito-primary); background: var(--saito-muted); }
  </style>
  <link rel="stylesheet" href="${stylesheet}">
  <title>CSS theme preview</title>
</head>
<body>
  <header class="theme-preview theme-preview-section">
    <span>Header</span>
    <nav class="theme-preview-inline" aria-label="Preview navigation">
      <a href="#typography">Typography</a><a href="#forms">Forms</a><a href="#content">Content</a>
    </nav>
  </header>
  <main class="theme-preview">
    <section id="typography" class="theme-preview-section">
      <h1>Heading level one</h1><h2>Heading level two</h2><h3>Heading level three</h3>
      <h4>Heading level four</h4><h5>Heading level five</h5><h6>Heading level six</h6>
      <p>Body text with <a href="#">a link</a>, <strong>strong text</strong>, <em>emphasis</em>, <mark>highlighting</mark>, <small>small text</small>, and <code>inline code</code>.</p>
      <blockquote>Blockquote text demonstrates longer quoted content.</blockquote>
      <pre><code>const theme = 'CSS NFT';</code></pre>
      <hr>
    </section>

    <div class="theme-preview-grid">
      <article id="content" class="theme-preview-section">
        <h2>Lists and disclosure</h2>
        <ul><li>Unordered item</li><li>Another item</li></ul>
        <ol><li>Ordered item</li><li>Another item</li></ol>
        <dl><dt>Definition term</dt><dd>Definition description</dd></dl>
        <details><summary>Expandable details</summary><p>Details content.</p></details>
      </article>
      <aside class="theme-preview-section">
        <h2>Media and status</h2>
        <figure>
          <svg viewBox="0 0 480 180" role="img" aria-label="Theme colour sample"><rect width="480" height="180" fill="currentColor"></rect><circle cx="240" cy="90" r="55" fill="var(--saito-background)"></circle></svg>
          <figcaption>Figure caption</figcaption>
        </figure>
        <label>Progress <progress value="68" max="100">68%</progress></label>
        <label>Meter <meter min="0" max="100" value="72">72%</meter></label>
      </aside>
    </div>

    <section id="forms" class="theme-preview-section">
      <h2>Form elements</h2>
      <form>
        <fieldset class="theme-preview-section">
          <legend>Account details</legend>
          <div class="theme-preview-fields">
            <label class="theme-preview-field">Text<input class="saito-input" type="text" placeholder="Text input"></label>
            <label class="theme-preview-field">Email<input class="saito-input" type="email" placeholder="name@example.com"></label>
            <label class="theme-preview-field">Password<input class="saito-input" type="password" value="password"></label>
            <label class="theme-preview-field">Search<input class="saito-input" type="search" placeholder="Search"></label>
            <label class="theme-preview-field">Number<input class="saito-input" type="number" value="42"></label>
            <label class="theme-preview-field">Date<input class="saito-input" type="date" value="2026-08-14"></label>
            <label class="theme-preview-field">Select<select class="saito-form-select"><option>First option</option><option>Second option</option></select></label>
            <label class="theme-preview-field">File<input type="file"></label>
          </div>
          <label class="theme-preview-field">Textarea<textarea class="saito-textarea" rows="4" placeholder="Longer text"></textarea></label>
          <div class="theme-preview-inline">
            <label><input class="saito-checkbox" type="checkbox" checked> Checked</label>
            <label><input class="saito-checkbox" type="checkbox"> Checkbox</label>
            <label><input class="saito-radio" type="radio" name="choice" checked> Radio one</label>
            <label><input class="saito-radio" type="radio" name="choice"> Radio two</label>
          </div>
          <label class="theme-preview-field">Range<input class="saito-range" type="range" min="0" max="100" value="60"></label>
          <div class="saito-button-row auto-size">
            <button class="saito-button-primary" type="button">Primary</button>
            <button class="saito-button-secondary" type="button">Secondary</button>
            <button type="button">Default</button>
            <button class="saito-button-primary" type="button" disabled>Disabled</button>
          </div>
        </fieldset>
      </form>
    </section>

    <section class="theme-preview-section">
      <h2>Table</h2>
      <table class="theme-preview-table">
        <caption>Example data</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Value</th></tr></thead>
        <tbody><tr><th scope="row">Alpha</th><td>Active</td><td>100</td></tr><tr><th scope="row">Beta</th><td>Pending</td><td>64</td></tr></tbody>
      </table>
    </section>
  </main>
  <footer class="theme-preview theme-preview-section"><span>Footer content</span><a href="#">Footer link</a></footer>
</body>
</html>`;
  }

  clearPreview() {
    document.querySelector('.nftstudio .preview').srcdoc =
      '<!doctype html><html><body></body></html>';
  }

  showError(message) {
    const error = document.querySelector('.nftstudio .error');
    error.textContent = message;
    error.classList.add('is-error');
    error.classList.remove('is-valid');
  }

  clearError() {
    const error = document.querySelector('.nftstudio .error');
    error.textContent = 'OK';
    error.classList.remove('is-error');
    error.classList.add('is-valid');
  }

  setDraftStatus(message, isError = false) {
    const status = document.querySelector('.nftstudio .draft-status');
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  safeFilename(value) {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'untitled-nft'
    );
  }

  formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'an unknown time' : date.toLocaleTimeString();
  }
}

module.exports = NFTStudioMain;
