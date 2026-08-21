module.exports = () => `
  <nav class="chat-manager-mobile-menu" aria-label="Chat navigation">
    <button class="item saito-large-square-button active" type="button" data-chat-action="chats">
      <span class="icon saito-icon-button"><i class="fa-regular fa-comments"></i></span>
      <span class="label">Chats</span>
    </button>
    <button class="item saito-large-square-button" type="button" data-chat-action="add-contact">
      <span class="icon saito-icon-button"><i class="fa-solid fa-user-plus"></i></span>
      <span class="label">Add Contact</span>
    </button>
    <button class="item saito-large-square-button" type="button" data-chat-action="new-group">
      <span class="icon saito-icon-button"><i class="fa-solid fa-user-group"></i></span>
      <span class="label">New Group</span>
    </button>
    <button class="item saito-large-square-button" type="button" data-chat-action="mark-read" title="Mark all chats as read">
      <span class="icon saito-icon-button"><i class="fa-solid fa-check-double"></i></span>
      <span class="label">Mark Read</span>
    </button>
    <button class="item saito-large-square-button" type="button" data-chat-action="settings">
      <span class="icon saito-icon-button"><i class="fa-solid fa-gear"></i></span>
      <span class="label">Settings</span>
    </button>
  </nav>
`;
