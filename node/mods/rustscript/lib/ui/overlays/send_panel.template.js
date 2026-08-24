/**
 * Shared left/right send panel — used by Publish and Broadcast Solution overlays.
 */
const { buildRustscriptOverlay } = require('./overlay.shell');

function buildSendPanelOverlay({
  extraRootClass = '',
  scriptDisplay = '',
  leftPanelHtml = '',
  leftColumnClass = 'rs-publish-send-script',
  formFieldsHtml,
  errorExtraClass = '',
  actionButtonHtml
}) {
  const leftContent = leftPanelHtml
    ? leftPanelHtml
    : `<pre class="rs-publish-script-readonly" spellcheck="false">${scriptDisplay}</pre>`;

  const bodyHtml = `
    <div class="rs-publish-send-panels">
      <div class="rs-publish-send-column ${leftColumnClass}">
        ${leftContent}
      </div>
      <div class="rs-publish-send-column rs-publish-send-form">
        ${formFieldsHtml}
        <p class="rs-publish-error ${errorExtraClass}" hidden></p>
        ${
          actionButtonHtml
            ? `<div class="rs-overlay-actions rs-overlay-actions-end">
          ${actionButtonHtml}
        </div>`
            : ''
        }
      </div>
    </div>
  `;

  return buildRustscriptOverlay({
    className: `rs-overlay-workspace rs-publish-send ${extraRootClass}`,
    bodyHtml
  });
}

module.exports = { buildSendPanelOverlay };
