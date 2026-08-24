/**
 * Poker statistics overlay — presentation only.
 * Values are derived from existing poker.game.stats + tracked_stats metadata.
 * Percentage math matches the previous template (unchanged denominators).
 */

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStatEntry(playerStats, s) {
  const current_stat = playerStats[s.code];
  if (!(current_stat > 0)) {
    return { primary: '—', secondary: '', isPercent: false };
  }

  if (s?.percentage) {
    let denom = playerStats['hands'];
    if (s.percentage == 'adjusted') {
      denom -= playerStats['walks'];
    }
    if (denom > 0) {
      const percent = Math.round((100 * current_stat) / denom);
      return {
        primary: `${percent}%`,
        secondary: `${current_stat}/${denom}`,
        isPercent: true
      };
    }
    return { primary: '—', secondary: '', isPercent: true };
  }

  return { primary: String(current_stat), secondary: '', isPercent: false };
}

module.exports = (poker, tracked_stats) => {
  const players = Object.keys(poker.game.stats || {});
  const playerCount = Math.max(players.length, 1);

  let html = `
  <form class="saito-overlay-form poker-stats-overlay" id="poker-stats-overlay-root">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Poker Statistics</h2>
    </header>

    <div class="poker-stats-table" style="--poker-stats-players: ${playerCount}">
      <div class="poker-stats-row poker-stats-row--header" role="row">
        <div class="poker-stats-cell poker-stats-cell--label" role="columnheader"></div>`;

  for (const p of players) {
    const name = escapeHtml(poker.app.keychain.returnUsername(p));
    const key = escapeHtml(p);
    html += `
        <div class="poker-stats-cell poker-stats-cell--player" role="columnheader" title="${key}">
          <span class="poker-stats-player-name">${name}</span>
        </div>`;
  }

  html += `
      </div>`;

  const footnotes = [];

  for (const s of tracked_stats) {
    const hasNote = !!s?.further;
    if (hasNote) {
      footnotes.push({ label: s.readable, note: s.further });
    }

    const labelClass = hasNote
      ? 'poker-stats-label poker-stats-label--note'
      : 'poker-stats-label';
    const labelTitle = hasNote ? ` title="${escapeHtml(s.further)}"` : '';
    const labelStar = hasNote ? '*' : '';

    html += `
      <div class="poker-stats-row" role="row">
        <div class="poker-stats-cell poker-stats-cell--label" role="rowheader">
          <span class="${labelClass}"${labelTitle}>${escapeHtml(s.readable)}${labelStar}</span>
        </div>`;

    for (const p of players) {
      const entry = formatStatEntry(poker.game.stats[p], s);
      const valueClass = entry.isPercent
        ? 'poker-stats-value poker-stats-value--percent'
        : 'poker-stats-value poker-stats-value--count';

      html += `
        <div class="poker-stats-cell poker-stats-cell--value" role="cell">
          <span class="${valueClass}">${escapeHtml(entry.primary)}</span>`;

      if (entry.secondary) {
        html += `
          <span class="poker-stats-value-detail">${escapeHtml(entry.secondary)}</span>`;
      }

      html += `
        </div>`;
    }

    html += `
      </div>`;
  }

  html += `
    </div>`;

  if (footnotes.length) {
    html += `
    <div class="poker-stats-footnotes">`;
    for (const foot of footnotes) {
      html += `
      <p class="poker-stats-footnote">
        <span class="poker-stats-footnote-label">${escapeHtml(foot.label)}*</span>
        ${escapeHtml(foot.note)}
      </p>`;
    }
    html += `
    </div>`;
  }

  html += `
  </form>`;

  return html;
};
