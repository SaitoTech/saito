const ModTemplate = require('./../../lib/templates/modtemplate');
const PeerService = require('saito-js/lib/peer_service').default;
const nodeDirectoryIndex = require('./index');
const fs = require('fs');
const path = require('path');

/**
 * NodeDirectory
 *
 * First-class app that:
 *  - lists all known peers / their services
 *  - finds nodes that host a given service (via PeerService)
 *  - picks the "closest" node (RTT) that hosts a given service
 */
class NodeDirectory extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = 'node-directory';
    this.slug = 'node-directory';
    this.description = 'Discovery and routing helper to find nodes and nearest hosts for apps';
    this.categories = 'Core Utilities';
    this._peerCache = [];
    this._rttCache = {}; // Cache RTT measurements by publicKey
    this._rttMeasurementInterval = null; // Interval timer for periodic RTT measurement
    this._discoveredNodes = new Map(); // Map<publicKey, nodeInfo> for nodes discovered via network queries
    this._discoveryInProgress = false; // Flag to prevent concurrent discovery operations
    this._lastDiscoveryTime = 0; // Timestamp of last discovery operation
    this._discoveryInterval = null; // Interval timer for periodic discovery
  }

  returnServices() {
    const services = [];
    if (!this.app.BROWSER) {
      services.push(new PeerService(null, 'node-directory', 'Node Directory', ''));
    }
    return services;
  }

  async initialize(app) {
    await super.initialize(app);
    // Load discovered nodes from storage
    await this.loadDiscoveredNodes();
    // Start periodic RTT measurement
    // Note: Server-side measures server-to-peer RTT, browser-side measures browser-to-peer RTT
    this.startPeriodicRttMeasurement();
    // Start periodic network discovery (server-side only)
    if (!this.app.BROWSER) {
      this.startPeriodicDiscovery(60000); // Discover every 60 seconds
    }
  }

  /**
   * Measure RTT for all connected peers periodically
   */
  async measureRttForAllPeers() {
    if (!this.app?.network || !this.app.network.getPeers) {
      return;
    }
    const nodes = await this.getAllNodes();
    const connectedPeers = nodes.filter(n => n.status === 'connected' && n.status !== 'local');
    // Measure RTT for up to 10 peers at a time (to avoid overwhelming the network)
    const peersToMeasure = connectedPeers.slice(0, 10);
    for (const node of peersToMeasure) {
      try {
        const rtt = await this.measureRttToPeer(node.peerIndex);
        const timestamp = Date.now();
        this._rttCache[node.publicKey] = {
          rtt,
          timestamp
        };
      } catch (e) {
        // Ignore failures
      }
    }
  }

  /**
   * Start periodic RTT measurement (every 30 seconds)
   */
  startPeriodicRttMeasurement() {
    if (this._rttMeasurementInterval) {
      return; // Already running
    }
    // Delay initial measurement to ensure network is ready
    setTimeout(() => {
      this.measureRttForAllPeers().catch(err => {
        console.error('[NodeDirectory] Error in initial RTT measurement:', err);
      });
    }, 5000); // Wait 5 seconds after initialization
    this._rttMeasurementInterval = setInterval(() => {
      this.measureRttForAllPeers().catch(err => {
        console.error('[NodeDirectory] Error in periodic RTT measurement:', err);
      });
    }, 30000); // 30 seconds
  }

  /**
   * Stop periodic RTT measurement
   */
  stopPeriodicRttMeasurement() {
    if (this._rttMeasurementInterval) {
      clearInterval(this._rttMeasurementInterval);
      this._rttMeasurementInterval = null;
    }
  }

  /**
   * Look up hostname for a public key using the Registry module or keychain
   * 
   * NOTE: Registry is a DNS-like service that requires explicit registration.
   * Just being a peer doesn't mean a key is registered in the Registry.
   * Keys must be registered via the Registry module's registration process.
   * 
   * If a key isn't found, it likely means:
   * 1. The key hasn't been registered in the Registry
   * 2. The Registry cache hasn't been populated yet
   * 3. The Registry module isn't enabled or configured
   */
  getHostnameForPublicKey(publicKey) {
    if (!publicKey) {
      return null;
    }
    try {
      // Method 1: Try Registry module's cached_keys via respondTo
      const registryMod = this.app.modules.returnModule('Registry');
      if (registryMod && registryMod.respondTo) {
        const registry = registryMod.respondTo('saito-return-key');
        if (registry && registry.returnKey) {
          const result = registry.returnKey(publicKey);
          if (result && result.identifier && result.identifier !== publicKey) {
            // Only return if identifier is different from public key (actual DNS name)
            console.log('[NodeDirectory] Found hostname via Registry:', result.identifier, 'for', publicKey.substring(0, 10));
            return result.identifier;
          }
        }
      }

      // Method 2: Check Registry's cached_keys directly (if accessible)
      if (registryMod && registryMod.cached_keys) {
        if (registryMod.cached_keys[publicKey]) {
          const identifier = registryMod.cached_keys[publicKey];
          if (identifier && identifier !== publicKey) {
            // Only return if identifier is different from public key (actual DNS name)
            console.log('[NodeDirectory] Found hostname via cached_keys:', identifier, 'for', publicKey.substring(0, 8));
            return identifier;
          }
        }
      }

      // Method 3: Try keychain directly (used by Registry internally)
      // NOTE: keychain.returnIdentifierByPublicKey returns the public key itself if no identifier found
      // So we need to check if it's different from the public key
      if (this.app.keychain && this.app.keychain.returnIdentifierByPublicKey) {
        const identifier = this.app.keychain.returnIdentifierByPublicKey(publicKey, true);
        if (identifier && identifier !== publicKey) {
          // Only return if identifier is different from public key (actual DNS name)
          console.log('[NodeDirectory] Found hostname via keychain:', identifier, 'for', publicKey.substring(0, 8));
          return identifier;
        }
      }
      console.debug('[NodeDirectory] No hostname found for', publicKey.substring(0, 8) + '...');
    } catch (e) {
      console.error('[NodeDirectory] Error looking up hostname for', publicKey.substring(0, 8) + '...', ':', e);
    }
    return null;
  }

  /**
   * Trigger fetching identifiers for all peers to populate Registry cache
   */
  async fetchIdentifiersForPeers(peers, localPublicKey = null) {
    try {
      const registryMod = this.app.modules.returnModule('Registry');
      // Debug: Check what's currently in Registry cache
      if (registryMod && registryMod.cached_keys) {
        const cacheSize = Object.keys(registryMod.cached_keys).length;
        console.log('[NodeDirectory] Registry cached_keys size:', cacheSize);
        if (cacheSize > 0) {
          console.log('[NodeDirectory] Registry cached_keys sample:', 
            Object.keys(registryMod.cached_keys).slice(0, 5).map(k => 
              `${k.substring(0, 8)}:${registryMod.cached_keys[k]}`
            ).join(', '));
        }
      }
      if (registryMod && registryMod.fetchManyIdentifiers) {
        const publicKeys = peers
          .filter(p => p && p.publicKey)
          .map(p => p.publicKey);
        // Include local node's public key if provided
        if (localPublicKey && !publicKeys.includes(localPublicKey)) {
          publicKeys.push(localPublicKey);
        }
        if (publicKeys.length > 0) {
          console.log('[NodeDirectory] Fetching identifiers for', publicKeys.length, 'peers');
          console.log('[NodeDirectory] Public keys to fetch:', publicKeys.map(k => k.substring(0, 8)).join(', '));
          registryMod.fetchManyIdentifiers(publicKeys, (identifiers) => {
            const foundCount = Object.keys(identifiers).length;
            console.log('[NodeDirectory] Fetched identifiers result:', foundCount, 'found out of', publicKeys.length);
            if (foundCount > 0) {
              console.log('[NodeDirectory] Found identifiers:', 
                Object.keys(identifiers).map(k => `${k.substring(0, 8)}:${identifiers[k]}`).join(', '));
            } else {
              console.warn('[NodeDirectory] No identifiers found. Keys may not be registered in Registry.');
              console.warn('[NodeDirectory] Note: Registry is a DNS-like service - keys must be explicitly registered.');
            }
            // Check Registry cache again after fetch
            if (registryMod.cached_keys) {
              const newCacheSize = Object.keys(registryMod.cached_keys).length;
              console.log('[NodeDirectory] Registry cached_keys size after fetch:', newCacheSize);
            }
          });
        }
      } else {
        console.warn('[NodeDirectory] Registry module or fetchManyIdentifiers not available');
        if (!registryMod) {
          console.warn('[NodeDirectory] Registry module not found - is it enabled in modules.config.js?');
        }
      }
    } catch (e) {
      console.error('[NodeDirectory] Error fetching identifiers:', e);
    }
  }

  /**
   * Get only directly connected peers (used for peer list responses to avoid loops)
   */
  async getAllNodesDirect() {
    if (!this.app?.network || !this.app.network.getPeers) {
      console.warn('NodeDirectory: app.network.getPeers not available');
      return [];
    }
    const peers = await this.app.network.getPeers();
    return await this._processPeers(peers, false); // false = don't include discovered nodes
  }

  /**
   * Process peers into node objects
   */
  async _processPeers(peers, includeDiscovered = true) {
    const nodes = [];
    // Add local node (self) first
    let myPublicKey = null;
    try {
      // Try async getPublicKey first
      myPublicKey = await this.app.wallet.getPublicKey();
    } catch (e) {
      // If async fails, try sync (if available)
      try {
        if (this.app.wallet.getPublicKeySync) {
          myPublicKey = this.app.wallet.getPublicKeySync();
        }
      } catch (e2) {
        // ignore
      }
    }

    if (myPublicKey) {
      try {
        const myServices = this.app.network.getServices() || [];
        const myServicesNormalized = myServices.map((s) => {
          const instance = s.instance || s;
          return {
            service: String(instance.service || ''),
            name: String(instance.name || ''),
            domain: String(instance.domain || '')
          };
        });
        const myHostname = this.getHostnameForPublicKey(myPublicKey);
        nodes.push({
          peerIndex: BigInt(0),
          publicKey: myPublicKey,
          hostname: myHostname,
          status: 'local',
          peerType: 'local',
          services: myServicesNormalized,
          lastRttMs: this._rttCache[myPublicKey]?.rtt,
          lastSeenAt: Date.now() // Local node is always "now"
        });
      } catch (e) {
        console.debug('NodeDirectory: unable to get local node info', e);
      }
    }

    // Process remote peers (filtering out clients)
    let clientsFiltered = 0;
    for (let i = 0; i < peers.length; i++) {
      const p = peers[i];
      if (!p) continue;
      // Skip clients
      if (this._isClient(p)) {
        clientsFiltered++;
        continue;
      }
      const node = this._processPeer(p, i);
      if (node) {
        nodes.push(node);
      }
    }
    if (clientsFiltered > 0) {
      console.log(`[NodeDirectory] Filtered out ${clientsFiltered} client(s) (lite/browser), showing only nodes`);
    }

    // Add discovered nodes if requested
    if (includeDiscovered) {
      for (const [publicKey, nodeInfo] of this._discoveredNodes.entries()) {
        // Skip if already in direct peers
        if (!nodes.find(n => n.publicKey === publicKey)) {
          // Ensure connectionUrl is set from hostname if missing
          let connectionUrl = nodeInfo.connectionUrl;
          if (!connectionUrl && nodeInfo.hostname) {
            connectionUrl = `https://${nodeInfo.hostname}`;
          }
          nodes.push({
            ...nodeInfo,
            peerType: 'discovered',
            status: nodeInfo.status || 'unknown',
            connectionUrl: connectionUrl,
            lastSeenAt: nodeInfo.lastSeenAt,
            firstSeenAt: nodeInfo.firstSeenAt || nodeInfo.discoveredAt
          });
        }
      }
    }
    return nodes;
  }

  /**
   * Check if a peer is a client (lite/browser) rather than a node
   */
  _isClient(p) {
    // Check synctype - lite clients have synctype === 'lite'
    if (p.synctype === 'lite') {
      return true;
    }
    // Also check if synctype is missing/undefined and peer has no block_fetch_url (indicates lite client)
    // This is a fallback check
    if (!p.synctype || p.synctype === 'none') {
      // If peer has no services or very few, might be a client
      // But we'll be conservative and only filter if synctype is explicitly 'lite'
      return false;
    }
    return false;
  }

  /**
   * Process a single peer into a node object
   */
  _processPeer(p, i) {
    // Skip clients - only process actual nodes
    if (this._isClient(p)) {
      return null;
    }

    const staticConfigValue = p.static_peer_config;
    const staticConfigType = typeof staticConfigValue;
    const staticConfigKeys = staticConfigValue && typeof staticConfigValue === 'object' 
      ? Object.keys(staticConfigValue) 
      : [];
    let services = [];
    try {
      const rawServices = p.services || [];
      services = rawServices.map((s) => ({
        service: s.service,
        name: s.name,
        domain: s.domain
      }));
    } catch (e) {
      console.debug('NodeDirectory: unable to read services for peer', e);
    }

    const cachedRtt = this._rttCache[p.publicKey];
    const isStaticPeer = this._isStaticPeer(p, staticConfigValue, staticConfigType);
    const hostname = this.getHostnameForPublicKey(p.publicKey);

    // For directly connected peers, lastSeenAt is when they were last seen (now if connected)
    const lastSeenAt = p.status === 'connected' ? Date.now() : (cachedRtt?.timestamp || Date.now());

    // Try to get connection URL from static_peer_config if available
    let connectionUrl = null;
    if (isStaticPeer && staticConfig) {
      try {
        const protocol = staticConfig.protocol === 'https' ? 'https' : 'http';
        const port = staticConfig.port;
        const host = staticConfig.host || (staticConfig.instance?.host);
        if (host) {
          // Only include port if it's not the default
          if ((protocol === 'https' && port !== 443) || (protocol === 'http' && port !== 80)) {
            connectionUrl = `${protocol}://${host}:${port}`;
          } else {
            connectionUrl = `${protocol}://${host}`;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // Use hostname for connection URL if available and no static config URL
    if (!connectionUrl && hostname) {
      // Assume HTTPS for hostnames (most common)
      connectionUrl = `https://${hostname}`;
    }
    return {
      peerIndex: p.peerIndex,
      publicKey: p.publicKey,
      hostname: hostname,
      connectionUrl: connectionUrl,
      status: p.status,
      peerType: isStaticPeer ? 'static' : 'connected', // Direct peers are 'connected', not 'discovered'
      services,
      lastRttMs: cachedRtt?.rtt,
      lastSeenAt: lastSeenAt
    };
  }

  /**
   * Check if a peer is a static peer
   */
  _isStaticPeer(p, staticConfig, staticConfigType) {
    let isStaticPeer = false;

    // Method 1: Check static_peer_config directly
    if (staticConfig) {
      if (typeof staticConfig === 'object') {
        if (staticConfig.host || staticConfig.protocol || staticConfig.port !== undefined) {
          isStaticPeer = true;
        } else if (staticConfig.instance) {
          const instance = staticConfig.instance;
          if (instance && (instance.host || instance.protocol || instance.port !== undefined)) {
            isStaticPeer = true;
          }
        }
      }
    }

    // Method 2: Check if peer has is_static_peer method
    if (!isStaticPeer && typeof p.is_static_peer === 'function') {
      try {
        isStaticPeer = p.is_static_peer();
      } catch (e) {
        console.debug('[NodeDirectory] Error calling is_static_peer:', e);
      }
    }

    // Method 3: Check if there's an isStaticPeer property
    if (!isStaticPeer && p.isStaticPeer !== undefined) {
      isStaticPeer = !!p.isStaticPeer;
    }

    // Method 4: Match by hostname
    if (!isStaticPeer) {
      const hostname = this.getHostnameForPublicKey(p.publicKey);
      if (hostname) {
        const knownStaticHostnames = ['eames.saito.io', 'arthur.saito.io'];
        if (knownStaticHostnames.includes(hostname.toLowerCase())) {
          isStaticPeer = true;
        }
      }
    }

    // Method 4b: Match by known public keys
    if (!isStaticPeer) {
      const knownStaticPublicKeys = [
        'exAsDcmnVC6q4nA2HPp5hcz1twNovkFnErD3V4aixMnw', // eames.saito.io
        'dwvzuT38GcZnN5hovMMEUiM4UXC9Fp3ijcgstrMBNSym', // arthur.saito.io
      ];
      if (knownStaticPublicKeys.includes(p.publicKey)) {
        isStaticPeer = true;
      }
    }

    // Method 5: Check WASM instance directly
    if (!isStaticPeer && p.instance) {
      try {
        if (typeof p.instance.is_static_peer === 'function') {
          isStaticPeer = p.instance.is_static_peer();
        } else if (p.instance.static_peer_config !== undefined) {
          isStaticPeer = p.instance.static_peer_config !== null;
        }
      } catch (e) {
        // ignore
      }
    }
    return isStaticPeer;
  }

  async getAllNodes() {
    try {
      if (!this.app?.network || !this.app.network.getPeers) {
        console.warn('NodeDirectory: app.network.getPeers not available');
        return [];
      }
      const peers = await this.app.network.getPeers();

      console.log('[NodeDirectory] Processing', peers.length, 'direct peers from getPeers()');

      // Process direct peers
      const nodes = await this._processPeers(peers, true); // true = include discovered nodes

      const discoveredNodes = nodes.filter(n => n.peerType === 'discovered');
      const connectedNodes = nodes.filter(n => n.peerType === 'connected');
      console.log('[NodeDirectory] Processed peers summary:', {
        total: nodes.length,
        direct: peers.length,
        networkDiscovered: this._discoveredNodes.size,
        static: nodes.filter(n => n.peerType === 'static').length,
        connected: connectedNodes.length,
        discovered: discoveredNodes.length,
        local: nodes.filter(n => n.peerType === 'local').length
      });

      // Trigger fetching identifiers in background (non-blocking)
      let myPublicKey = null;
      try {
        myPublicKey = await this.app.wallet.getPublicKey();
      } catch (e) {
        // ignore
      }
      this.fetchIdentifiersForPeers(peers, myPublicKey);
      this._peerCache = nodes;
      return nodes;
    } catch (err) {
      console.error('[NodeDirectory] Error in getAllNodes():', err);
      return [];
    }
  }

  async getNodesForApp(slug = '') {
    if (!slug) return [];

    // Normalize slug (trim whitespace, lowercase for comparison)
    slug = slug.trim().toLowerCase();
    // Check both "app:<slug>" convention and direct "<slug>" match
    const targetService1 = `app:${slug}`;
    const targetService2 = slug;

    const nodes = await this.getAllNodes();
    console.log(`[NodeDirectory] getNodesForApp("${slug}") - searching ${nodes.length} nodes`);
    console.log(`[NodeDirectory] Looking for services matching: "${targetService1}" or "${targetService2}"`);

    const matching = nodes.filter((n) => {
      if (!n.services || !Array.isArray(n.services)) return false;
      const hasMatch = n.services.some((s) => {
        if (!s || !s.service) return false;
        const serviceName = String(s.service).toLowerCase().trim();
        return serviceName === targetService1 || serviceName === targetService2;
      });
      if (hasMatch) {
        console.log(`[NodeDirectory] Found matching node: ${n.publicKey?.substring(0, 16)}... with services:`, 
          n.services.map(s => s.service));
      }
      return hasMatch;
    });
    console.log(`[NodeDirectory] getNodesForApp("${slug}") - found ${matching.length} matching nodes`);

    return matching;
  }

  async measureRttToPeer(peerIndex) {
    if (!this.app?.wallet || !this.app?.network) {
      throw new Error('NodeDirectory: wallet or network unavailable');
    }

    const start = Date.now();
    let tx = await this.app.wallet.createUnsignedTransaction();
    tx.msg = {
      module: this.name,
      request: 'node-directory:ping',
      sentAt: start
    };
    await tx.sign();
    return new Promise((resolve, reject) => {
      this.app.network
        .sendTransactionWithCallback(
          tx,
          () => {
            const rtt = Date.now() - start;
            resolve(rtt);
          },
          peerIndex
        )
        .catch((err) => {
          console.error('NodeDirectory: RTT ping failed', err);
          reject(err);
        });
    });
  }

  async getBestNodeForApp(slug = '') {
    const candidates = await this.getNodesForApp(slug);
    if (!candidates.length) {
      return null;
    }

    const measured = [];
    for (let i = 0; i < candidates.length; i++) {
      const node = candidates[i];

      // Skip RTT measurement for local node (always fastest)
      if (node.status === 'local' || node.peerIndex === BigInt(0)) {
        const timestamp = Date.now();
        this._rttCache[node.publicKey] = {
          rtt: 0,
          timestamp
        };
        measured.push({
          ...node,
          lastRttMs: 0,
          lastSeenAt: timestamp
        });
        continue;
      }

      // Skip RTT measurement for discovered nodes without peerIndex (can't measure directly)
      // Use cached RTT if available, otherwise skip
      if (!node.peerIndex || node.peerIndex === null) {
        const cachedRtt = this._rttCache[node.publicKey];
        if (cachedRtt) {
          measured.push({
            ...node,
            lastRttMs: cachedRtt.rtt,
            lastSeenAt: cachedRtt.timestamp
          });
        } else {
          // No cached RTT and no peerIndex - can't measure, but include with undefined RTT
          measured.push({
            ...node,
            lastRttMs: undefined,
            lastSeenAt: Date.now()
          });
        }
        continue;
      }
      try {
        const rtt = await this.measureRttToPeer(node.peerIndex);
        const timestamp = Date.now();

        // Cache RTT measurement by publicKey
        this._rttCache[node.publicKey] = {
          rtt,
          timestamp
        };
        measured.push({
          ...node,
          lastRttMs: rtt,
          lastSeenAt: timestamp
        });
      } catch (e) {
        // If RTT measurement fails, use cached RTT if available
        const cachedRtt = this._rttCache[node.publicKey];
        if (cachedRtt) {
          measured.push({
            ...node,
            lastRttMs: cachedRtt.rtt,
            lastSeenAt: cachedRtt.timestamp
          });
        }
        // Otherwise skip this node
      }
    }
    if (!measured.length) {
      return null;
    }

    measured.sort((a, b) => {
      if (a.lastRttMs === b.lastRttMs) return 0;
      if (a.lastRttMs === undefined) return 1;
      if (b.lastRttMs === undefined) return -1;
      return a.lastRttMs - b.lastRttMs;
    });
    return measured[0];
  }

  /**
   * Discover nodes by querying connected peers for their peer lists
   */
  async discoverNodesFromNetwork() {
    if (this._discoveryInProgress) {
      console.log('[NodeDirectory] Discovery already in progress, skipping...');
      return;
    }
    if (this.app.BROWSER) {
      // Browser clients don't discover nodes
      return;
    }

    this._discoveryInProgress = true;
    this._lastDiscoveryTime = Date.now();
    try {
      const peers = await this.app.network.getPeers();
      const connectedPeers = peers.filter(p => p && p.status === 'connected');

      console.log(`[NodeDirectory] ===== STARTING NETWORK DISCOVERY =====`);
      console.log(`[NodeDirectory] Querying ${connectedPeers.length} connected peer(s) for their peer lists`);

      // Log which peers we're querying
      for (let i = 0; i < connectedPeers.length; i++) {
        const peer = connectedPeers[i];
        const hostname = this.getHostnameForPublicKey(peer.publicKey);
        console.log(`[NodeDirectory]   Peer ${i + 1}/${connectedPeers.length}: peerIndex=${peer.peerIndex}, publicKey=${peer.publicKey?.substring(0, 16)}..., hostname=${hostname || 'none'}, status=${peer.status}`);
      }

      // Track target public key for debugging
      const TARGET_PUBKEY = 'rrjB7pA7xjFMJhCxJsfUhYew2pfYuRDNh96X135d5Ysh'; // nlsaito.net
      console.log(`[NodeDirectory] Looking for target node: ${TARGET_PUBKEY.substring(0, 16)}...`);

      const discoveryPromises = connectedPeers.map(async (peer, peerIdx) => {
        const peerKey = peer.publicKey?.substring(0, 16) || 'unknown';
        console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] Sending peer list request to peerIndex=${peer.peerIndex}, publicKey=${peerKey}...`);

        try {
          return new Promise((resolve) => {
            let responseReceived = false;
            let timeoutId = null;

            const callback = (response) => {
              if (responseReceived) {
                console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] Duplicate callback received, ignoring`);
                return;
              }
              responseReceived = true;
              if (timeoutId) clearTimeout(timeoutId);

              console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] Response received from peerIndex=${peer.peerIndex}:`, {
                hasResponse: !!response,
                hasNodes: !!(response && response.nodes),
                nodeCount: response && response.nodes ? response.nodes.length : 0,
                responseKeys: response ? Object.keys(response) : []
              });
              if (response && response.nodes && Array.isArray(response.nodes)) {
                console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] Received ${response.nodes.length} node(s) from peer`);

                // Check if target node is in this response
                const targetInResponse = response.nodes.some(n => n.publicKey === TARGET_PUBKEY);
                if (targetInResponse) {
                  console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] *** TARGET NODE FOUND IN RESPONSE! ***`);
                  const targetNode = response.nodes.find(n => n.publicKey === TARGET_PUBKEY);
                  console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] Target node details:`, JSON.stringify(targetNode, null, 2));
                }

                // Log all nodes in response
                response.nodes.forEach((node, idx) => {
                  console.log(`[NodeDirectory] [Peer ${peerIdx + 1}]   Node ${idx + 1}: publicKey=${node.publicKey?.substring(0, 16)}..., hostname=${node.hostname || 'none'}, synctype=${node.synctype || 'unknown'}, services=${node.services?.length || 0}`);
                });
                resolve(response.nodes);
              } else {
                console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] Invalid response format:`, response);
                resolve([]);
              }
            };
            this.app.network.sendRequestAsTransaction(
              'node-directory:get-peer-list',
              {},
              callback,
              peer.peerIndex
            );
            // Timeout after 5 seconds
            timeoutId = setTimeout(() => {
              if (!responseReceived) {
                responseReceived = true;
                console.log(`[NodeDirectory] [Peer ${peerIdx + 1}] TIMEOUT: No response from peerIndex=${peer.peerIndex} after 5 seconds`);
                resolve([]);
              }
            }, 5000);
          });
        } catch (e) {
          console.error(`[NodeDirectory] [Peer ${peerIdx + 1}] Exception querying peer ${peerKey}...:`, e);
          return [];
        }
      });
      const results = await Promise.all(discoveryPromises);
      console.log(`[NodeDirectory] All peer queries complete. Received ${results.length} response(s)`);

      let discoveredCount = 0;
      let totalNodesReceived = 0;

      // Aggregate discovered nodes (filtering out clients)
      let discoveredClientsFiltered = 0;
      let skippedOwnNode = 0;
      let skippedAlreadyKnown = 0;
      let skippedNoPublicKey = 0;

      let myPublicKey = null;
      try {
        myPublicKey = await this.app.wallet.getPublicKey();
        console.log(`[NodeDirectory] My public key: ${myPublicKey?.substring(0, 16)}...`);
      } catch (e) {
        console.warn(`[NodeDirectory] Could not get my public key:`, e);
      }

      for (let listIdx = 0; listIdx < results.length; listIdx++) {
        const nodeList = results[listIdx];
        totalNodesReceived += nodeList.length;
        console.log(`[NodeDirectory] Processing node list ${listIdx + 1}/${results.length} with ${nodeList.length} node(s)`);

        for (const nodeInfo of nodeList) {
          if (!nodeInfo.publicKey) {
            skippedNoPublicKey++;
            console.log(`[NodeDirectory]   Skipping node: no publicKey`, nodeInfo);
            continue;
          }

          // Skip our own node
          if (myPublicKey && nodeInfo.publicKey === myPublicKey) {
            skippedOwnNode++;
            console.log(`[NodeDirectory]   Skipping node ${nodeInfo.publicKey.substring(0, 16)}...: own node`);
            continue;
          }

          // Skip if already in direct peers
          const alreadyKnown = peers.some(p => p && p.publicKey === nodeInfo.publicKey);
          if (alreadyKnown) {
            skippedAlreadyKnown++;
            console.log(`[NodeDirectory]   Skipping node ${nodeInfo.publicKey.substring(0, 16)}...: already in direct peers`);
            continue;
          }

          // Skip clients - only store actual nodes
          // Check if synctype indicates it's a client (lite)
          if (nodeInfo.synctype === 'lite' || nodeInfo.synctype === 'none') {
            discoveredClientsFiltered++;
            console.log(`[NodeDirectory]   Skipping node ${nodeInfo.publicKey.substring(0, 16)}...: client (synctype=${nodeInfo.synctype})`);
            continue;
          }

          // Check if this is the target node
          if (nodeInfo.publicKey === TARGET_PUBKEY) {
            console.log(`[NodeDirectory]   *** PROCESSING TARGET NODE ***`);
            console.log(`[NodeDirectory]   Target node info:`, JSON.stringify(nodeInfo, null, 2));
          }
          // Store/update discovered node
          const existing = this._discoveredNodes.get(nodeInfo.publicKey);
          const now = Date.now();

          if (!existing) {
            // New node discovered
            // Try to construct connection URL from hostname
            let connectionUrl = null;

            if (nodeInfo.hostname) {
              connectionUrl = `https://${nodeInfo.hostname}`;
            }

            const newNode = {
              peerIndex: null, // No direct peer index
              publicKey: nodeInfo.publicKey,
              hostname: nodeInfo.hostname || null,
              connectionUrl: connectionUrl,
              status: 'discovered',
              peerType: 'discovered',
              services: nodeInfo.services || [],
              lastSeenAt: now,
              discoveredAt: now,
              firstSeenAt: now
            };
            this._discoveredNodes.set(nodeInfo.publicKey, newNode);
            discoveredCount++;
            if (nodeInfo.publicKey === TARGET_PUBKEY) {
              console.log(`[NodeDirectory]   *** TARGET NODE STORED SUCCESSFULLY ***`);
              console.log(`[NodeDirectory]   Stored node:`, JSON.stringify(newNode, null, 2));
            } else {
              console.log(`[NodeDirectory]   Stored new node: ${nodeInfo.publicKey.substring(0, 16)}..., hostname=${nodeInfo.hostname || 'none'}, services=${nodeInfo.services?.length || 0}`);
            }
          } else {
            // Update existing node - update lastSeenAt and services if changed
            existing.lastSeenAt = now;
            if (nodeInfo.services && nodeInfo.services.length > 0) {
              existing.services = nodeInfo.services;
            }
            if (nodeInfo.hostname && !existing.hostname) {
              existing.hostname = nodeInfo.hostname;
            }
            // Keep firstSeenAt from original discovery
            if (!existing.firstSeenAt) {
              existing.firstSeenAt = existing.discoveredAt || now;
            }
            if (nodeInfo.publicKey === TARGET_PUBKEY) {
              console.log(`[NodeDirectory]   *** TARGET NODE UPDATED ***`);
              console.log(`[NodeDirectory]   Updated node:`, JSON.stringify(existing, null, 2));
            }
          }
        }
      }
      console.log(`[NodeDirectory] ===== DISCOVERY SUMMARY =====`);
      console.log(`[NodeDirectory] Total nodes received: ${totalNodesReceived}`);
      console.log(`[NodeDirectory] Filtered out: ${discoveredClientsFiltered} client(s), ${skippedOwnNode} own node(s), ${skippedAlreadyKnown} already known, ${skippedNoPublicKey} no publicKey`);
      console.log(`[NodeDirectory] New nodes discovered: ${discoveredCount}`);
      console.log(`[NodeDirectory] Total discovered nodes: ${this._discoveredNodes.size}`);
      // Check if target node is in discovered nodes
      const targetDiscovered = this._discoveredNodes.get(TARGET_PUBKEY);
      if (targetDiscovered) {
        console.log(`[NodeDirectory] *** TARGET NODE IS IN DISCOVERED NODES MAP ***`);
        console.log(`[NodeDirectory] Target node in map:`, JSON.stringify(targetDiscovered, null, 2));
      } else {
        console.log(`[NodeDirectory] *** TARGET NODE NOT FOUND IN DISCOVERED NODES MAP ***`);
        console.log(`[NodeDirectory] Current discovered nodes:`, Array.from(this._discoveredNodes.keys()).map(k => k.substring(0, 16) + '...'));
      }
      if (discoveredClientsFiltered > 0) {
        console.log(`[NodeDirectory] Filtered out ${discoveredClientsFiltered} discovered client(s), showing only nodes`);
      }
      console.log(`[NodeDirectory] Discovery complete: found ${discoveredCount} new nodes, total discovered: ${this._discoveredNodes.size}`);
      // Save discovered nodes to storage after discovery
      if (discoveredCount > 0 || this._discoveredNodes.size > 0) {
        await this.saveDiscoveredNodes();
      }
    } catch (e) {
      console.error('[NodeDirectory] Error during network discovery:', e);
    } finally {
      this._discoveryInProgress = false;
    }
  }
  /**
   * Get storage path for discovered nodes
   */
  _getStoragePath() {
    if (this.app.BROWSER) {
      return null; // Browser uses localForage
    }
    // Server-side: save to data directory
    const dataDir = this.app.storage?.data_dir || path.join(__dirname, '../../../data');
    return path.join(dataDir, 'node-directory-discovered-nodes.json');
  }
  /**
   * Load discovered nodes from storage
   */
  async loadDiscoveredNodes() {
    try {
      let loadedNodes = null;
      if (this.app.BROWSER) {
        // Browser: load from localForage
        const stored = await this.app.storage.getLocalForageItem('node-directory-discovered-nodes');
        if (stored) {
          loadedNodes = typeof stored === 'string' ? JSON.parse(stored) : stored;
        }
      } else {
        // Server: load from JSON file
        const storagePath = this._getStoragePath();
        if (storagePath && fs.existsSync(storagePath)) {
          const fileData = fs.readFileSync(storagePath, 'utf8');
          loadedNodes = JSON.parse(fileData);
        }
      }
      if (loadedNodes && Array.isArray(loadedNodes)) {
        // Restore discovered nodes to Map
        for (const node of loadedNodes) {
          if (node.publicKey) {
            // Construct connectionUrl from hostname if not already stored
            let connectionUrl = node.connectionUrl || null;
            if (!connectionUrl && node.hostname) {
              connectionUrl = `https://${node.hostname}`;
            }
            this._discoveredNodes.set(node.publicKey, {
              peerIndex: null,
              publicKey: node.publicKey,
              hostname: node.hostname || null,
              connectionUrl: connectionUrl,
              status: node.status || 'discovered',
              peerType: 'discovered',
              services: node.services || [],
              lastSeenAt: node.lastSeenAt || Date.now(),
              discoveredAt: node.discoveredAt || Date.now(),
              firstSeenAt: node.firstSeenAt || node.discoveredAt || Date.now()
            });
          }
        }
        console.log(`[NodeDirectory] Loaded ${loadedNodes.length} discovered nodes from storage`);
      }
    } catch (e) {
      console.error('[NodeDirectory] Error loading discovered nodes from storage:', e);
    }
  }
  /**
   * Save discovered nodes to storage
   */
  async saveDiscoveredNodes() {
    try {
      // Convert Map to array for storage
      const nodesArray = Array.from(this._discoveredNodes.values());
      if (this.app.BROWSER) {
        // Browser: save to localForage
        await this.app.storage.setLocalForageItem('node-directory-discovered-nodes', nodesArray);
      } else {
        // Server: save to JSON file
        const storagePath = this._getStoragePath();
        if (storagePath) {
          // Ensure directory exists
          const dir = path.dirname(storagePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(storagePath, JSON.stringify(nodesArray, null, 2), 'utf8');
        }
      }
      console.log(`[NodeDirectory] Saved ${nodesArray.length} discovered nodes to storage`);
    } catch (e) {
      console.error('[NodeDirectory] Error saving discovered nodes to storage:', e);
    }
  }
  /**
   * Start periodic network discovery
   */
  startPeriodicDiscovery(intervalMs = 60000) {
    if (this._discoveryInterval) {
      clearInterval(this._discoveryInterval);
    }
    // Initial discovery after 5 seconds
    setTimeout(() => {
      this.discoverNodesFromNetwork();
    }, 5000);
    // Then periodic discovery
    this._discoveryInterval = setInterval(() => {
      this.discoverNodesFromNetwork();
    }, intervalMs);
    console.log(`[NodeDirectory] Started periodic network discovery (every ${intervalMs}ms)`);
  }
  /**
   * Stop periodic network discovery
   */
  stopPeriodicDiscovery() {
    if (this._discoveryInterval) {
      clearInterval(this._discoveryInterval);
      this._discoveryInterval = null;
      console.log('[NodeDirectory] Stopped periodic network discovery');
    }
  }
  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (!tx) return;
    let txmsg = tx.returnMessage();
    if (!txmsg || txmsg.module !== this.name) {
      return;
    }
    if (txmsg.request === 'node-directory:ping') {
      if (typeof mycallback === 'function') {
        mycallback({
          module: this.name,
          request: 'node-directory:pong',
          sentAt: txmsg.sentAt,
          receivedAt: Date.now()
        });
      }
      return;
    }
    // Handle peer list discovery requests
    if (txmsg.request === 'node-directory:get-peer-list') {
      if (typeof mycallback === 'function' && !this.app.BROWSER) {
        console.log(`[NodeDirectory] Received peer list request from peerIndex=${peer?.peerIndex}, publicKey=${peer?.publicKey?.substring(0, 16) || 'unknown'}...`);
        // Return our peer list (excluding discovered nodes to avoid loops)
        const nodes = await this.getAllNodesDirect(); // Get only directly connected peers (clients already filtered)
        console.log(`[NodeDirectory] Returning ${nodes.length} node(s) to requesting peer`);
        nodes.forEach((n, idx) => {
          console.log(`[NodeDirectory]   Node ${idx + 1} to return: publicKey=${n.publicKey?.substring(0, 16)}..., hostname=${n.hostname || 'none'}, status=${n.status}, peerType=${n.peerType}, services=${n.services?.length || 0}`);
        });
        const response = {
          module: this.name,
          request: 'node-directory:peer-list-response',
          nodes: nodes.map(n => ({
            publicKey: n.publicKey,
            hostname: n.hostname,
            status: n.status,
            peerType: n.peerType,
            services: n.services,
            synctype: 'full' // Mark as full node (clients already filtered out)
          }))
        };
        console.log(`[NodeDirectory] Sending response with ${response.nodes.length} node(s)`);
        mycallback(response);
      } else {
        console.log(`[NodeDirectory] Ignoring peer list request: browser=${this.app.BROWSER}, hasCallback=${typeof mycallback === 'function'}`);
      }
      return;
    }
  }
  webServer(app, expressApp, express) {
    const slug = this.returnSlug();
    const webDir = `${__dirname}/web`;
    expressApp.get(`/${encodeURI(slug)}`, async (req, res) => {
      res.type('html').charset = 'UTF-8';
      res.send(nodeDirectoryIndex(app, this));
    });
    // JSON API: get all peers
    expressApp.get(`/${encodeURI(slug)}/api/peers`, async (req, res) => {
      try {
        const nodes = await this.getAllNodes();
        res.json(nodes);
      } catch (err) {
        console.error('node-directory /api/peers error', err);
        res.status(500).json({ error: 'failed_to_list_peers' });
      }
    });
    // JSON API: find best node for app
    expressApp.get(`/${encodeURI(slug)}/api/best-node/:slug`, async (req, res) => {
      try {
        const slug = req.params.slug;
        console.log(`[NodeDirectory] API: /api/best-node/${slug} requested`);
        const best = await this.getBestNodeForApp(slug);
        if (!best) {
          console.log(`[NodeDirectory] API: No best node found for slug "${slug}"`);
          res.status(404).json({ error: 'no_hosting_nodes_found', slug });
        } else {
          console.log(`[NodeDirectory] API: Best node found: ${best.publicKey?.substring(0, 16)}...`);
          res.json(best);
        }
      } catch (err) {
        console.error('node-directory /api/best-node error', err);
        res.status(500).json({ error: 'failed_to_find_best_node', message: err.message });
      }
    });
    // JSON API: trigger RTT measurement for all peers
    expressApp.post(`/${encodeURI(slug)}/api/measure-rtt`, async (req, res) => {
      try {
        await this.measureRttForAllPeers();
        res.json({ success: true });
      } catch (err) {
        console.error('node-directory /api/measure-rtt error', err);
        res.status(500).json({ error: 'failed_to_measure_rtt' });
      }
    });
    // JSON API: trigger network discovery
    expressApp.post(`/${encodeURI(slug)}/api/discover-nodes`, async (req, res) => {
      try {
        await this.discoverNodesFromNetwork();
        res.json({ 
          success: true, 
          discoveredCount: this._discoveredNodes.size,
          lastDiscoveryTime: this._lastDiscoveryTime
        });
      } catch (err) {
        console.error('node-directory /api/discover-nodes error', err);
        res.status(500).json({ error: 'failed_to_discover_nodes', message: err.message });
      }
    });
    // Debug API: inspect raw peer objects
    expressApp.get(`/${encodeURI(slug)}/api/debug/peers`, async (req, res) => {
      try {
        const peers = await this.app.network.getPeers();
        const peerDebugInfo = peers.map((p, i) => {
          if (!p) return { index: i, error: 'null peer' };
          const staticConfig = p.static_peer_config;
          let staticConfigInfo = null;
          if (staticConfig) {
            staticConfigInfo = {
              type: typeof staticConfig,
              value: staticConfig,
              keys: typeof staticConfig === 'object' ? Object.keys(staticConfig) : [],
              host: staticConfig?.host || staticConfig?.instance?.host,
              protocol: staticConfig?.protocol || staticConfig?.instance?.protocol,
              port: staticConfig?.port !== undefined ? staticConfig.port : staticConfig?.instance?.port
            };
          }
          // Check instance properties
          let instanceInfo = null;
          if (p.instance) {
            try {
              instanceInfo = {
                hasInstance: true,
                instanceKeys: Object.keys(p.instance).slice(0, 20), // First 20 keys
                hasIsStaticPeer: typeof p.instance.is_static_peer === 'function',
                hasStaticPeerConfig: p.instance.static_peer_config !== undefined,
                staticPeerConfigValue: p.instance.static_peer_config
              };
              // Try calling is_static_peer if available
              if (typeof p.instance.is_static_peer === 'function') {
                try {
                  instanceInfo.isStaticPeerResult = p.instance.is_static_peer();
                } catch (e) {
                  instanceInfo.isStaticPeerError = e.message;
                }
              }
            } catch (e) {
              instanceInfo = { error: e.message };
            }
          }
          return {
            index: i,
            peerIndex: p.peerIndex?.toString(),
            publicKey: p.publicKey?.substring(0, 16) + '...',
            fullPublicKey: p.publicKey, // Include full key for matching
            status: p.status,
            staticPeerConfig: staticConfigInfo,
            hasStaticConfig: !!staticConfig,
            isStaticPeerMethod: typeof p.is_static_peer === 'function' ? (() => { try { return p.is_static_peer(); } catch(e) { return 'ERROR: ' + e.message; } })() : 'N/A',
            instanceInfo: instanceInfo,
            allPeerKeys: Object.keys(p).slice(0, 30) // First 30 keys on peer object
          };
        });
        res.json({
          totalPeers: peers.length,
          peers: peerDebugInfo
        });
      } catch (err) {
        console.error('node-directory /api/debug/peers error', err);
        res.status(500).json({ error: 'failed_to_inspect_peers', message: err.message });
      }
    });
    // Debug API: search for a specific public key in peers
    expressApp.get(`/${encodeURI(slug)}/api/debug/search-peer/:publicKey`, async (req, res) => {
      try {
        const searchKey = req.params.publicKey;
        const peers = await this.app.network.getPeers();
        const matchingPeers = [];
        for (let i = 0; i < peers.length; i++) {
          const p = peers[i];
          if (!p) continue;
          if (p.publicKey && p.publicKey.includes(searchKey)) {
            matchingPeers.push({
              index: i,
              peerIndex: p.peerIndex?.toString(),
              publicKey: p.publicKey,
              status: p.status,
              services: (p.services || []).map(s => ({
                service: s.service,
                name: s.name,
                domain: s.domain
              }))
            });
          }
        }
        // Also check local node
        try {
          const myPublicKey = await this.app.wallet.getPublicKey();
          if (myPublicKey && myPublicKey.includes(searchKey)) {
            matchingPeers.push({
              index: 'local',
              peerIndex: '0',
              publicKey: myPublicKey,
              status: 'local',
              services: (this.app.network.getServices() || []).map(s => {
                const instance = s.instance || s;
                return {
                  service: String(instance.service || ''),
                  name: String(instance.name || ''),
                  domain: String(instance.domain || '')
                };
              })
            });
          }
        } catch (e) {
          // ignore
        }
        res.json({
          searchKey: searchKey,
          found: matchingPeers.length > 0,
          matches: matchingPeers,
          totalPeers: peers.length,
          allPublicKeys: peers
            .filter(p => p && p.publicKey)
            .map(p => p.publicKey.substring(0, 16) + '...')
        });
      } catch (err) {
        console.error('node-directory /api/debug/search-peer error', err);
        res.status(500).json({ error: 'failed_to_search_peer', message: err.message });
      }
    });
    // Debug API: inspect Registry cache
    expressApp.get(`/${encodeURI(slug)}/api/debug/registry`, async (req, res) => {
      try {
        const registryMod = this.app.modules.returnModule('Registry');
        const debugInfo = {
          registryModuleFound: !!registryMod,
          cachedKeysSize: 0,
          cachedKeys: {},
          sampleKeys: []
        };
        if (registryMod) {
          if (registryMod.cached_keys) {
            debugInfo.cachedKeysSize = Object.keys(registryMod.cached_keys).length;
            debugInfo.cachedKeys = registryMod.cached_keys;
            debugInfo.sampleKeys = Object.keys(registryMod.cached_keys).slice(0, 10).map(k => ({
              publicKey: k.substring(0, 16) + '...',
              identifier: registryMod.cached_keys[k]
            }));
          }
          if (registryMod.respondTo) {
            const registry = registryMod.respondTo('saito-return-key');
            if (registry && registry.returnKeys) {
              debugInfo.registryKeys = registry.returnKeys();
            }
          }
        }
        res.json(debugInfo);
      } catch (err) {
        console.error('node-directory /api/debug/registry error', err);
        res.status(500).json({ error: 'failed_to_inspect_registry', message: err.message });
      }
    });
    expressApp.use(`/${encodeURI(slug)}`, express.static(webDir));
  }
}
module.exports = NodeDirectory;
