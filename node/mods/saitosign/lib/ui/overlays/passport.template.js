function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function passportTemplate(image = '', error = '') {
  const evidence = image
    ? `<div class="passport-preview">
        <img src="${escapeHTML(image)}" alt="Uploaded passport identity page">
        <button type="button" class="passport-remove" data-passport-remove aria-label="Remove passport image">×</button>
      </div>`
    : `<div class="passport-drop" data-passport-drop role="button" tabindex="0" aria-label="Upload passport identity page">
        <input type="file" data-passport-file accept="image/*" hidden>
        <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
        <span>Drop a scan or image of your passport photo and identity page here</span>
        <button type="button" class="passport-choose" data-passport-choose>Choose image</button>
      </div>`;
  return `<div class="passport-upload">${evidence}<p class="passport-error" data-passport-error>${escapeHTML(error)}</p></div>`;
}

module.exports = passportTemplate;
