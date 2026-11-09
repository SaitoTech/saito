module.exports = (status, detail) => `
  <div class="swarmcast-viewer">
    <div class="swarmcast-status" data-state="${status}">
      <p class="swarmcast-status-label">${status}</p>
      <p class="swarmcast-status-detail">${detail || ''}</p>
    </div>
    <div class="swarmcast-outputs"></div>
  </div>
`;
