module.exports = (count = 5) => {
  const rows = Array.from({ length: count })
    .map(
      () => `
      <div class="explorer-tx-skeleton-row">
        <div class="explorer-skeleton-line explorer-skeleton-icon"></div>
        <div class="explorer-tx-skeleton-body">
          <div class="explorer-skeleton-line explorer-skeleton-line-md"></div>
          <div class="explorer-skeleton-line explorer-skeleton-line-sm"></div>
        </div>
        <div class="explorer-tx-skeleton-aside">
          <div class="explorer-skeleton-line explorer-skeleton-line-xs"></div>
          <div class="explorer-skeleton-line explorer-skeleton-line-xs"></div>
        </div>
      </div>
    `
    )
    .join('');

  return `
    <div class="explorer-tx-skeleton-list" aria-hidden="true">
      ${rows}
    </div>
  `;
};
