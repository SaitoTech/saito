const ReferenceSidebarTemplate = require('./reference-sidebar.template');
const DocsClient = require('../docs/docs-client');

class ReferenceSidebar {
  constructor(app, mod, container = '.tscardgen-sidebar') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.docs = new DocsClient();
  }

  async render() {
    const host = document.querySelector(this.container);
    if (!host) {
      return;
    }

    host.innerHTML = '';
    this.app.browser.addElementToSelector(ReferenceSidebarTemplate(), this.container);
    this.attachEvents();
  }

  attachEvents() {
    const root = document.querySelector(`${this.container} .ts-reference-sidebar`);
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-ref]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const ref = button.getAttribute('data-ref');
        if (ref === 'api') {
          await this.openProgrammingApi();
          return;
        }
        if (ref === 'howto') {
          await this.openHowTo();
        }
      });
    });
  }

  async openProgrammingApi() {
    const index = await this.docs.loadIndex();
    const api_entries = (index.entries || []).filter((entry) =>
      String(entry.id || '').startsWith('api-')
    );
    this.openStubDocument({
      title: 'Programming API',
      summary: 'Temporary local stub until Saito Wiki pages are published.',
      body: api_entries
        .map(
          (entry) => `
          <section>
            <h2>${escapeHtml(entry.title)}</h2>
            <p>${escapeHtml(entry.summary || '')}</p>
            ${entry.body || ''}
          </section>
        `
        )
        .join('')
    });
  }

  async openHowTo() {
    const entry = await this.docs.getEntry('overview');
    this.openStubDocument({
      title: 'How to Program a Card',
      summary: 'Temporary local stub until Saito Wiki pages are published.',
      body: entry?.body || `<p>${escapeHtml(entry?.summary || '')}</p>`
    });
  }

  openStubDocument({ title, summary, body }) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(
      title
    )}</title>
      <style>
        body{font:1.4rem/1.55 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1.25rem;color:#111}
        code{font-family:ui-monospace,Menlo,Consolas,monospace}
        h1{font-size:1.9rem;margin-bottom:0.4rem}
        h2{font-size:1.55rem;margin-top:1.75rem}
        .note{color:#555;margin-bottom:1.5rem}
        section{border-top:1px solid #ddd;padding-top:0.75rem;margin-top:1rem}
      </style></head><body>
      <h1>${escapeHtml(title)}</h1>
      <p class="note">${escapeHtml(summary || '')}</p>
      ${body || ''}
      </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ReferenceSidebar;
