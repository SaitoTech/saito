module.exports = ({ app, state, error, loading } = {}) => {
  const empty_hash = state?.zero_hash || '';
  const hash = (value) => {
    if (!value || value === empty_hash) {
      return '—';
    }
    return value;
  };

  const timeSince = (value) => {
    const ts = Number(value);
    if (!Number.isFinite(ts) || ts <= 0) {
      return '—';
    }
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const { hours, minutes, seconds } = app.browser.formatTime(Math.max(0, Date.now() - ms));
    if (hours > 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    if (minutes > 0) {
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  };

  const rows = (state?.recent || [])
    .map((block) => {
      return `
        <tr>
          <td>${block.id || '—'}</td>
          <td class="admin-blocks-hash" title="${hash(block.hash)}">${hash(block.hash)}</td>
          <td class="admin-blocks-hash" title="${block.creator || ''}">${block.creator || '—'}</td>
          <td>${timeSince(block.timestamp)}</td>
          <td>${block.fees || '0'}</td>
          <td>${block.burnfee || '0'}</td>
          <td>${block.golden_ticket ? 'yes' : '—'}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="admin-blocks-page">
      <div class="admin-blocks-header">
        <h1>Blockchain</h1>
        <button type="button" class="admin-button" id="admin-blocks-refresh" ${
          loading ? 'disabled' : ''
        }>${loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      ${error ? `<div class="admin-blocks-error">${error}</div>` : ''}

      ${
        state
          ? `<div class="admin-blocks-grid">
              <div class="admin-blocks-stat">
                <label>Genesis period</label>
                <div>${state.genesis_period || '—'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Heartbeat</label>
                <div>${state.heartbeat_interval ? `${state.heartbeat_interval} ms` : '—'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Block production</label>
                <div>${state.disable_block_production ? 'disabled' : 'enabled'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Confirmations</label>
                <div>${state.block_confirmation_limit || '—'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Prune after</label>
                <div>${state.prune_after_blocks || '—'} blocks</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Stake period</label>
                <div>${state.social_stake_period || '—'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Chain status</label>
                <div>${state.is_loading ? 'loading blocks' : state.is_loaded ? 'loaded' : '—'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Lowest acceptable id</label>
                <div>${state.lowest_acceptable_block_id || '—'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Genesis block</label>
                <div>${state.genesis_block_id || '—'}</div>
              </div>
              <div class="admin-blocks-stat">
                <label>Fork id</label>
                <div class="admin-blocks-hash" title="${hash(state.fork_id)}">${hash(
                  state.fork_id
                )}</div>
              </div>
            </div>`
          : ''
      }

      <div class="admin-blocks-recent">
        <h2>Recent Blocks</h2>
        ${
          rows
            ? `<table class="admin-blocks-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Hash</th>
                    <th>Creator</th>
                    <th>Time since</th>
                    <th>Fees</th>
                    <th>Burnfee</th>
                    <th>GT</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
            : `<p class="admin-blocks-empty">${
                loading ? 'Loading blockchain state…' : 'No recent blocks are in memory.'
              }</p>`
        }
      </div>
    </div>
  `;
};
