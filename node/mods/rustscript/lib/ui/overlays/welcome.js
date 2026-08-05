const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const {
  WelcomeSplashTemplate,
  WelcomeBuildChoiceTemplate,
  WelcomeImportChoiceTemplate
} = require('./welcome.template');
const { getContractTemplates } = require('../script_build');

const BUILD_TEMPLATE_IDS = {
  multisig: 'shared-wallet',
  'password-protected': 'secret-vault'
};

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
      case 'create-build':
        html = WelcomeBuildChoiceTemplate();
        break;
      case 'import-choice':
        html = WelcomeImportChoiceTemplate();
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

    root.querySelectorAll('[data-path]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = btn.dataset.path;
        if (path === 'create') {
          this.showStep('create-build');
        } else if (path === 'interact') {
          this.showStep('import-choice');
        } else if (path === 'expert') {
          this.enterExpert();
        }
      });
    });

    root.querySelectorAll('[data-build]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const build = btn.dataset.build;
        if (build === 'custom') {
          this.enterCreateFromScratch();
          return;
        }
        const templateId = BUILD_TEMPLATE_IDS[build];
        const tpl = this.templates.find((t) => t.id === templateId);
        if (tpl) {
          this.enterCreateGuided(tpl.locking);
        }
      });
    });

    root.querySelectorAll('[data-import]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.import;
        if (kind === 'unlock-tx') {
          this.dismiss('interact');
          this.mainUi.importFlow.open();
        } else if (kind === 'continue-unlock') {
          this.dismiss('interact');
          this.mainUi.continueUnlockImportFlow.open();
        } else if (kind === 'saved-script') {
          this.dismiss('interact');
          this.mainUi.scriptImportFlow.open();
        }
      });
    });
  }

  enterCreateGuided(lockingScript) {
    this.dismiss('create');
    this.mainUi.enterCreateGuided(lockingScript);
  }

  enterCreateFromScratch() {
    this.dismiss('create');
    this.mainUi.enterCreateFromScratch();
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
