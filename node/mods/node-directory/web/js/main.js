// Client-side controller for the NodeDirectory dashboard.
// Uses HTTP API endpoints instead of window.app to work standalone.

let cachedNodes = null;
let lastFetchTime = null;
let isFetching = false;

async function fetchPeers() {
  const res = await fetch('/node-directory/api/peers');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

async function fetchBestNode(slug) {
  const res = await fetch(`/node-directory/api/best-node/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    if (res.status === 404) {
      return null; // no hosting nodes found
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

function formatDataAge(timestamp) {
  if (!timestamp) return 'never';
  
  const now = Date.now();
  const ageMs = now - timestamp;
  const ageSec = Math.floor(ageMs / 1000);
  const ageMin = Math.floor(ageSec / 60);
  const ageHour = Math.floor(ageMin / 60);
  
  if (ageSec < 60) {
    return `${ageSec}s ago`;
  } else if (ageMin < 60) {
    return `${ageMin}m ago`;
  } else if (ageHour < 24) {
    return `${ageHour}h ago`;
  } else {
    const days = Math.floor(ageHour / 24);
    return `${days}d ago`;
  }
}

function updateDataAgeIndicator() {
  const indicator = document.getElementById('nd-data-age');
  if (indicator) {
    if (lastFetchTime) {
      const age = formatDataAge(lastFetchTime);
      indicator.textContent = `Data updated ${age}`;
      indicator.className = 'nd-data-age';
    } else {
      indicator.textContent = 'No data loaded';
      indicator.className = 'nd-data-age nd-data-age-stale';
    }
  }
}

function renderSummary(bestNode, appSlug) {
  const summaryEl = document.getElementById('nd-summary');
  if (!summaryEl) return;

  if (!appSlug) {
    summaryEl.innerHTML =
      'Enter an app slug (e.g. <code>arcade</code>) and click "Find Best Node for App".';
    return;
  }

  if (!bestNode) {
    summaryEl.innerHTML = `No hosting nodes found for app slug <code>${appSlug}</code>.`;
    return;
  }

  summaryEl.innerHTML = `
    Best node for <span class="nd-summary-highlight">${appSlug}</span>:
    <br/>
    <strong>Peer Index:</strong> ${bestNode.peerIndex.toString()} &nbsp;|&nbsp;
    <strong>Status:</strong> ${bestNode.status}
    ${bestNode.lastRttMs !== undefined ? `&nbsp;|&nbsp;<strong>RTT:</strong> ${bestNode.lastRttMs} ms` : ''}
    <br/>
    <strong>Public Key:</strong> <code>${bestNode.publicKey}</code>
  `;
}

function updateServiceDropdown(nodes) {
  const select = document.getElementById('nd-app-slug');
  if (!select) return;

  // Extract unique services from all nodes
  const servicesSet = new Set();
  nodes.forEach(node => {
    if (node.services && Array.isArray(node.services)) {
      node.services.forEach(service => {
        if (service.service) {
          servicesSet.add(service.service);
        }
      });
    }
  });

  // Convert to sorted array
  const services = Array.from(servicesSet).sort();

  // Clear existing options (except the first "Select..." option)
  select.innerHTML = '<option value="">Select a service...</option>';

  // Add service options
  services.forEach(service => {
    const option = document.createElement('option');
    option.value = service;
    
    // Extract display name: if service is "app:arcade", show "arcade", otherwise show full service name
    const displayName = service.startsWith('app:') ? service.substring(4) : service;
    option.textContent = displayName;
    
    select.appendChild(option);
  });
}

function renderPeersTable(nodes) {
  const tbody = document.getElementById('nd-peer-rows');
  if (!tbody) return;

  // Update service dropdown whenever we render the table
  updateServiceDropdown(nodes);

  if (!nodes || !nodes.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="nd-empty">No peers currently known.</td>
      </tr>
    `;
    return;
  }

  const rows = nodes
    .map((n) => {
      const servicesHtml =
        n.services && n.services.length
          ? `<ul class="nd-services-list">
              ${n.services
                .map(
                  (s) =>
                    `<li><code>${s.service}</code>${
                      s.name ? ` – ${s.name}` : ''
                    }${s.domain ? ` (${s.domain})` : ''}</li>`
                )
                .join('')}
            </ul>`
          : '<span class="nd-empty">none</span>';

      const rtt =
        typeof n.lastRttMs === 'number'
          ? `${n.lastRttMs}`
          : '<span class="nd-empty">n/a</span>';

      const peerType = n.peerType || 'unknown';
      const typeLabel = peerType === 'static' ? '<span class="nd-type-static">static</span>' :
                        peerType === 'local' ? '<span class="nd-type-local">local</span>' :
                        peerType === 'discovered' ? '<span class="nd-type-discovered">discovered</span>' :
                        peerType === 'connected' ? '<span class="nd-type-connected">connected</span>' :
                        '<span class="nd-type-discovered">unknown</span>';

      // Display hostname if available, otherwise show public key
      const publicKeyDisplay = n.hostname 
        ? `<strong>${n.hostname}</strong><br/><code class="nd-public-key-small">${n.publicKey}</code>`
        : `<code>${n.publicKey}</code>`;

      return `
        <tr>
          <td>${n.peerIndex.toString()}</td>
          <td>${publicKeyDisplay}</td>
          <td>${n.status}</td>
          <td>${typeLabel}</td>
          <td>${servicesHtml}</td>
          <td>${rtt}</td>
        </tr>
      `;
    })
    .join('');

  tbody.innerHTML = rows;
}

async function triggerRttMeasurement() {
  try {
    await fetch('/node-directory/api/measure-rtt', { method: 'POST' });
  } catch (err) {
    // Silently fail - RTT measurement is best-effort
    console.debug('NodeDirectory: RTT measurement trigger failed', err);
  }
}

async function refreshAllNodes(showLoading = false) {
  // If already fetching, don't start another fetch
  if (isFetching) {
    return;
  }

  const tbody = document.getElementById('nd-peer-rows');
  
  // Only show loading if explicitly requested (manual refresh) or if we have no cached data
  if (showLoading || !cachedNodes) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="nd-empty">Loading peers…</td>
        </tr>
      `;
    }
  }

  isFetching = true;
  
  try {
    // Trigger RTT measurement in background (non-blocking)
    triggerRttMeasurement();
    
    // Fetch peers (which will include cached RTT values)
    const nodes = await fetchPeers();
    
    // Only update if fetch succeeded
    cachedNodes = nodes;
    lastFetchTime = Date.now();
    renderPeersTable(nodes);
    updateDataAgeIndicator();
  } catch (err) {
    console.error('NodeDirectory UI: failed to load nodes', err);
    
    // If we have cached data, keep showing it and just update the indicator
    if (cachedNodes) {
      console.log('NodeDirectory: Using cached data due to fetch error');
      updateDataAgeIndicator();
      // Show error notification but don't clear the table
      const indicator = document.getElementById('nd-data-age');
      if (indicator) {
        indicator.textContent = `Data updated ${formatDataAge(lastFetchTime)} (refresh failed)`;
        indicator.className = 'nd-data-age nd-data-age-error';
      }
    } else {
      // Only show error if we have no cached data
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="nd-empty">Error loading peers. See console for details.</td>
          </tr>
        `;
      }
      updateDataAgeIndicator();
    }
  } finally {
    isFetching = false;
  }
}

