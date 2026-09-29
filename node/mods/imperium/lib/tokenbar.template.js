module.exports = (command_tokens, strategy_tokens, fleet_supply) => {
  return `
    <div class="tokenbar">
      <div class="tokenbar-item">
        <span class="tokenbar-icon strategy" title="strategy tokens"></span>
        <span class="tokenbar-count">${strategy_tokens}</span>
      </div>
      <div class="tokenbar-item">
        <span class="tokenbar-icon command" title="command tokens"></span>
        <span class="tokenbar-count">${command_tokens}</span>
      </div>
      <div class="tokenbar-item">
        <span class="tokenbar-icon fleet" title="fleet supply"></span>
        <span class="tokenbar-count">${fleet_supply}</span>
      </div>
    </div>
  `;
};
