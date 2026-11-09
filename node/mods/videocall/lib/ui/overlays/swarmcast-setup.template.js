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

function names(participants) {
  if (!participants.length) return '<p class="swarmcast-setup-empty">No audio tracks are in the call yet.</p>';
  return participants.map((person) => `<span>${text(person.name)}</span>`).join('');
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
      <h2 class="saito-overlay-form-header-title">Swarmcast Settings</h2>
    </header>
    <div class="swarmcast-setup-loading" role="status" hidden>
      <span class="swarmcast-setup-spinner" aria-hidden="true"></span>
      <p>Starting Swarmcast</p>
    </div>
    <p class="swarmcast-setup-error" hidden></p>
    <div class="swarmcast-setup-columns">
      <div class="swarmcast-setup-column">
        <fieldset class="swarmcast-setup-video">
          <legend>What do you want to Swarmcast?</legend>
          <label class="swarmcast-setup-choice">
            <input type="radio" name="swarmcast-video" value="interface" checked>
            <span>My Screen</span>
          </label>
          <label class="swarmcast-setup-choice">
            <input type="radio" name="swarmcast-video" value="participants">
            <span>Video Boxes</span>
          </label>
          <div class="swarmcast-setup-video-list">${checks(participants, 'swarmcast-video-member', false)}</div>
        </fieldset>
        <fieldset class="swarmcast-setup-audio">
          <legend>Include Audio Tracks?</legend>
          <div class="swarmcast-setup-audio-included">${names(participants)}</div>
          <div class="swarmcast-setup-audio-list">${checks(participants, 'swarmcast-audio-member', true)}</div>
        </fieldset>
      </div>
      <fieldset class="swarmcast-setup-quality">
        <legend>Quality</legend>
        ${presets
          .map(
            ([value, label]) => `<label class="swarmcast-setup-choice">
            <input type="radio" name="swarmcast-quality" value="${value}"${value === 'standard' ? ' checked' : ''}>
            <span>${label}</span>
          </label>`
          )
          .join('')}
        <div class="swarmcast-setup-adjust">
          <div class="swarmcast-setup-adjust-row">
            <span>Resolution</span>
            <button type="button" class="swarmcast-setup-step" data-step="size" data-dir="-1" aria-label="Decrease resolution">−</button>
            <strong data-size>960×540</strong>
            <button type="button" class="swarmcast-setup-step" data-step="size" data-dir="1" aria-label="Increase resolution">+</button>
          </div>
          <div class="swarmcast-setup-adjust-row">
            <span>Frame rate</span>
            <button type="button" class="swarmcast-setup-step" data-step="rate" data-dir="-1" aria-label="Decrease frame rate">−</button>
            <strong data-rate>15 fps</strong>
            <button type="button" class="swarmcast-setup-step" data-step="rate" data-dir="1" aria-label="Increase frame rate">+</button>
          </div>
        </div>
        <input type="hidden" name="swarmcast-width" value="960">
        <input type="hidden" name="swarmcast-height" value="540">
        <input type="hidden" name="swarmcast-fps" value="15">
        <dl class="swarmcast-setup-meters">
          <div><dt>Source</dt><dd data-source>Not shared yet</dd></div>
          <div><dt>Outgoing</dt><dd data-outgoing>960×540</dd></div>
          <div><dt>Frame rate</dt><dd data-outgoing-rate>15 fps</dd></div>
          <div><dt>Bitrate</dt><dd data-bitrate>800 kbps</dd></div>
        </dl>
      </fieldset>
    </div>
    <div class="saito-button-row swarmcast-setup-actions">
      <button type="button" class="saito-button-secondary swarmcast-setup-back" hidden>Back to swarm</button>
      <button type="button" class="saito-button-primary swarmcast-setup-start">Start Swarmcasting</button>
    </div>
    <div class="swarmcast-setup-live" hidden>
      <p class="swarmcast-setup-live-label">Swarmcast is live</p>
      <a class="swarmcast-setup-live-link" target="_blank" rel="noopener noreferrer"></a>
      <div class="swarmcast-setup-live-tools">
        <button type="button" class="swarmcast-setup-copy">Copy link</button>
        <button type="button" class="swarmcast-setup-edit">Change broadcast</button>
      </div>
      <div class="swarmcast-monitor">
        <section class="swarmcast-monitor-capacity">
          <h3>Capacity</h3>
          <dl class="swarmcast-setup-meters">
            <div><dt>Maximum child slots</dt><dd data-monitor="max-slots">0</dd></div>
            <div><dt>Occupied slots</dt><dd data-monitor="occupied">0</dd></div>
            <div><dt>Available slots</dt><dd data-monitor="available">0</dd></div>
            <div><dt>Reconnecting</dt><dd data-monitor="grace">0</dd></div>
            <div><dt>Direct children</dt><dd data-monitor="direct">0</dd></div>
            <div><dt>Listeners</dt><dd data-monitor="listeners">0</dd></div>
          </dl>
          <div class="swarmcast-setup-adjust-row swarmcast-capacity-control">
            <span>Child slots</span>
            <button type="button" class="swarmcast-setup-step" data-capacity="-1" aria-label="Decrease child slots">−</button>
            <input class="swarmcast-capacity-input" type="number" min="0" step="1" value="4" aria-label="Maximum child slots">
            <button type="button" class="swarmcast-setup-step" data-capacity="1" aria-label="Increase child slots">+</button>
          </div>
          <p class="swarmcast-capacity-pending" data-monitor="pending" hidden></p>
        </section>
        <section class="swarmcast-monitor-health">
          <h3>Network health</h3>
          <p class="swarmcast-health" data-monitor="health" data-health="healthy">Healthy</p>
          <p class="swarmcast-health-reason" data-monitor="reason"></p>
          <dl class="swarmcast-setup-meters">
            <div><dt>Parent</dt><dd data-monitor="parent">This node is the source</dd></div>
            <div><dt>Depth</dt><dd data-monitor="depth">0</dd></div>
            <div><dt>Known nodes</dt><dd data-monitor="known">1</dd></div>
          </dl>
        </section>
        <section class="swarmcast-monitor-tree">
          <h3>Swarm</h3>
          <p class="swarmcast-tree-note" data-monitor="tree-note"></p>
          <div class="swarmcast-tree" data-monitor="tree"></div>
        </section>
        <section class="swarmcast-monitor-children">
          <h3>Direct children</h3>
          <div class="swarmcast-children" data-monitor="children"></div>
        </section>
      </div>
      <div class="saito-button-row">
        <button type="button" class="saito-button-secondary swarmcast-setup-close">Close</button>
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
