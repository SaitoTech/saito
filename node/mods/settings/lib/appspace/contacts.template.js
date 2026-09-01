module.exports = (app) => {
  const contacts = app.keychain.returnKeys().filter((key) => {
    return !['group', 'event', 'scheduled_call'].includes(key?.type);
  });

  if (!contacts.length) {
    return '<div class="settings-appspace-contacts-empty">No contacts in your keyring.</div>';
  }

  return contacts
    .map((contact) => {
      const publicKey = app.browser.escapeHTML(contact.publicKey);
      let name = app.keychain.returnIdentifierByPublicKey(contact.publicKey, true);

      if (name === contact.publicKey) {
        name = 'Anonymous User';
      }

      return `
        <div class="settings-appspace-contact" data-id="${publicKey}" role="button" tabindex="0">
          <div class="saito-identicon-box">
            <img class="saito-identicon" src="${app.keychain.returnIdenticon(contact.publicKey)}" alt="">
          </div>
          <div class="settings-appspace-contact-details">
            <div class="settings-appspace-contact-name">${app.browser.escapeHTML(name)}</div>
            <div class="settings-appspace-contact-key" title="${publicKey}">${publicKey}</div>
          </div>
        </div>`;
    })
    .join('');
};
