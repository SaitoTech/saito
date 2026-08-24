const CTA_LOGOS = {
  arcade: 'saito-arcade-icon',
  chat: 'saito-chat-icon',
  filetransfer: 'saito-filetransfer-icon',
  games: 'saito-games-icon',
  redsquare: 'saito-redsquare-icon',
  stack: 'saito-stack-icon',
  store: 'saito-store-icon',
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
  store: {
    label: 'Saito Store',
    subtitle: 'PEER-TO-PEER COMMERCE'
  },
  swarmcast: {
    label: 'Swarmcast',
    subtitle: 'Peer to Peer Streaming'
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
    .map(
      (href) =>
        `<link rel="preload" as="image" type="image/svg+xml" fetchpriority="high" href="${href}" />`
    )
    .join('\n');
}

function styles() {
  return `<style type="text/css">
    .pace {
      display: none !important;
    }

    body.saito-cta-loader-active {
      background: var(
        --saito-canvas-wash,
        radial-gradient(70vw 50vw at 50% 8%, rgba(245, 73, 0, 0.14), transparent 62%),
        radial-gradient(45vw 35vw at 47% 46%, rgba(255, 184, 106, 0.08), transparent 68%),
        #0c0a09
      );
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
      background: var(
        --saito-canvas-wash,
        radial-gradient(70vw 50vw at 50% 8%, rgba(245, 73, 0, 0.14), transparent 62%),
        radial-gradient(45vw 35vw at 47% 46%, rgba(255, 184, 106, 0.08), transparent 68%),
        #0c0a09
      );
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
      height: 45px;
      min-height: 45px;
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
      background: var(
        --saito-cta-action-background,
        linear-gradient(90deg, var(--saito-cta-loader-primary-strong), var(--saito-cta-loader-primary))
      );
      transition: width 0.16s ease-out;
    }

    .saito-cta-loader-progress-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff7ed;
      font: 400 15.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.34);
      pointer-events: none;
    }

    .saito-cta-loader-progress.is-application-loading .saito-cta-loader-progress-fill {
      width: 100%;
      overflow: hidden;
      background: var(--saito-cta-loader-primary);
    }

    .saito-cta-loader-progress.is-application-loading .saito-cta-loader-progress-fill::after {
      content: "";
      position: absolute;
      inset: 0 100% 0 auto;
      width: 195%;
      background: linear-gradient(
        90deg,
        var(--saito-cta-loader-primary) 0%,
        var(--saito-cta-loader-primary) 30%,
        var(--saito-cta-loader-primary-strong) 50%,
        var(--saito-cta-loader-primary) 70%,
        var(--saito-cta-loader-primary) 100%
      );
      animation: saito-cta-loader-application-pulse 5s linear infinite;
    }

    .saito-cta-loader-progress-text.is-application-loading::after {
      content: "...";
      flex: 0 0 1.2em;
      width: 1.2em;
      overflow: hidden;
      text-align: left;
      clip-path: inset(0 0 0 0);
      animation: saito-cta-loader-ellipsis 1.2s steps(4, end) infinite;
    }

    @keyframes saito-cta-loader-ellipsis {
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }

    @keyframes saito-cta-loader-application-pulse {
      from {
        transform: translateX(0);
      }
      to {
        transform: translateX(151.3%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .saito-cta-loader-progress-text.is-application-loading::after {
        animation: none;
      }
    }

    @media (max-width: 720px) {
      .saito-cta-loader-shell {
        padding: 0;
      }

      .saito-cta-loader-card {
        width: 100vw;
        max-width: none;
        height: 100vh;
        height: 100dvh;
        min-height: 100vh;
        min-height: 100dvh;
        max-height: 100vh;
        max-height: 100dvh;
        padding: 20dvh 24px 24px;
        border: 0;
        border-radius: 0;
        overflow-y: auto;
        justify-content: flex-start;
      }

      .saito-cta-loader-progress {
        height: 45px;
        min-height: 45px;
      }
    }
  </style>`;
}

function script() {
  return `<script type="text/javascript">
    (function () {
      var progress = 0;
      var complete = false;
      var paceComplete = false;
      var appReady = false;
      var fallbackTimer = null;
      var applicationTimeoutTimer = null;
      var xcloseObserver = null;

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
        if (
          text &&
          loader.getAttribute('data-saito-cta-loader-state') === 'loading-resources' &&
          text.textContent !== valueText
        ) {
          text.textContent = valueText;
        }
      }

      function showApplicationLoading(delayed) {
        var loader = document.querySelector('.saito-cta-loader-shell');
        if (!loader) {
          return;
        }

        var message = delayed
          ? 'Application is taking longer than expected'
          : 'Application Loading';
        loader.setAttribute(
          'data-saito-cta-loader-state',
          delayed ? 'loading-application-delayed' : 'loading-application'
        );
        var progressBar = loader.querySelector('.saito-cta-loader-progress');
        if (progressBar) {
          progressBar.setAttribute('aria-valuetext', message);
          progressBar.classList.add('is-application-loading');
        }
        var text = loader.querySelector('.saito-cta-loader-progress-text');
        if (text) {
          text.textContent = message;
          text.classList.add('is-application-loading');
        }
      }

      function stopFallbackProgress() {
        if (fallbackTimer) {
          clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
      }

      function startApplicationTimeout() {
        if (applicationTimeoutTimer || complete) {
          return;
        }
        applicationTimeoutTimer = setTimeout(function () {
          if (!complete) {
            console.warn('Saito CTA loader is still waiting for application readiness', {
              paceComplete: paceComplete,
              appReady: appReady
            });
            showApplicationLoading(true);
          }
        }, 30000);
      }

      function waitForStylesheets(timeout) {
        var links = Array.prototype.slice.call(document.querySelectorAll('link[rel~="stylesheet"]'));
        var pending = links.filter(function (link) {
          if (!link.href) {
            return false;
          }
          try {
            var url = new URL(link.href, window.location.href);
            if (url.origin !== window.location.origin) {
              return false;
            }
          } catch (err) {
            return false;
          }
          return !link.sheet;
        });

        if (!pending.length) {
          return Promise.resolve();
        }

        return Promise.race([
          Promise.all(pending.map(function (link) {
            return new Promise(function (resolve) {
              if (link.sheet) {
                resolve();
                return;
              }
              link.addEventListener('load', resolve, { once: true });
              link.addEventListener('error', resolve, { once: true });
            });
          })),
          new Promise(function (resolve) {
            setTimeout(resolve, timeout);
          })
        ]);
      }

      function waitForPaint() {
        if (!window.requestAnimationFrame) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 16);
          });
        }
        return Promise.race([
          new Promise(function (resolve) {
            requestAnimationFrame(function () {
              requestAnimationFrame(resolve);
            });
          }),
          new Promise(function (resolve) {
            setTimeout(resolve, 160);
          })
        ]);
      }

      function reveal(loader) {
        if (applicationTimeoutTimer) {
          clearTimeout(applicationTimeoutTimer);
          applicationTimeoutTimer = null;
        }

        loader.setAttribute('data-saito-cta-loader-state', 'revealing');
        loader.setAttribute('aria-busy', 'false');
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

      function finish() {
        if (complete) {
          return;
        }
        if (!paceComplete || !appReady) {
          return;
        }
        var loader = document.querySelector('.saito-cta-loader-shell');
        if (!document.body || !loader) {
          update(100);
          return;
        }

        complete = true;
        stopFallbackProgress();
        update(100);

        waitForStylesheets(1200)
          .then(waitForPaint)
          .then(function () {
            reveal(loader);
          })
          .catch(function () {
            reveal(loader);
          });
      }

      function markPaceComplete() {
        if (paceComplete) {
          finish();
          return;
        }
        paceComplete = true;
        stopFallbackProgress();
        update(100);
        showApplicationLoading(false);
        startApplicationTimeout();
        finish();
      }

      function markAppReady() {
        appReady = true;
        if (xcloseObserver) {
          xcloseObserver.disconnect();
          xcloseObserver = null;
        }
        finish();
      }

      function bindXCloseFallback() {
        if (!document.body || appReady) {
          return;
        }
        if (document.body.classList.contains('xclose')) {
          markAppReady();
          return;
        }
        if (!window.MutationObserver || xcloseObserver) {
          return;
        }
        xcloseObserver = new MutationObserver(function () {
          if (document.body.classList.contains('xclose')) {
            markAppReady();
          }
        });
        xcloseObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }

      function bindPace() {
        if (!window.Pace || window.__saitoCtaLoaderPaceBound) {
          return;
        }
        window.__saitoCtaLoaderPaceBound = true;
        window.Pace.on('progress', update);
        window.Pace.on('done', markPaceComplete);
        window.Pace.on('hide', markPaceComplete);
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
        bindXCloseFallback();
        update(currentPaceProgress());
        startFallbackProgress();

        if (document.body && document.body.classList.contains('pace-done')) {
          markPaceComplete();
        }
      }

      window.SaitoCtaLoader = {
        markAppReady: markAppReady,
        markPaceComplete: markPaceComplete,
        finish: function () {
          markAppReady();
        }
      };

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
            markPaceComplete();
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
    <div class="saito-cta-loader-shell" data-saito-cta-loader="${key}" data-saito-cta-loader-state="loading-resources" aria-busy="true">
      <div class="saito-cta-loader-card">
        <div class="saito-cta-loader-logo" role="img" aria-label="${content.label}" style="--saito-cta-loader-logo-mask: url('/saito/icons/${CTA_LOGOS[key]}-outline-label-horizontal.svg');"></div>
        <div class="saito-cta-loader-subtitle">${content.subtitle}</div>
        <div class="saito-cta-loader-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="saito-cta-loader-progress-fill"></div>
          <div class="saito-cta-loader-progress-text" aria-live="polite">0%</div>
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
