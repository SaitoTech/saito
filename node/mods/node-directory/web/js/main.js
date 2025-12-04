// Client-side controller for the NodeDirectory dashboard.
// Uses HTTP API endpoints instead of window.app to work standalone.

let cachedNodes = null;
let lastFetchTime = null;
let isFetching = false;
let browserRttCache = {}; // Cache RTT measurements from browser: { hostname: { rtt: number, timestamp: number } }

async function fetchPeers() {
  const res = await fetch('/node-directory/api/peers');
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  console.log('[NodeDirectory UI] API response:', Array.isArray(data) ? `${data.length} nodes` : 'non-array response', data);
  return data;
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

function formatLastSeen(timestamp) {
  if (!timestamp) return '<span class="nd-empty">n/a</span>';

  const now = Date.now();
  const ageMs = now - timestamp;
  const ageSec = Math.floor(ageMs / 1000);
  const ageMin = Math.floor(ageSec / 60);
  const ageHour = Math.floor(ageMin / 60);
  const days = Math.floor(ageHour / 24);

  // Format as relative time
  let relativeTime;
  if (ageSec < 60) {
    relativeTime = `${ageSec}s ago`;
  } else if (ageMin < 60) {
    relativeTime = `${ageMin}m ago`;
  } else if (ageHour < 24) {
    relativeTime = `${ageHour}h ago`;
  } else if (days < 7) {
    relativeTime = `${days}d ago`;
  } else {
    // For older entries, show date
    const date = new Date(timestamp);
    relativeTime = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return `<span title="${new Date(timestamp).toLocaleString()}">${relativeTime}</span>`;
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

function renderSummary(bestNode, serviceName) {
  const summaryEl = document.getElementById('nd-summary');
  if (!summaryEl) return;

  if (!serviceName) {
    summaryEl.innerHTML =
      'Select a service from the dropdown and click "Find Best Node for Service".';
    return;
  }

  if (!bestNode) {
    summaryEl.innerHTML = `No hosting nodes found for service <code>${serviceName}</code>.`;
    return;
  }

  // Prioritize hostname/URL - this is what users actually need
  let connectionInfo = '';
  if (bestNode.connectionUrl) {
    connectionInfo = `
      <div style="margin: 0.5rem 0;">
        <strong>Connect to:</strong> <a href="${bestNode.connectionUrl}" target="_blank" style="color: #0070f3; text-decoration: none;"><code style="background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px;">${bestNode.connectionUrl}</code></a>
        ${bestNode.hostname && bestNode.hostname !== bestNode.connectionUrl.replace(/^https?:\/\//, '') ? ` <span style="color: #666;">(${bestNode.hostname})</span>` : ''}
      </div>
    `;
  } else if (bestNode.hostname) {
    // Fallback: construct explorer URL from hostname
    const explorerUrl = `https://${bestNode.hostname}/explorer`;
    connectionInfo = `
      <div style="margin: 0.5rem 0;">
        <strong>Connect to:</strong> <a href="${explorerUrl}" target="_blank" style="color: #0070f3; text-decoration: none;"><code style="background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px;">${explorerUrl}</code></a>
      </div>
    `;
  } else {
    connectionInfo = `
      <div style="margin: 0.5rem 0; padding: 0.5rem; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 3px;">
        <strong>⚠️ No hostname available</strong>
        <br/><small>This node does not have a hostname configured. Without a hostname, you cannot connect to this node directly.</small>
        <br/><small><strong>Public Key:</strong> <code>${bestNode.publicKey}</code></small>
      </div>
    `;
  }

  summaryEl.innerHTML = `
    Best node for <span class="nd-summary-highlight">${serviceName}</span>:
    <br/>
    ${connectionInfo}
    <div style="margin-top: 0.5rem; font-size: 0.9em; color: #666;">
      <strong>Status:</strong> ${bestNode.status}
      ${(() => {
        // Prefer User RTT if available, and also show Server RTT if known
        let parts = [];
        if (bestNode.hostname && browserRttCache && browserRttCache[bestNode.hostname]) {
          parts.push(`<strong>User RTT:</strong> ${browserRttCache[bestNode.hostname].rtt} ms`);
        }
        if (bestNode.lastRttMs !== undefined) {
          parts.push(`<strong>Server RTT:</strong> ${bestNode.lastRttMs} ms`);
        }
        return parts.length ? `&nbsp;|&nbsp;${parts.join(' &nbsp;|&nbsp; ')}` : '';
      })()}
    </div>
  `;
}

function updateServiceDropdown(nodes) {
  const select = document.getElementById('nd-app-slug');
  if (!select) {
    console.warn('[NodeDirectory UI] Service dropdown element not found');
    return;
  }

  if (!nodes || !Array.isArray(nodes)) {
    console.warn('[NodeDirectory UI] Invalid nodes data for dropdown:', nodes);
    return;
  }

  // Extract unique services from all nodes
  const servicesSet = new Set();
  nodes.forEach(node => {
    if (node && node.services && Array.isArray(node.services)) {
      node.services.forEach(service => {
        if (service && service.service && typeof service.service === 'string') {
          servicesSet.add(service.service);
        }
      });
    }
  });

  // Convert to sorted array
  const services = Array.from(servicesSet).sort();

  console.log('[NodeDirectory UI] Found', services.length, 'unique services:', services);

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

  if (services.length === 0) {
    console.warn('[NodeDirectory UI] No services found in nodes - dropdown will be empty');
  }
}

function renderPeersTable(nodes) {
  const tbody = document.getElementById('nd-peer-rows');
  if (!tbody) return;

  // Update service dropdown whenever we render the table
  updateServiceDropdown(nodes);

  if (!nodes || !nodes.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="nd-empty">No peers currently known.</td>
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
                  (s) => {
                    // Extract service name (remove "app:" prefix if present)
                    const serviceName = s.service.startsWith('app:') 
                      ? s.service.substring(4) 
                      : s.service;
                    // Check if this service has a web frontend (from hasWebFrontend flag)
                    const hasWebFrontend = s.hasWebFrontend === true;
                    const shouldBeLink = hasWebFrontend && n.hostname;
                    let serviceLink = serviceName;
                    if (shouldBeLink) {
                      // Use default path /<serviceName>
                      serviceLink = `<a href="https://${n.hostname}/${serviceName}" target="_blank" rel="noopener noreferrer">${serviceName}</a>`;
                    }
                    return `<li><code>${serviceLink}</code>${
                      s.name ? ` – ${s.name}` : ''
                    }${s.domain ? ` (${s.domain})` : ''}</li>`;
                  }
                )
                .join('')}
            </ul>`
          : '<span class="nd-empty">none</span>';

      // Server RTT (from server-side measurement)
      const serverRtt = typeof n.lastRttMs === 'number'
        ? `${n.lastRttMs}`
        : '<span class="nd-empty">n/a</span>';
      
      // User RTT (from browser-side measurement)
      const userRtt = n.hostname && browserRttCache[n.hostname]
        ? `${browserRttCache[n.hostname].rtt}`
        : '<span class="nd-empty">n/a</span>';

      const peerType = n.peerType || 'unknown';
      const typeLabel = peerType === 'static' ? '<span class="nd-type-static">static</span>' :
                        peerType === 'local' ? '<span class="nd-type-local">local</span>' :
                        peerType === 'discovered' ? '<span class="nd-type-discovered">discovered</span>' :
                        peerType === 'connected' ? '<span class="nd-type-connected">connected</span>' :
                        '<span class="nd-type-discovered">unknown</span>';

      // Display hostname if available, otherwise show public key
      const publicKeyDisplay = n.hostname 
        ? `<strong><a href="https://${n.hostname}/explorer" target="_blank" rel="noopener noreferrer">${n.hostname}</a></strong><br/><code class="nd-public-key-small">${n.publicKey}</code>`
        : `<code>${n.publicKey}</code>`;

      // Format location
      const location = n.location 
        ? `<span>${n.location}</span>`
        : '<span class="nd-empty">n/a</span>';

      // Format last seen timestamp
      const lastSeen = formatLastSeen(n.lastSeenAt);

      return `
        <tr>
          <td>${publicKeyDisplay}</td>
          <td>${n.status}</td>
          <td>${typeLabel}</td>
          <td>${servicesHtml}</td>
          <td>${location}</td>
          <td>${serverRtt}</td>
          <td>${userRtt}</td>
          <td>${lastSeen}</td>
        </tr>
      `;
    })
    .join('');

  tbody.innerHTML = rows;
}

/**
 * Measure RTT from browser to a specific host
 * Uses Image loading technique to measure latency without CORS issues
 * @param {string} hostname - The hostname to measure RTT to
 * @returns {Promise<number|null>} - RTT in milliseconds, or null if measurement failed
 */
async function measureBrowserRtt(hostname) {
  if (!hostname) return null;
  
  return new Promise((resolve) => {
    // Use a small image or favicon request to measure RTT
    // This works even with CORS restrictions since we're just measuring timing
    const img = new Image();
    const startTime = performance.now();
    
    // Try to load a small resource (favicon or a small image)
    // Add a cache-busting parameter to ensure fresh request
    const url = `https://${hostname}/favicon.ico?t=${Date.now()}`;
    
    img.onload = () => {
      const endTime = performance.now();
      const rtt = Math.round(endTime - startTime);
      
      // Cache the result
      browserRttCache[hostname] = {
        rtt: rtt,
        timestamp: Date.now()
      };
      
      resolve(rtt);
    };
    
    img.onerror = () => {
      // If favicon fails, try measuring via fetch to explorer (may fail due to CORS but timing still works)
      const fetchStart = performance.now();
      fetch(`https://${hostname}/explorer`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      .then(() => {
        const fetchEnd = performance.now();
        const rtt = Math.round(fetchEnd - fetchStart);
        
        browserRttCache[hostname] = {
          rtt: rtt,
          timestamp: Date.now()
        };
        
        resolve(rtt);
      })
      .catch(() => {
        // If both methods fail, we can't measure RTT
        console.debug(`[NodeDirectory] Failed to measure RTT to ${hostname}`);
        resolve(null);
      });
    };
    
    // Start the image load
    img.src = url;
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!browserRttCache[hostname]) {
        resolve(null);
      }
    }, 10000);
  });
}

