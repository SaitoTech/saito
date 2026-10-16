// Serialized into the fallback document so it is available before saito.js loads.
module.exports = function initializeDynamicModuleLoader(window) {
  const document = window.document;
  const loader = document.querySelector('.saito-cta-loader-shell');
  let found = false;
  let finished = false;
  let failed = false;

  // Existing .saito games carry their own GameTemplate and replace the body.
  // Keep the loading surface above that replacement until rendering completes.
  const observer = new window.MutationObserver(() => {
    if (!finished && !loader.isConnected) document.body.appendChild(loader);
  });
  observer.observe(document.body, { childList: true });

  function fail() {
    if (finished) return;
    failed = true;
    loader.setAttribute('aria-busy', 'false');
    loader.querySelector('.saito-cta-loader-progress').classList.remove('is-application-loading');
    loader.querySelector('.saito-cta-loader-progress-text').textContent =
      'Unable to load application. Please retry.';
    loader.querySelector('[data-saito-loader-retry]').hidden = false;
  }

  window.SaitoDynamicLoader = {
    fail,
    async resolveModule(mod) {
      if (!mod) {
        const url = new URL(window.location.href);
        url.searchParams.set('__saito_not_found', '1');
        window.location.replace(url.href);
        return false;
      }
      found = true;
      document.title = mod.returnTitle();
      if (mod.respondTo('arcade-games')) {
        document.documentElement.classList.add('game', mod.returnSlug());
        // These normally arrive in the server-rendered GameTemplate page.
        // Load them here as well for already-installed dynamic game binaries.
        await new Promise((resolve, reject) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = '/saito/game.css';
          link.onload = resolve;
          link.onerror = reject;
          document.head.appendChild(link);
        });
      }
      return true;
    }
  };

  window.SaitoCtaLoader = {
    markAppReady() {
      if (!found || finished || failed) return;
      finished = true;
      observer.disconnect();
      document.body.classList.remove('saito-cta-loader-active');
      document.body.classList.add('saito-cta-loader-complete');
      loader.setAttribute('aria-busy', 'false');
      loader.classList.add('is-complete');
      window.setTimeout(() => loader.remove(), 380);
    }
  };
};
