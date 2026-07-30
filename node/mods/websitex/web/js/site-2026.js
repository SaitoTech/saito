// Progressive enhancement for the Websitex landing-page experiment.
document.documentElement.classList.add('has-js');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = document.querySelector('[data-site-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileNavigation = document.querySelector('[data-mobile-nav]');
const mobileNavigationLinks = mobileNavigation?.querySelectorAll('a') || [];
const desktopNavigationLinks = document.querySelectorAll('.desktop-nav a');
const mobileAppDock = document.querySelector('[data-open-apps]');
const appsSection = document.querySelector('#apps');

function setMenuState(isOpen) {
  if (!menuToggle || !mobileNavigation) {
    return;
  }

  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  mobileNavigation.classList.toggle('is-open', isOpen);
  mobileNavigation.inert = !isOpen;
  header?.classList.toggle('menu-active', isOpen);
  document.body.classList.toggle('menu-open', isOpen);

  if (isOpen) {
    mobileNavigation.querySelector('a')?.focus();
  } else {
    menuToggle.focus();
  }
}

menuToggle?.addEventListener('click', () => {
  setMenuState(menuToggle.getAttribute('aria-expanded') !== 'true');
});

mobileNavigationLinks.forEach((link) => {
  link.addEventListener('click', () => setMenuState(false));
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 820 && menuToggle?.getAttribute('aria-expanded') === 'true') {
    setMenuState(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
    setMenuState(false);
  }

  if (
    event.key === 'Tab' &&
    menuToggle?.getAttribute('aria-expanded') === 'true' &&
    mobileNavigation
  ) {
    const focusable = [
      menuToggle,
      ...mobileNavigation.querySelectorAll('a[href], button:not([disabled])')
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

window.addEventListener(
  'scroll',
  () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 24);
  },
  { passive: true }
);

const navigationSections = [
  ...document.querySelectorAll('#apps, #network, #ownership, #developers, #community')
];

if ('IntersectionObserver' in window) {
  const navigationObserver = new IntersectionObserver(
    (entries) => {
      const visibleSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visibleSection) {
        return;
      }

      desktopNavigationLinks.forEach((link) => {
        link.classList.toggle(
          'is-current',
          link.getAttribute('href') === `#${visibleSection.target.id}`
        );
      });
    },
    {
      rootMargin: '-30% 0px -55%',
      threshold: [0, 0.2, 0.5]
    }
  );

  navigationSections.forEach((section) => navigationObserver.observe(section));

  const revealTargets = document.querySelectorAll(
    '.section-heading, .ownership-intro, .developer-copy, .evidence-lead'
  );
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -12%', threshold: 0.12 }
  );

  revealTargets.forEach((target) => {
    target.dataset.observe = '';
    revealObserver.observe(target);
  });

  if (appsSection && mobileAppDock) {
    const appDockObserver = new IntersectionObserver(
      ([entry]) => {
        mobileAppDock.classList.toggle('is-hidden', entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    appDockObserver.observe(appsSection);
  }
}

mobileAppDock?.addEventListener('click', () => {
  appsSection?.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'start'
  });
});

const filterButtons = document.querySelectorAll('[data-app-filter]');
const applicationCards = document.querySelectorAll('[data-app-category]');

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedFilter = button.dataset.appFilter;

    filterButtons.forEach((candidate) => {
      const isSelected = candidate === button;
      candidate.classList.toggle('is-active', isSelected);
      candidate.setAttribute('aria-pressed', String(isSelected));
    });

    applicationCards.forEach((card) => {
      const categories = card.dataset.appCategory.split(' ');
      card.hidden = selectedFilter !== 'all' && !categories.includes(selectedFilter);
    });
  });
});

const proofStart = document.querySelector('[data-proof-start]');
const proofReset = document.querySelector('[data-proof-reset]');
const proofState = document.querySelector('[data-proof-state]');
const proofOutput = document.querySelector('[data-proof-output]');
const proofSteps = [...document.querySelectorAll('[data-proof-step]')];
const heroStatus = document.querySelector('[data-hero-status]');
let proofRunning = false;
let proofTimers = [];

function hasSaitoRuntime() {
  return Boolean(window.saito || window.app?.network || window.Saito);
}

