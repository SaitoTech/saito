const AddContactTemplate = require('./add-contact.template');
const AddContactComplete = require('./add-contact-complete');

module.exports = AddContact = {
  async render(app, data) {
    document.querySelector('body').innerHTML = AddContactTemplate(data);

    await data.header.render(app, data);
    data.header.attachEvents(app, data);
  },

  attachEvents(app, data) {
    document.getElementById('add-contact-add-button').onclick = () => {
      let publickey = document.getElementById('add-contact-publickey').value;
      app.keychain.addKey(publickey, { added: true });
      let chat_mod = app.modules.returnModule('Chat');
      if (chat_mod) {
        chat_mod.returnOrCreateChatGroupFromMembers([chat_mod.publicKey, publickey]);
      }

      AddContactComplete.render(app, data);
    };
  }
};
