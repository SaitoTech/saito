module.exports = ({ state, error, loading } = {}) => {
  const formatTime = (value) => {
    const n = Number(value);
    if (!n) {
      return '—';
    }
    return new Date(n).toLocaleString();
  };

  const short = (value) => {
    const text = String(value || '');
    if (text.length <= 20) {
      return text || '—';
    }
    return `${text.slice(0, 10)}…${text.slice(-8)}`;
  };

  const empty_hash = state?.zero_hash || '';
  const hash = (value) => {
    if (!value || value === empty_hash) {
      return '—';
    }
    return value;
  };

  const current = (state?.recent && state.recent[0]) || null;
  const current_id = current?.id || state?.latest_block_id || '—';
  const current_hash = hash(current?.hash || state?.last_block_hash);

  const rows = (state?.recent || [])
    .map((block) => {
      return `
        <tr>
          <td>${block.id || '—'}</td>
          <td class="admin-blocks-hash" title="${hash(block.hash)}">${short(hash(block.hash))}</td>
          <td>${formatTime(block.timestamp)}</td>
          <td class="admin-blocks-hash" title="${block.creator || ''}">${short(block.creator)}</td>
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
        <h1>Blocks</h1>
        <button type="button" class="admin-button" id="admin-blocks-refresh" ${
          loading ? 'disabled' : ''
        }>${loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <p class="admin-blocks-intro">
        What the running Saito core currently believes about the blockchain.
        For full history, transactions, and slips, use the Block Explorer.
      </p>

      ${error ? `<div class="admin-blocks-error">${error}</div>` : ''}

      <div class="admin-blocks-current">
        <div class="admin-blocks-current-label">Current block</div>
        <div class="admin-blocks-current-id">${loading && !state ? '…' : current_id}</div>
        <div class="admin-blocks-hash-full">${loading && !state ? '' : current_hash}</div>
        ${
          current
            ? `<div class="admin-blocks-current-meta">
                ${formatTime(current.timestamp)}
                · previous ${short(hash(current.previous_hash))}
                · creator ${short(current.creator)}
                · fees ${current.fees || '0'}
                · burnfee ${current.burnfee || '0'}
                · treasury ${current.treasury || '0'}
                · graveyard ${current.graveyard || '0'}
                ${current.golden_ticket ? '· golden ticket' : ''}
              </div>`
            : ''
        }
      </div>

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
                <div>${
                  state.is_loading ? 'loading blocks' : state.is_loaded ? 'loaded' : '—'
                }</div>
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
                <div class="admin-blocks-hash" title="${hash(state.fork_id)}">${short(
                  hash(state.fork_id)
                )}</div>
              </div>
            </div>`
          : ''
      }

      <div class="admin-blocks-recent">
        <h2>Recent blocks</h2>
        ${
          rows
            ? `<table class="admin-blocks-table">
                <thead>
                  <tr>
                    <th>Id</th>
                    <th>Hash</th>
                    <th>Time</th>
                    <th>Creator</th>
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
