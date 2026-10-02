const {
  saitoFileDropOverlay
} = require('../../../../lib/saito/ui/saito-file-drop/saito-file-drop.template');

module.exports = AddAppOverlayTemplate = (app, mod, isMobile = false) => {
  const prompt = isMobile
    ? 'Tap to Install .saito Module'
    : 'Click or Drag and Drop .saito Module to Install';

  return saitoFileDropOverlay({
    title: 'Install Module',
    prompt,
    dropzoneId: 'saito-app-upload',
    rootClass: 'saito-app-overlay',
    afterDropzoneHtml: `
      <form class="saito-app-url-form" id="saito-app-url-form">
        <input type="url" class="saito-input" id="saito-app-url" name="url" placeholder="or, add by .saito file url:" aria-label="Add by .saito file URL" required spellcheck="false" autocomplete="url">
        <button type="submit" class="saito-button-primary" disabled>Import</button>
      </form>`,
    footerHtml: `Find featured applications and games on the <a class="saito-text-link" href="https://wiki.saito.io/applications/install" target="_blank" rel="noopener noreferrer">Saito Wiki</a><br/>Or browse beta and community applications at <a class="saito-text-link" href="https://mods.saito.io" target="_blank" rel="noopener noreferrer">mods.saito.io</a>`
  });
};