/**
 * Measure RTT from browser to all nodes with hostnames
 * @param {Array} nodes - Array of node objects
 */
async function measureBrowserRttForAllNodes(nodes) {
  if (!nodes || !Array.isArray(nodes)) return;
  
  // Filter nodes that have hostnames and haven't been measured recently (within last 30 seconds)
  const now = Date.now();
  const nodesToMeasure = nodes.filter(n => {
    if (!n.hostname) return false;
    const cached = browserRttCache[n.hostname];
    if (cached && (now - cached.timestamp) < 30000) {
      return false; // Skip if measured within last 30 seconds
    }
    return true;
  });
  
  console.log(`[NodeDirectory] Measuring browser RTT to ${nodesToMeasure.length} node(s)`);
  
  // Measure RTT to all nodes in parallel (but limit concurrency to avoid overwhelming the browser)
  const batchSize = 5;
  for (let i = 0; i < nodesToMeasure.length; i += batchSize) {
    const batch = nodesToMeasure.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(node => measureBrowserRtt(node.hostname))
    );
    // Small delay between batches to avoid overwhelming the browser
    if (i + batchSize < nodesToMeasure.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
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
          <td colspan="8" class="nd-empty">Loading peers…</td>
        </tr>
      `;
    }
  }

  isFetching = true;

  try {
    // Trigger RTT measurement in background (non-blocking)
    // Trigger browser-side RTT measurement
    measureBrowserRttForAllNodes(cachedNodes).then(() => {
      renderPeersTable(cachedNodes);
    });

    // Fetch peers (which will include cached RTT values)
    const nodes = await fetchPeers();

    console.log('[NodeDirectory UI] Fetched', nodes?.length || 0, 'nodes');

    // Only update if fetch succeeded
    cachedNodes = nodes;
    lastFetchTime = Date.now();
    renderPeersTable(nodes);
    updateDataAgeIndicator();

    // Log if no nodes found
    if (!nodes || nodes.length === 0) {
      console.warn('[NodeDirectory UI] No nodes returned from API');
    }
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
            <td colspan="8" class="nd-empty">Error loading peers: ${err.message}. See console for details.</td>
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

  console.log('[NodeDirectory UI] Finding best node for service:', service, 'slug:', slug);

  renderSummary(null, displayName);

  try {
    // Ensure we have up-to-date node list
    if (!cachedNodes) {
      await refreshAllNodes(true);
    }

    const nodes = cachedNodes || [];

    // Ensure we have fresh browser RTT measurements before choosing
    await measureBrowserRttForAllNodes(nodes);

    // Filter nodes that host the requested service
    const target1 = `app:${slug}`.toLowerCase();
    const target2 = slug.toLowerCase();

    const hostingNodes = nodes.filter((n) => {
      if (!n || !n.services || !Array.isArray(n.services)) return false;
      return n.services.some((s) => {
        if (!s || !s.service) return false;
        const svc = String(s.service).toLowerCase().trim();
        return svc === target1 || svc === target2;
      });
    });

    // Among hosting nodes, pick the one with the lowest User RTT (browser RTT)
    let best = null;
    let bestUserRtt = Number.POSITIVE_INFINITY;

    hostingNodes.forEach((n) => {
      if (!n.hostname) return;
      const cached = browserRttCache[n.hostname];
      if (!cached || typeof cached.rtt !== 'number') return;
      if (cached.rtt < bestUserRtt) {
        bestUserRtt = cached.rtt;
        best = n;
      }
    });

    if (!best) {
      console.log('[NodeDirectory UI] No hosting nodes with measured User RTT yet for', slug);
      const summaryEl = document.getElementById('nd-summary');
      if (summaryEl) {
        summaryEl.innerHTML = `No user RTT available to base a decision on for service <code>${displayName}</code>. Wait a few seconds for RTT measurements, then try again.`;
      }
      return;
    }

    console.log('[NodeDirectory UI] Best node result (by User RTT):', best, 'RTT=', bestUserRtt);
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
