// node-card.template.js
module.exports = (app, mod, props = {}) => {
  // Safely extract props (props may be undefined)
  
  const { key = '', title = '', stats = {}, peerStats = {} } = props;
  // Escape the JSON for embedding
  const rawStats     = JSON.stringify(stats).replace(/'/g, "\\'");
  const rawPeerStats = JSON.stringify(peerStats).replace(/'/g, "\\'");

  return `
    <div class="node-card" data-key="${key}">
      <div class="node-card-title">
        <span>${title}</span>
        <div>
          <button class="node-card-tab-btn active" data-tab="summary">Summary</button>
          <button class="node-card-tab-btn"      data-tab="peerStats">Peers</button>
          <button class="node-card-tab-btn"      data-tab="stats">Stats</button>
          <button class="node-card-tab-btn"      data-tab="peers">Explore</button>
          <button class="node-card-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="node-card-content padded">
        <div 
          data-raw-stats='${rawStats}' 
          data-raw-peer-stats='${rawPeerStats}' 
          style="display: none;"
        ></div>
      </div>
    </div>
  `;
};
