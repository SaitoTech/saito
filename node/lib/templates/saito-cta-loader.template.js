const CTA_LOGOS = {
  arcade: 'saito-arcade-icon',
  chat: 'saito-chat-icon',
  filetransfer: 'saito-filetransfer-icon',
  games: 'saito-games-icon',
  redsquare: 'saito-redsquare-icon',
  stack: 'saito-stack-icon',
  swarmcast: 'saito-swarmcast-icon',
  talk: 'saito-talk-icon',
  vault: 'saito-vault-icon'
};

const CTA_CONTENT = {
  arcade: {
    label: 'Saito Arcade',
    subtitle: 'PEER-TO-PEER, PROVABLY FAIR, FUN'
  },
  chat: {
    label: 'Saito Chat',
    subtitle: 'PEER-TO-PEER SECURE MESSAGING'
  },
  redsquare: {
    label: 'Red Square',
    subtitle: 'PEER-TO-PEER SOCIAL'
  },
  stack: {
    label: 'Saito Stack',
    subtitle: 'PUBLISH WITHOUT PUBLISHERS'
  },
  swarmcast: {
    label: 'Swarmcast',
    subtitle: 'PEER-TO-PEER BROADCASTING'
  },
  talk: {
    label: 'Saito Talk',
    subtitle: 'PEER-TO-PEER VIDEO CHAT'
  },
  vault: {
    label: 'Saito File Vault',
    subtitle: 'YOUR NFT IS THE ACCESS KEY'
  }
};

const LOGO_VARIANTS = ['outline-label-horizontal', 'solid-label-horizontal'];

function normalizeLogos(logos = []) {
  if (!Array.isArray(logos)) {
    logos = [logos];
  }

  return logos.filter((logo) => CTA_LOGOS[logo]);
}

function preload(logos = []) {
  const selected = normalizeLogos(logos);
  const hrefs = [];

  selected.forEach((logo) => {
    LOGO_VARIANTS.forEach((variant) => {
      hrefs.push(`/saito/icons/${CTA_LOGOS[logo]}-${variant}.svg`);
    });
  });

  return hrefs
    .map((href) => `<link rel="preload" as="image" type="image/svg+xml" fetchpriority="high" href="${href}" />`)
    .join('\n');
}

function styles() {
  return `<style type="text/css">
    .pace {
      display: none !important;
    }

    body.saito-cta-loader-active {
      background:
        radial-gradient(70vw 50vw at 50% 8%, rgba(245, 73, 0, 0.14), transparent 62%),
        radial-gradient(45vw 35vw at 47% 46%, rgba(255, 184, 106, 0.08), transparent 68%),
        #0c0a09;
    }

    body.saito-cta-loader-active::before,
    body.saito-cta-loader-complete::before {
      content: none !important;
      display: none !important;
    }

    body.saito-cta-loader-active [data-saito-prerendered-cta] {
      opacity: 0;
      pointer-events: none;
    }

    body.saito-cta-loader-complete [data-saito-prerendered-cta] {
      opacity: 1;
      pointer-events: auto;
      transition: opacity 0.28s ease;
    }

    body.saito-cta-loader-active .saito-cta {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.28s ease;
    }

    body.saito-cta-loader-complete .saito-cta {
      opacity: 1;
      pointer-events: auto;
    }

    .saito-cta-loader-shell {
      --saito-cta-loader-bg: #0c0a09;
      --saito-cta-loader-card: #1c1917;
      --saito-cta-loader-card-soft: #1b1e24;
      --saito-cta-loader-border: rgba(255, 255, 255, 0.1);
      --saito-cta-loader-text: #fafaf9;
      --saito-cta-loader-muted: #a6a09b;
      --saito-cta-loader-primary: #f54900;
      --saito-cta-loader-primary-strong: #ff8a3d;
      --saito-cta-loader-shadow: 0 24px 80px rgba(0, 0, 0, 0.46);
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 30px;
      color: var(--saito-cta-loader-text);
      background:
        radial-gradient(70vw 50vw at 50% 8%, rgba(245, 73, 0, 0.14), transparent 62%),
        radial-gradient(45vw 35vw at 47% 46%, rgba(255, 184, 106, 0.08), transparent 68%),
        var(--saito-cta-loader-bg);
      opacity: 1;
      transition: opacity 0.34s ease;
    }

    .saito-cta-loader-shell.is-complete {
      opacity: 0;
      pointer-events: none;
    }

    .saito-cta-loader-card {
      width: min(95vw, 860px);
      min-height: 280px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 32px;
      border: 1px solid var(--saito-cta-loader-border);
      border-radius: 7px;
      background:
        linear-gradient(180deg, rgba(31, 34, 40, 0.95), rgba(25, 27, 32, 0.98)),
        var(--saito-cta-loader-card);
      box-shadow: var(--saito-cta-loader-shadow);
    }

    .saito-cta-loader-logo {
      width: min(560px, 84vw);
      aspect-ratio: 381 / 134;
      position: relative;
      max-width: 100%;
      filter: drop-shadow(0 0 18px rgba(255, 255, 255, 0.08));
    }

    .saito-cta-loader-logo::after {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--saito-cta-loader-text);
      -webkit-mask: var(--saito-cta-loader-logo-mask) center / contain no-repeat;
      mask: var(--saito-cta-loader-logo-mask) center / contain no-repeat;
    }

    .saito-cta-loader-subtitle {
      color: var(--saito-cta-loader-muted);
      font: 700 12.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.22em;
      text-align: center;
      text-transform: uppercase;
    }

    .saito-cta-loader-progress {
      width: 100%;
      height: 48px;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 4.5px;
      background: rgba(255, 255, 255, 0.06);
      box-shadow: 0 0 32px -10px rgba(245, 73, 0, 0.48);
    }

    .saito-cta-loader-progress-fill {
      position: absolute;
      inset: 0 auto 0 0;
      width: var(--saito-cta-loader-progress-value, 0%);
      border-radius: inherit;
      background: linear-gradient(90deg, var(--saito-cta-loader-primary-strong), var(--saito-cta-loader-primary));
      transition: width 0.16s ease-out;
    }

    .saito-cta-loader-progress-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff7ed;
      font: 700 15.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.34);
      pointer-events: none;
    }

    @media (max-width: 720px) {
      .saito-cta-loader-shell {
        padding: 20px;
      }

      .saito-cta-loader-card {
        min-height: 240px;
        padding: 24px;
      }

      .saito-cta-loader-progress {
        height: 42px;
      }
    }
  </style>`;
}