async function findBestNodeForApp() {
  const select = document.getElementById('nd-app-slug');
  const service = (select?.value || '').trim();

  if (!service) {
    const summaryEl = document.getElementById('nd-summary');
    if (summaryEl) {
      summaryEl.innerHTML = 'Please select a service from the dropdown.';
    }
    return;
  }

  // Extract slug from service: if service is "app:arcade", use "arcade", otherwise use the service name
  const slug = service.startsWith('app:') ? service.substring(4) : service;
  const displayName = slug;

  renderSummary(null, displayName);

  try {
    const best = await fetchBestNode(slug);
    renderSummary(best, displayName);

    // Refresh the table to show updated RTT for the best node
    // Use cached data if available, otherwise fetch fresh
    if (cachedNodes) {
      renderPeersTable(cachedNodes);
    } else {
      await refreshAllNodes(true);
    }
  } catch (err) {
    console.error('NodeDirectory UI: failed to find best node', err);
    const summaryEl = document.getElementById('nd-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `Error finding best node: ${err.message}`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('nd-refresh-all');
  const bestBtn = document.getElementById('nd-find-best');
  const serviceSelect = document.getElementById('nd-app-slug');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshAllNodes(true); // Show loading on manual refresh
    });
  }

  if (bestBtn) {
    bestBtn.addEventListener('click', () => {
      findBestNodeForApp();
    });
  }

  // Allow Enter key on dropdown to trigger "Find Best Node"
  if (serviceSelect) {
    serviceSelect.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        findBestNodeForApp();
      }
    });
  }

  // Auto-load peers on page load (show loading on initial load)
  refreshAllNodes(true);

  // Auto-refresh peers table every 30 seconds in background (no loading indicator)
  setInterval(() => {
    refreshAllNodes(false); // Background refresh, don't show loading
  }, 30000); // 30 seconds

  // Update data age indicator every second
  setInterval(() => {
    updateDataAgeIndicator();
  }, 1000);
});
