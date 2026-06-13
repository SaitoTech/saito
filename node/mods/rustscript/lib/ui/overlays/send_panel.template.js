/**
 * Shared left/right send panel — used by Publish and Broadcast Solution overlays.
 */
function buildSendPanelOverlay({
  extraRootClass = '',
  scriptDisplay,
  formFieldsHtml,
  errorExtraClass = '',
  actionButtonHtml
}) {
  return `
<div class="rustscript-overlay rs-publish-overlay rs-publish-workspace rs-publish-send ${extraRootClass}">
  <div class="rs-publish-send-panels">
    <div class="rs-publish-send-column rs-publish-send-script">
      <pre class="rs-publish-script-readonly" spellcheck="false">${scriptDisplay}</pre>
    </div>
    <div class="rs-publish-send-column rs-publish-send-form">
      ${formFieldsHtml}
      <p class="rs-publish-error ${errorExtraClass}" hidden></p>
      <div class="rs-publish-send-actions">
        ${actionButtonHtml}
      </div>
    </div>
  </div>
</div>`;
}

module.exports = { buildSendPanelOverlay };
