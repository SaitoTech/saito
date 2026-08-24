module.exports = (
  { isLongestChain = false, hasGoldenTicket = false } = {},
  { showLongestChain = false } = {}
) => {
  const badges = [];

  if (hasGoldenTicket) {
    badges.push(`
      <span class="explorer-feed-badge explorer-feed-status-badge" title="Golden ticket" aria-label="Golden ticket">
        <i class="fas fa-ticket" aria-hidden="true"></i>
      </span>
    `);
  }

  if (showLongestChain && isLongestChain) {
    badges.push(`
      <span class="explorer-feed-badge explorer-feed-status-badge" title="On longest chain" aria-label="On longest chain">
        <i class="fas fa-chain" aria-hidden="true"></i>
      </span>
    `);
  }

  return badges.length ? `<div class="explorer-feed-badges">${badges.join('')}</div>` : '';
};
