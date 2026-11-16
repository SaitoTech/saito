module.exports = () => {
  return `
    <div id="saito-container" class="saito-container">
      <div class="saito-sidebar left"></div>
      <div class="saito-main"></div>
      <div class="saito-sidebar right"></div>
    </div>
    <div class="popup-chat" id="popup-chat">
      <button type="button" class="popup-chat-launcher" aria-expanded="false" aria-controls="popup-chat-panel">
        <i class="fa-solid fa-comments" aria-hidden="true"></i>
        <span>Chat</span>
        <span class="popup-chat-badge" hidden>0</span>
      </button>
      <div class="popup-chat-panel" id="popup-chat-panel" hidden>
        <div class="popup-chat-host"></div>
      </div>
      <div class="popup-chat-dock"></div>
    </div>
  `;
};
