module.exports = (app, mod, props = {}) => {
  const { title = '' } = props;
  return `
    <div class="node-card">
      <div class="node-card-header">
        <div class="node-card-menu">
          <button class="node-card-tab-btn active" data-tab="summary">Summary</button>
          <button class="node-card-tab-btn" data-tab="peerStats">Peers</button>
          <button class="node-card-tab-btn" data-tab="peers">Explore</button>
          <button class="node-card-close" aria-label="Close">×</button>
        </div>

      <div class="node-card-info">
        <div class="title-container">
          <span class="title">${title}</span>            
          <span class="ip"></span>
        </div>
        <div class="pubkey"></div>
      </div>

      </div>

      <div class="node-card-content padded"></div>
    </div>
  `;
};
