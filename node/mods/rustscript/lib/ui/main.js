const RustscriptMainTemplate = require('./main.template.js');
const GenerateExpertOverlay = require('./overlays/generate_expert.js');

const TEMPLATE_OPCODES = [
  { name: 'CHECKSIG', description: 'Verify a signature against a public key' },
  { name: 'IMPORTFIELD', description: 'Import a tx field into context (AS alias)' },
  { name: 'CHECKRECIPIENT', description: 'Verify recipient public key' },
  { name: 'CHECKTIME', description: 'Time constraint (future)' },
  { name: 'CHECKFIELD', description: 'Field constraint (future)' }
];

const DEFAULT_EXPERT_SCRIPT = `(
  IMPORTFIELD[field=tx.to AS recipient]
  AND
  CHECKSIG[publickey="alice"]
)
THEN
(
  CHECKRECIPIENT[publickey=context.recipient]
)`;

class RustscriptMain {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.generate_expert_overlay = new GenerateExpertOverlay(this.app, this.mod);
  }

  render(container = '') {
    if (container !== '') {
      this.container = container;
    }
    if (!this.container || this.container.trim() === '') {
      this.container = '.saito-container';
    }

    const html = RustscriptMainTemplate(this.app, this.mod);

    if (!document.querySelector('.saito-rustscript')) {
      this.app.browser.addElementToSelector(html, this.container);
    } else {
      this.app.browser.replaceElementBySelector(html, '.saito-rustscript');
    }

    this.renderOpcodeDropdown();
    this.enableExpertMode();
    this.attachEvents();
  }

  attachEvents() {
    const select = document.querySelector('.rs-template-select');
    if (select) {
      select.onchange = (e) => {
        const name = e.target.value;
        if (!name) {
          return;
        }
        const example = this.mod.examples?.[name];
        if (example) {
          document.querySelector('.rs-script').value = example;
        }
      };
    }

    document.querySelector('.rs-generate-expert')?.addEventListener('click', () => {
      this.generate_expert_overlay.render();
    });

    document.querySelector('.rs-mode-expert')?.addEventListener('click', () => {
      this.enableExpertMode();
    });

    document.querySelector('.rs-mode-basic')?.addEventListener('click', () => {
      siteMessage('Basic JSON mode is not implemented in rustscript prototype');
    });
  }

  enableExpertMode() {
    document.querySelector('.rs-template-select')?.classList.remove('rs-disabled');
    document.querySelector('.rs-mode-expert')?.classList.add('active');
    document.querySelector('.rs-mode-basic')?.classList.remove('active');
    document.body.classList.add('rustscript');

    const scriptBox = document.querySelector('.rs-script');
    if (scriptBox && scriptBox.value.trim().length < 8) {
      scriptBox.value = DEFAULT_EXPERT_SCRIPT;
    }

    this.updateParseState('gray');
  }

  renderOpcodeDropdown() {
    const select = document.querySelector('.rs-template-select');
    if (!select) {
      return;
    }
    select.querySelectorAll('option:not([disabled])').forEach((opt) => opt.remove());

    const exampleKeys = Object.keys(this.mod.examples || {});
    for (const key of exampleKeys) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `Example: ${key}`;
      select.appendChild(opt);
    }

    for (const op of TEMPLATE_OPCODES) {
      const opt = document.createElement('option');
      opt.value = `opcode:${op.name}`;
      opt.textContent = `${op.name} — ${op.description}`;
      select.appendChild(opt);
    }
  }

  updateParseState(state, message = '') {
    const scriptEl = document.querySelector('.rs-eval-script');
    const astEl = document.querySelector('.rs-eval-witness');
    const parseEl = document.querySelector('.rs-eval-eval');

    for (const el of [scriptEl, astEl, parseEl]) {
      if (!el) {
        continue;
      }
      el.classList.remove('green', 'yellow', 'red', 'gray');
    }

    if (state === 'ok') {
      scriptEl?.classList.add('green');
      astEl?.classList.add('green');
      parseEl?.classList.add('green');
    } else if (state === 'error') {
      scriptEl?.classList.add('yellow');
      astEl?.classList.add('red');
      parseEl?.classList.add('red');
      if (message) {
        console.warn('[rustscript] parse error:', message);
      }
    } else {
      scriptEl?.classList.add('gray');
      astEl?.classList.add('gray');
      parseEl?.classList.add('gray');
    }
  }
}

module.exports = RustscriptMain;
