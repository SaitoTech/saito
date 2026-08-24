const {
  saitoFileDropOverlay
} = require('../../../../../lib/saito/ui/saito-file-drop/saito-file-drop.template');

module.exports = (app, mod) => {
  const progressHtml = `
    <div class="state" hidden>
      <div class="saito-spinner" aria-hidden="true"></div>
      <div class="instructions status">Preparing upload…</div>
      <div class="loader" aria-hidden="true"></div>
    </div>
  `;

  return saitoFileDropOverlay({
    title: 'Upload ROM',
    prompt: 'Drag and drop a ROM you have legal access to',
    dropzoneId: 'nwasm-upload-rom',
    rootClass: 'nwasm-upload-rom',
    extraBodyHtml: progressHtml
  });
};