function localIdentity() {
  if (!window.crypto?.getRandomValues) {
    return 'UNAVAILABLE';
  }

  const bytes = new Uint8Array(4);
  window.crypto.getRandomValues(bytes);
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function storageAvailable() {
  try {
    const marker = '__saito_site_capability_check__';
    window.localStorage.setItem(marker, marker);
    window.localStorage.removeItem(marker);
    return true;
  } catch (error) {
    return false;
  }
}

function clearProofTimers() {
  proofTimers.forEach((timer) => window.clearTimeout(timer));
  proofTimers = [];
}

function resetProof() {
  clearProofTimers();
  proofRunning = false;
  proofSteps.forEach((step) => {
    step.classList.remove('is-running', 'is-complete');
    step.querySelector('.step-result').textContent = 'WAITING';
  });
  proofState.textContent = 'STANDBY';
  proofState.classList.remove('is-active');
  proofOutput.textContent = 'Select “Watch this browser join” to begin.';
  proofStart.disabled = false;
  proofStart.innerHTML = 'Watch this browser join <span aria-hidden="true">▶</span>';
  proofReset.hidden = true;
}

function completeProofStep(index, result, message) {
  proofSteps.forEach((step) => step.classList.remove('is-running'));
  const step = proofSteps[index];
  step.classList.add('is-complete');
  step.querySelector('.step-result').textContent = result;
  proofOutput.textContent = message;
}

proofStart?.addEventListener('click', () => {
  if (proofRunning) {
    return;
  }

  proofRunning = true;
  clearProofTimers();
  const runtimeFound = hasSaitoRuntime();
  const identity = localIdentity();
  const delay = prefersReducedMotion ? 80 : 520;

  proofStart.disabled = true;
  proofStart.textContent = 'Inspecting locally…';
  proofState.textContent = 'INSPECTING';
  proofState.classList.add('is-active');
  proofSteps[0].classList.add('is-running');
  proofOutput.textContent = 'Generating an ephemeral inspection ID in memory…';

  proofTimers.push(
    window.setTimeout(() => {
      completeProofStep(
        0,
        identity === 'UNAVAILABLE' ? 'LIMITED' : identity,
        identity === 'UNAVAILABLE'
          ? 'Secure random values are unavailable in this context.'
          : `Ephemeral ID ${identity} exists only for this inspection.`
      );
      proofSteps[1].classList.add('is-running');
    }, delay)
  );

  proofTimers.push(
    window.setTimeout(() => {
      const cryptoAvailable = Boolean(window.crypto?.subtle);
      const storageReady = storageAvailable();
      completeProofStep(
        1,
        cryptoAvailable && storageReady ? 'AVAILABLE' : 'LIMITED',
        `Cryptography: ${cryptoAvailable ? 'available' : 'limited'} · local storage: ${
          storageReady ? 'available' : 'restricted'
        }.`
      );
      proofSteps[2].classList.add('is-running');
    }, delay * 2)
  );

  proofTimers.push(
    window.setTimeout(() => {
      completeProofStep(
        2,
        runtimeFound ? 'DETECTED' : 'NOT LOADED',
        runtimeFound
          ? 'A Saito client runtime is available to this page.'
          : 'This static page has no injected Saito client; it will not claim a live connection.'
      );
      proofSteps[3].classList.add('is-running');
    }, delay * 3)
  );

  proofTimers.push(
    window.setTimeout(() => {
      completeProofStep(
        3,
        runtimeFound ? 'READY' : 'AWAITING CLIENT',
        runtimeFound
          ? 'Browser capabilities and client runtime are ready for an explicit peer connection.'
          : 'Local inspection complete. Load the Saito client to perform a real peer handshake.'
      );
      proofState.textContent = runtimeFound ? 'CLIENT READY' : 'LOCAL READY';
      proofStart.textContent = 'Inspection complete';
      proofReset.hidden = false;
      proofRunning = false;
    }, delay * 4)
  );
});

proofReset?.addEventListener('click', resetProof);

if (heroStatus) {
  heroStatus.textContent = hasSaitoRuntime() ? 'CLIENT READY' : 'BROWSER READY';
}

const assetButtons = document.querySelectorAll('[data-asset]');
const assetCard = document.querySelector('[data-asset-card]');
const assetName = document.querySelector('[data-asset-name]');
const assetType = document.querySelector('[data-asset-type-output]');
const assetCode = document.querySelector('[data-asset-code]');
const lifecycleSteps = document.querySelectorAll('.asset-lifecycle li');
const assetStyles = {
  'Access pass': { hue: 348, code: '8F2A · 16C4' },
  'Game item': { hue: 268, code: '4D91 · A820' },
  Subscription: { hue: 214, code: '72BE · 09F1' },
  Currency: { hue: 164, code: 'C308 · 4AA7' }
};
let lifecycleTimers = [];

function animateLifecycle() {
  lifecycleTimers.forEach((timer) => window.clearTimeout(timer));
  lifecycleTimers = [];
  lifecycleSteps.forEach((step) => step.classList.remove('is-active'));

  lifecycleSteps.forEach((step, index) => {
    lifecycleTimers.push(
      window.setTimeout(
        () => step.classList.add('is-active'),
        (prefersReducedMotion ? 20 : 220) * index
      )
    );
  });
}

assetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedAsset = button.dataset.asset;
    const style = assetStyles[selectedAsset];

    assetButtons.forEach((candidate) => {
      const isSelected = candidate === button;
      candidate.classList.toggle('is-active', isSelected);
      candidate.setAttribute('aria-pressed', String(isSelected));
    });

    assetName.textContent = selectedAsset;
    assetType.textContent = button.dataset.assetType;
    assetCode.textContent = style.code;
    assetCard.style.setProperty('--asset-hue', style.hue);
    animateLifecycle();
  });
});

const copyCodeButton = document.querySelector('[data-copy-code]');
const codeExample = document.querySelector('[data-code-example]');

copyCodeButton?.addEventListener('click', async () => {
  const code = codeExample?.textContent || '';

  try {
    await navigator.clipboard.writeText(code);
    copyCodeButton.textContent = 'Copied';
  } catch (error) {
    copyCodeButton.textContent = 'Select code to copy';
  }

  window.setTimeout(() => {
    copyCodeButton.textContent = 'Copy';
  }, 1800);
});

document.querySelector('[data-current-year]').textContent = new Date().getFullYear();

const heroNetwork = document.querySelector('.hero-network');

if (
  heroNetwork &&
  !prefersReducedMotion &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches
) {
  window.addEventListener(
    'pointermove',
    (event) => {
      const horizontal = (event.clientX / window.innerWidth - 0.5) * 8;
      const vertical = (event.clientY / window.innerHeight - 0.5) * 8;
      heroNetwork.style.transform = `translate3d(${horizontal}px, ${vertical}px, 0)`;
    },
    { passive: true }
  );
}
