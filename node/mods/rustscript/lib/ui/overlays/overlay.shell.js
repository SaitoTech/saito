/**
 * Shared RustScript overlay shell.
 * Every modal uses this structure so padding / title / body / footer spacing match.
 *
 *   .rustscript-overlay[.rs-overlay-prompt|.rs-overlay-wide|.rs-overlay-modal|.rs-overlay-workspace|.rs-overlay-status]
 *     h2.rs-overlay-title  |  .rs-overlay-head
 *     .rs-overlay-body     (optional)
 *     .rs-overlay-actions  (optional)
 */
function buildRustscriptOverlay({
  className = '',
  title = '',
  titleClass = '',
  headHtml = '',
  bodyHtml = '',
  actionsHtml = '',
  actionsClass = 'rs-overlay-actions-end'
} = {}) {
  const head = headHtml
    ? headHtml
    : title
      ? `<h2 class="rs-overlay-title${titleClass ? ` ${titleClass}` : ''}">${title}</h2>`
      : '';

  const body = bodyHtml ? `<div class="rs-overlay-body">${bodyHtml}</div>` : '';

  const actions = actionsHtml
    ? `<div class="rs-overlay-actions ${actionsClass}">${actionsHtml}</div>`
    : '';

  return `
<div class="rustscript-overlay ${className}">
  ${head}
  ${body}
  ${actions}
</div>`;
}

/**
 * Full-viewport host for publish / import / unlock overlays.
 *
 * SaitoOverlay.pullOverlayToFront() sets inline `display: block`, which defeats
 * flex centering on the shell. Centering is therefore owned by CSS absolute
 * positioning of `.rustscript-overlay` inside `.rs-publish-overlay-shell`
 * (see rustscript-publish.css) — do not rely on flex on the host.
 */
function applyPublishOverlayShell(overlay) {
  if (!overlay?.ordinal) {
    return;
  }

  const el = document.getElementById(`saito-overlay${overlay.ordinal}`);
  const backdrop = document.getElementById(`saito-overlay-backdrop${overlay.ordinal}`);

  if (el) {
    el.classList.add('rs-publish-overlay-shell', 'maximized-overlay');
    el.classList.remove('center-overlay');
    el.style.pointerEvents = 'none';
    el.style.zIndex = '100002';
    // Clear Saito's translate centering; shell uses inset:0 + child absolute center.
    el.style.left = '';
    el.style.top = '';
    el.style.transform = 'none';
  }

  if (backdrop) {
    backdrop.classList.add('rs-publish-overlay-backdrop');
    backdrop.style.display = 'block';
    backdrop.style.pointerEvents = 'auto';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100vw';
    backdrop.style.height = '100dvh';
    backdrop.style.zIndex = '100001';
  }

  if (typeof overlay.pullOverlayToFront === 'function') {
    overlay.pullOverlayToFront();
  }

  // pullOverlayToFront writes display:block (and again after 50ms). Keep the
  // full-viewport host as a positioning context; child centering is CSS absolute.
  if (el) {
    el.style.display = 'block';
    el.style.transform = 'none';
  }
}

module.exports = { buildRustscriptOverlay, applyPublishOverlayShell };
