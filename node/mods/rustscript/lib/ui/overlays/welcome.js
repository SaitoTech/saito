const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const {
  WelcomeSplashTemplate,
  WelcomeCreateChoiceTemplate,
  WelcomeTemplatePickerTemplate,
  WelcomeInteractTemplate
} = require('./welcome.template');
const { getContractTemplates, lockingFromOpcode } = require('../script_build');

class WelcomeOverlay {
  constructor(app, mod, mainUi) {
    this.app = app;
    this.mod = mod;
    this.mainUi = mainUi;
    this.overlay = new SaitoOverlay(app, mod, false, true, false);
    this.overlay.class = 'saito-overlay rs-onboarding-overlay';
    this.overlay.clickBackdropToClose = false;
    this.templates = getContractTemplates(mod.opcodes);
    this.step = 'splash';
  }

  render(step) {
    if (step) {
      this.step = step;
    }
    this.showStep(this.step);
  }

  showStep(step) {
    this.step = step;
    let html = '';

    switch (step) {
      case 'splash':
        html = WelcomeSplashTemplate();
        break;
      case 'create-choice':
        html = WelcomeCreateChoiceTemplate();
        break;
      case 'create-templates':
        html = WelcomeTemplatePickerTemplate(this.templates);
        break;
      case 'interact':
        html = WelcomeInteractTemplate();
        break;
      default:
        html = WelcomeSplashTemplate();
    }

    this.overlay.show(html, () => {});
    this.applyFullscreenLayout();
    this.attachEvents();
  }

  applyFullscreenLayout() {
    const el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    const backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);

    if (el) {
      el.classList.add('maximized-overlay', 'rs-onboarding-overlay');
    }
    if (backdrop) {
      backdrop.classList.add('rs-onboarding-overlay-backdrop');
    }
    if (typeof this.overlay.pullOverlayToFront === 'function') {
      this.overlay.pullOverlayToFront();
    }
  }

  attachEvents() {
    const root = document.querySelector('.rs-onboard-appspace');
    if (!root) {
      return;
    }

    root.querySelector('[data-action="back-splash"]')?.addEventListener('click', () => {
      this.showStep('splash');
    });

    root.querySelector('[data-action="back-create-choice"]')?.addEventListener('click', () => {
      this.showStep('create-choice');
    });

    root.querySelectorAll('[data-path]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = btn.dataset.path;
        if (path === 'create') {
          this.showStep('create-choice');
        } else if (path === 'interact') {
          this.showStep('interact');
        } else if (path === 'expert') {
          this.enterExpert();
        }
      });
    });

    root.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.choice;
        if (choice === 'template') {
          this.showStep('create-templates');
        } else if (choice === 'scratch') {
          this.enterCreateGuided(lockingFromOpcode(this.mod.opcodes, 'checksig'));
        }
      });
    });

    root.querySelectorAll('[data-template-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tpl = this.templates.find((t) => t.id === btn.dataset.templateId);
        if (tpl) {
          this.enterCreateGuided(tpl.locking);
        }
      });
    });

    root.querySelector('[data-action="import-contract"]')?.addEventListener('click', () => {
      this.handleImport();
    });

    const dropzone = root.querySelector('[data-dropzone]');
    const input = root.querySelector('.rs-onboard-import-input');
    if (dropzone && input) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('rs-onboard-import-drag');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('rs-onboard-import-drag');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('rs-onboard-import-drag');
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          this.readFileIntoInput(file, input);
        }
      });
    }
  }

  readFileIntoInput(file, input) {
    const reader = new FileReader();
    reader.onload = () => {
      input.value = String(reader.result || '');
    };
    reader.readAsText(file);
  }

  handleImport() {
    const text = document.querySelector('.rs-onboard-import-input')?.value?.trim();
    if (!text) {
      siteMessage('Paste contract JSON to continue');
      return;
    }

    try {
      const parsed = this.mainUi.parseImportedContract(text);
      this.dismiss('interact');
      this.mainUi.enterInteractGuided(parsed);
    } catch (err) {
      siteMessage(err.message || 'Invalid contract JSON');
    }
  }

  enterCreateGuided(lockingScript) {
    this.dismiss('create');
    this.mainUi.enterCreateGuided(lockingScript);
  }

  enterExpert() {
    this.dismiss('expert');
    this.mainUi.enterExpertMode();
  }

  dismiss(entryPath) {
    this.persistEntry(entryPath);
    this.overlay.remove();
  }

  persistEntry(entryPath) {
    this.app.options.rustscript = {
      ...(this.app.options.rustscript || {}),
      onboardingComplete: true,
      entryPath,
      completedAt: Date.now()
    };
    if (typeof this.app.storage?.saveOptions === 'function') {
      this.app.storage.saveOptions();
    }
  }
}

WelcomeOverlay.shouldShow = function shouldShow(app) {
  const rs = app?.options?.rustscript;
  if (rs?.onboardingComplete) {
    return false;
  }
  if (rs?.skipOnboarding) {
    return false;
  }
  return true;
};

module.exports = WelcomeOverlay;
