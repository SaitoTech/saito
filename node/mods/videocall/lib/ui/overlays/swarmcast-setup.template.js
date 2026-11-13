function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function checks(participants, name, checked) {
  if (!participants.length) {
    return '<p class="swarmcast-setup-empty">No participants are in the call yet.</p>';
  }
  return participants
    .map(
      (person) => `<label class="swarmcast-setup-person">
        <input type="checkbox" name="${name}" value="${text(person.key)}"${checked ? ' checked' : ''}>
        <span>${text(person.name)}</span>
      </label>`
    )
    .join('');
}

const presets = [
  ['economy', 'Economy'],
  ['standard', 'Standard'],
  ['high', 'High'],
  ['premium', 'Premium']
];

function abbreviate(key) {
  const value = String(key || '');
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function age(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function monitorText(census, now = Date.now()) {
  const listeners = census.listeners_known
    ? String(census.listeners)
    : `at least ${census.listeners}`;
  const parent = census.parent?.role === 'source'
    ? 'This node is the source'
    : census.parent?.public_key
      ? `${abbreviate(census.parent.public_key)} (${census.parent.status || 'unknown'})`
      : 'Unknown';
  const treeNote = census.descendants_known
    ? 'Downstream counts include reports from direct children. Deeper nodes appear when those children have reported them.'
    : 'Some direct children have not reported their downstream listeners yet. The listener total is a lower bound.';
  const rows = (census.children || []).filter(Boolean);
  const children = rows.length
    ? rows.map((child) => {
        const behind = child.downstream_known ? `${child.downstream} downstream` : 'downstream not reported';
        const when = child.status === 'online'
          ? child.connected_at ? `connected ${age(now - child.connected_at)}` : 'connected'
          : child.disconnected_at ? `disconnected ${age(now - child.disconnected_at)}` : child.status;
        const branch = (child.reported_children || []).filter((item) => item && item.public_key);
        return {
          slot: child.slot,
          public_key: child.public_key,
          label: abbreviate(child.public_key),
          status: child.status,
          behind,
          when,
          media: child.media || '',
          signaling: child.signaling || '',
          branch: branch.map((item) => abbreviate(item.public_key))
        };
      })
    : [];
  return {
    max_slots: String(census.max_slots),
    occupied: String(census.occupied),
    available: String(census.available),
    grace: String(census.grace),
    direct: String(census.direct),
    listeners,
    health: census.health === 'degraded' ? 'Degraded' : census.health === 'disconnected' ? 'Disconnected' : 'Healthy',
    health_state: census.health || 'healthy',
    reason: census.reason || '',
    parent,
    depth: String(census.depth ?? 0),
    known: census.known_nodes == null ? 'Unavailable' : String(census.known_nodes),
    tree_note: treeNote,
    pending: census.capacity_pending
      ? `Reducing to ${census.capacity_pending.requested} slots. ${census.capacity_pending.reason}`
      : '',
    children
  };
}

module.exports = (participants) => `
  <section class="swarmcast-setup saito-overlay-form retain-surface" data-state="settings" data-video="interface" data-audio="all" data-preset="standard">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">
        <span class="swarmcast-live-mark" hidden></span>
        <span class="swarmcast-setup-heading">What do you want to Swarmcast?</span>
      </h2>
    </header>
    <div class="swarmcast-setup-loading" role="status" hidden>
      <span class="swarmcast-setup-spinner" aria-hidden="true"></span>
      <p>Starting Swarmcast</p>
    </div>
    <p class="swarmcast-setup-error" hidden></p>
    <div class="swarmcast-setup-columns">
      <div class="swarmcast-setup-column">
        <fieldset class="swarmcast-setup-video">
          <div class="swarmcast-setup-cards">
            <label class="swarmcast-setup-card">
              <input type="radio" name="swarmcast-video" value="interface" checked>
              <svg class="swarmcast-setup-card-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20.5h8M12 16.5v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <span>My Screen</span>
            </label>
            <label class="swarmcast-setup-card">
              <input type="radio" name="swarmcast-video" value="participants">
              <svg class="swarmcast-setup-card-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="3.5" width="8.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="3.5" width="8.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2.5" y="13" width="8.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="8.5" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>
              <span>Video Boxes</span>
            </label>
          </div>
        </fieldset>
      </div>
      <div class="swarmcast-setup-side">
        <div class="swarmcast-setup-adjust">
          <div class="swarmcast-setup-tune">
            <span>Quality</span>
            <select class="saito-form-select swarmcast-setup-select" name="swarmcast-quality">
              ${presets
                .map(
                  ([value, label]) =>
                    `<option value="${value}"${value === 'standard' ? ' selected' : ''}>${label}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="swarmcast-setup-tune">
            <span>Resolution</span>
            <div class="swarmcast-setup-stepper swarmcast-setup-stepper-size">
              <button type="button" class="swarmcast-setup-step" data-step="size" data-dir="-1" aria-label="Decrease resolution">−</button>
              <strong data-size>960 × 540</strong>
              <button type="button" class="swarmcast-setup-step" data-step="size" data-dir="1" aria-label="Increase resolution">+</button>
            </div>
          </div>
          <div class="swarmcast-setup-tune">
            <span>Frame rate</span>
            <div class="swarmcast-setup-stepper">
              <button type="button" class="swarmcast-setup-step" data-step="rate" data-dir="-1" aria-label="Decrease frame rate">−</button>
              <strong data-rate>15 fps</strong>
              <button type="button" class="swarmcast-setup-step" data-step="rate" data-dir="1" aria-label="Increase frame rate">+</button>
            </div>
          </div>
          <div class="swarmcast-setup-tune">
            <span>Bitrate</span>
            <strong class="swarmcast-setup-bitrate" data-bitrate>800 kbps</strong>
          </div>
        </div>
        <input type="hidden" name="swarmcast-width" value="960">
        <input type="hidden" name="swarmcast-height" value="540">
        <input type="hidden" name="swarmcast-fps" value="15">
        <input type="hidden" name="swarmcast-slots" value="4">
        <div class="swarmcast-setup-slots">
          <div class="swarmcast-setup-tune">
            <span>Open slots</span>
            <div class="swarmcast-setup-stepper">
              <button type="button" class="swarmcast-slot-step" data-slots="-1" aria-label="Decrease open slots">−</button>
              <strong data-slots>4</strong>
              <button type="button" class="swarmcast-slot-step" data-slots="1" aria-label="Increase open slots">+</button>
            </div>
          </div>
        </div>
        <div class="swarmcast-setup-picks">
          <label class="swarmcast-setup-include">
            <span>Video</span>
            <input type="checkbox" name="swarmcast-include-video" checked>
          </label>
          <label class="swarmcast-setup-include">
            <span>Audio</span>
            <input type="checkbox" name="swarmcast-include-audio" checked>
          </label>
        </div>
      </div>
    </div>
    <div class="saito-button-row swarmcast-setup-actions">
      <button type="button" class="saito-button-primary swarmcast-setup-start">Start Swarmcasting</button>
    </div>
    <div class="swarmcast-setup-live" hidden>
      <div class="swarmcast-live-body">
        <section class="swarmcast-address">
          <h3>Address to join</h3>
          <div class="swarmcast-share">
            <a class="swarmcast-setup-live-link" target="_blank" rel="noopener noreferrer"></a>
            <button type="button" class="saito-icon-button swarmcast-setup-copy" aria-label="Copy link" title="Copy link">
              <i class="fa-solid fa-copy" aria-hidden="true"></i>
            </button>
          </div>
        </section>
        <section class="swarmcast-status">
          <h3>Swarmcast status</h3>
          <dl class="swarmcast-stat-list">
            <div class="swarmcast-listeners"><dt>Total listeners</dt><dd data-monitor="listeners">0</dd></div>
            <div><dt>My listeners</dt><dd data-monitor="direct">0</dd></div>
            <div><dt>Open slots</dt><dd data-monitor="max-slots">0</dd></div>
            <div><dt>Available slots</dt><dd data-monitor="available">0</dd></div>
          </dl>
        </section>
      </div>
      <div class="saito-button-row swarmcast-live-actions">
        <button type="button" class="saito-button-primary swarmcast-setup-stop">Terminate Swarmcasting</button>
      </div>
    </div>
  </section>`;

function monitorChildren(rows) {
  if (!rows.length) {
    return '<p class="swarmcast-setup-empty">No children are connected yet. Open slots can accept new peers.</p>';
  }
  return rows
    .map(
      (row) => `<article class="swarmcast-child" data-status="${text(row.status)}">
        <header>
          <strong>Slot ${text(row.slot)}</strong>
          <span title="${text(row.public_key)}">${text(row.label)}</span>
          <button type="button" data-copy="${text(row.public_key)}">Copy key</button>
        </header>
        <p>${text(row.status)} · ${text(row.when)} · ${text(row.behind)}</p>
        <p>${text(row.media)}${row.signaling ? ` · signaling ${text(row.signaling)}` : ''}</p>
      </article>`
    )
    .join('');
}

function monitorTree(rows) {
  if (!rows.length) return '<p class="swarmcast-setup-empty">The tree has no branches yet.</p>';
  return `<ul>${rows
    .map((row) => {
      const branch = row.branch.length
        ? `<ul>${row.branch.map((key) => `<li>${text(key)}</li>`).join('')}</ul>`
        : '';
      return `<li><span>Slot ${text(row.slot)} ${text(row.label)}</span><span>${text(row.behind)}</span>${branch}</li>`;
    })
    .join('')}</ul>`;
}

module.exports.monitorText = monitorText;
module.exports.monitorChildren = monitorChildren;
module.exports.monitorTree = monitorTree;
module.exports.abbreviate = abbreviate;