function script() {
  return `<script type="text/javascript">
    (function () {
      var progress = 0;
      var complete = false;
      var pendingFinish = false;
      var fallbackTimer = null;

      function percent(value) {
        value = Number(value) || 0;
        return Math.max(0, Math.min(100, Math.round(value)));
      }

      function currentPaceProgress() {
        if (window.Pace && window.Pace.bar && typeof window.Pace.bar.progress === 'number') {
          return window.Pace.bar.progress;
        }
        return progress;
      }

      function update(value) {
        progress = percent(value);
        var valueText = progress + '%';
        var loader = document.querySelector('.saito-cta-loader-shell');
        if (!loader) {
          return;
        }
        loader.style.setProperty('--saito-cta-loader-progress-value', valueText);
        var progressBar = loader.querySelector('.saito-cta-loader-progress');
        if (progressBar) {
          progressBar.setAttribute('aria-valuenow', String(progress));
        }
        var text = loader.querySelector('.saito-cta-loader-progress-text');
        if (text && text.textContent !== valueText) {
          text.textContent = valueText;
        }
      }

      function stopFallbackProgress() {
        if (fallbackTimer) {
          clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
      }

      function finish() {
        if (complete) {
          return;
        }
        var loader = document.querySelector('.saito-cta-loader-shell');
        if (!document.body || !loader) {
          pendingFinish = true;
          update(100);
          return;
        }

        complete = true;
        pendingFinish = false;
        stopFallbackProgress();
        update(100);

        if (document.body) {
          document.body.classList.add('saito-cta-loader-complete');
          document.body.classList.remove('saito-cta-loader-active');
        }
        if (loader) {
          loader.classList.add('is-complete');
          setTimeout(function () {
            if (loader.parentElement) {
              loader.remove();
            }
          }, 380);
        }
      }

      function bindPace() {
        if (!window.Pace || window.__saitoCtaLoaderPaceBound) {
          return;
        }
        window.__saitoCtaLoaderPaceBound = true;
        window.Pace.on('progress', update);
        window.Pace.on('done', finish);
        window.Pace.on('hide', finish);
      }

      function startFallbackProgress() {
        if (fallbackTimer || complete) {
          return;
        }
        fallbackTimer = setInterval(function () {
          var paceProgress = percent(currentPaceProgress());
          if (paceProgress > progress) {
            update(paceProgress);
          } else if (progress < 95) {
            update(Math.min(95, progress + Math.max(1, Math.round((95 - progress) * 0.08))));
          }
        }, 250);
      }

      function boot() {
        bindPace();
        update(currentPaceProgress());
        startFallbackProgress();

        if (pendingFinish || (document.body && document.body.classList.contains('pace-done'))) {
          finish();
        }
      }

      bindPace();

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        boot();
      }

      window.addEventListener('load', function () {
        bindPace();
        setTimeout(function () {
          if (!window.Pace || !window.Pace.running) {
            finish();
          }
        }, 600);
      });
    })();
  </script>`;
}

function head(logos = []) {
  return `${preload(logos)}
${styles()}
${script()}`;
}

function loader(logo) {
  const key = CTA_LOGOS[logo] ? logo : 'chat';
  const content = CTA_CONTENT[key] || CTA_CONTENT.chat;

  return `
    <div class="saito-cta-loader-shell" data-saito-cta-loader="${key}">
      <div class="saito-cta-loader-card">
        <div class="saito-cta-loader-logo" role="img" aria-label="${content.label}" style="--saito-cta-loader-logo-mask: url('/saito/icons/${CTA_LOGOS[key]}-outline-label-horizontal.svg');"></div>
        <div class="saito-cta-loader-subtitle">${content.subtitle}</div>
        <div class="saito-cta-loader-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="saito-cta-loader-progress-fill"></div>
          <div class="saito-cta-loader-progress-text">0%</div>
        </div>
      </div>
    </div>
  `;
}

module.exports = {
  head,
  loader,
  preload,
  script,
  styles
};
