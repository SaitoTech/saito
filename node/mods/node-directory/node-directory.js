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
    this._lastAnnouncementTime = 0; // Timestamp of last announcement transaction
    this._announcementInterval = null; // Interval timer for periodic announcements
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
    // Start periodic node announcements (server-side only)
    if (!this.app.BROWSER) {
      this.startPeriodicAnnouncements(300000); // Announce every 5 minutes
      // Also announce immediately on startup
      setTimeout(() => {
        this.broadcastNodeAnnouncement().catch(err => {
          console.error('[NodeDirectory] Error broadcasting initial announcement:', err);
        });
      }, 10000); // Wait 10 seconds for network to be ready
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
   * Return the hostname configured for this node in app.options
   * 
   * Expected structure in options (example):
   * 
   * {
   *   "nodeDirectory": {
   *     "hostname": "mynode.example.com",
   *     "location": "Amsterdam, NL"
   *   }
   * }
   */
  _getConfiguredHostname() {
    try {
      const opts =
        this.app?.options?.nodeDirectory ||
        this.app?.options?.['node-directory'] ||
        this.app?.options?.nodedirectory ||
        null;
      if (opts && typeof opts.hostname === 'string') {
        const trimmed = opts.hostname.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    } catch (e) {
      console.error('[NodeDirectory] Error reading configured hostname from options:', e);
    }
    return null;
  }

  /**
   * Return the (optional) location configured for this node in app.options
   * 
   * Example:
   * {
   *   "nodeDirectory": {
   *     "hostname": "mynode.example.com",
   *     "location": "Amsterdam, NL"
   *   }
   * }
   */
  _getConfiguredLocation() {
    try {
      const opts =
        this.app?.options?.nodeDirectory ||
        this.app?.options?.['node-directory'] ||
        this.app?.options?.nodedirectory ||
        null;
      if (opts && typeof opts.location === 'string') {
        const trimmed = opts.location.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    } catch (e) {
      console.error('[NodeDirectory] Error reading configured location from options:', e);
    }
    return null;
  }

  /**
   * Check if a service has a web frontend by checking if the module has a /web directory
   * @param {string} serviceName - Service name (e.g., "chat", "arcade", or "app:chat")
   * @returns {boolean} - True if the module has a /web directory
   */
  _hasWebFrontend(serviceName) {
    try {
      // Remove "app:" prefix if present
      const moduleSlug = serviceName.startsWith('app:') 
        ? serviceName.substring(4) 
        : serviceName;
      
      // Get the module by slug
      const mod = this.app?.modules?.returnModuleBySlug(moduleSlug);
      if (!mod) {
        return false;
      }
      
      // Check if the module has a /web directory
      const fs = this.app?.storage?.returnFileSystem();
      if (!fs) {
        return false;
      }
      
      // Construct web directory path: mods/<dirname>/web
      const webdir = `${__dirname}/../../mods/${mod.dirname}/web`;
      return fs.existsSync(webdir);
    } catch (e) {
      // Silently fail - if we can't check, assume no web frontend
      return false;
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
   * Look up hostname for a public key
   * 
   * For the local node: returns hostname from NodeDirectory config (app.options.nodeDirectory.hostname)
   * For static peers: hostname comes from static_peer_config.host (handled in _processPeer)
   * For other peers: returns null (hostname must come from node announcements or static config)
   */
  getHostnameForPublicKey(publicKey) {
    if (!publicKey) {
      return null;
    }
    try {
      // For local node, use configured hostname
      try {
        let myPublicKey = null;
        if (this.app.wallet?.getPublicKeySync) {
          myPublicKey = this.app.wallet.getPublicKeySync();
        } else if (this.app.wallet?.returnPublicKey) {
          myPublicKey = this.app.wallet.returnPublicKey();
        }
        if (myPublicKey && publicKey === myPublicKey) {
          const cfgHostname = this._getConfiguredHostname();
          if (cfgHostname) {
            return cfgHostname;
          }
        }
      } catch (e) {
        // ignore
      }
      // For other peers, hostname must come from static peer config or node announcements
      // This method is called from _processPeer which already handles static peer hostnames
      // So we just return null here for non-local peers
      return null;
    } catch (e) {
      console.error('[NodeDirectory] Error looking up hostname for', publicKey.substring(0, 8) + '...', ':', e);
    }
    return null;
  }


  /**
   * Get only directly connected peers (used for peer list responses to avoid loops)
   */
  async getAllNodesDirect() {
    try {
      if (!this.app?.network || !this.app.network.getPeers) {
        console.warn('NodeDirectory: app.network.getPeers not available');
        return [];
      }
      const peers = await this.app.network.getPeers();
      return await this._processPeers(peers, false); // false = don't include discovered nodes
    } catch (err) {
      console.error('[NodeDirectory] Error in getAllNodesDirect():', err);
      return [];
    }
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
        const configuredHostname = this._getConfiguredHostname();
        console.log(`[NodeDirectory] Local node: publicKey=${myPublicKey?.substring(0, 16)}..., configuredHostname=${configuredHostname}, resolvedHostname=${myHostname}`);
        // Add hasWebFrontend to each service
        const myServicesWithWeb = myServicesNormalized.map((s) => ({
          ...s,
          hasWebFrontend: this._hasWebFrontend(s.service)
        }));
        nodes.push({
          peerIndex: BigInt(0),
          publicKey: myPublicKey,
          hostname: myHostname || configuredHostname, // Fallback to direct config lookup
          status: 'local',
          peerType: 'local',
          services: myServicesWithWeb,
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

    // Get local public key for comparison
    let myPublicKey = null;
    try {
      if (this.app.wallet?.getPublicKeySync) {
        myPublicKey = this.app.wallet.getPublicKeySync();
      } else if (this.app.wallet?.returnPublicKey) {
        myPublicKey = this.app.wallet.returnPublicKey();
      }
    } catch (e) {
      // ignore
    }

    // static_peer_config is not exposed through WASM bindings
    // Read from app.options.peers - 1st peer has index 1, so use peerIndex - 1 as array index
    let staticConfigValue = null;
    let staticConfigType = 'undefined';
    let staticConfigKeys = [];
    
    if (this.app.options && this.app.options.peers && Array.isArray(this.app.options.peers)) {
      try {
        const peerIndexNum = p.peerIndex ? Number(p.peerIndex) : null;
        if (peerIndexNum !== null && peerIndexNum > 0) {
          const configIndex = peerIndexNum - 1; // 1st peer (index 1) -> array index 0
          if (configIndex >= 0 && configIndex < this.app.options.peers.length) {
            const peerConfig = this.app.options.peers[configIndex];
            if (peerConfig && peerConfig.host) {
              staticConfigValue = peerConfig;
              staticConfigType = typeof staticConfigValue;
              staticConfigKeys = Object.keys(staticConfigValue);
              console.log(`[NodeDirectory] Found static peer config from app.options.peers[${configIndex}] for peerIndex=${peerIndexNum}, host=${peerConfig.host}`);
            }
          }
        }
      } catch (e) {
        console.debug('[NodeDirectory] Error reading from app.options.peers:', e);
      }
    }
    let services = [];
    try {
      const rawServices = p.services || [];
      // Check if we have announcement data for this peer (which includes hasWebFrontend from the peer's perspective)
      const discoveredNode = this._discoveredNodes.get(p.publicKey);
      const announcementServices = discoveredNode?.services || [];
      
      services = rawServices.map((s) => {
        const serviceName = s.service || '';
        // Try to find matching service in announcement data (which has hasWebFrontend from the peer)
        const announcementService = announcementServices.find(
          as => as.service === serviceName || 
                (serviceName.startsWith('app:') && as.service === serviceName.substring(4)) ||
                (!serviceName.startsWith('app:') && as.service === `app:${serviceName}`)
        );
        // Use hasWebFrontend from announcement if available, otherwise check locally
        const hasWebFrontend = announcementService?.hasWebFrontend !== undefined
          ? announcementService.hasWebFrontend
          : this._hasWebFrontend(serviceName);
        
        return {
          service: serviceName,
          name: s.name,
          domain: s.domain,
          hasWebFrontend: hasWebFrontend
        };
      });
    } catch (e) {
      console.debug('NodeDirectory: unable to read services for peer', e);
    }

    const cachedRtt = this._rttCache[p.publicKey];
    const isStaticPeer = this._isStaticPeer(p, staticConfigValue, staticConfigType);
    
    // Debug: Log peer info
    console.log(`[NodeDirectory] Processing peer ${i}: publicKey=${p.publicKey?.substring(0, 16)}..., isStaticPeer=${isStaticPeer}, hasStaticConfig=${!!staticConfigValue}, staticConfigType=${staticConfigType}`);
    
    // For static peers, prioritize the host field from static_peer_config as the hostname
    // This is the authoritative source for static peers configured in options.peers
    let hostname = null;
    if (isStaticPeer && staticConfigValue) {
      // Try multiple ways to get the host from static config
      let staticHost = null;
      if (typeof staticConfigValue === 'object') {
        staticHost = staticConfigValue.host 
          || staticConfigValue.instance?.host
          || (staticConfigValue.instance && staticConfigValue.instance.host);
        // Also check if it's nested differently
        if (!staticHost && staticConfigValue.instance && typeof staticConfigValue.instance === 'object') {
          staticHost = staticConfigValue.instance.host;
        }
      }
      if (staticHost) {
        hostname = String(staticHost).trim();
        if (hostname) {
          console.log(`[NodeDirectory] Found static peer hostname: ${hostname} for ${p.publicKey?.substring(0, 16)}...`);
        }
      } else {
        console.log(`[NodeDirectory] Static peer detected but no host found. staticConfigValue type: ${typeof staticConfigValue}, keys: ${staticConfigKeys.join(', ')}`);
        if (staticConfigValue && typeof staticConfigValue === 'object') {
          console.log(`[NodeDirectory] staticConfigValue contents:`, JSON.stringify(staticConfigValue, null, 2));
        }
      }
    }
    // For local node, get hostname from config
    if (!hostname && myPublicKey && p.publicKey === myPublicKey) {
      hostname = this._getConfiguredHostname();
      if (hostname) {
        console.log(`[NodeDirectory] Found local node hostname from config: ${hostname}`);
      }
    }
    // Fallback to getHostnameForPublicKey for other peers
    if (!hostname) {
      hostname = this.getHostnameForPublicKey(p.publicKey);
    }

    // For directly connected peers, lastSeenAt is when they were last seen (now if connected)
    const lastSeenAt = p.status === 'connected' ? Date.now() : (cachedRtt?.timestamp || Date.now());

    // Try to get connection URL from static_peer_config if available
    let connectionUrl = null;
    if (isStaticPeer && staticConfigValue) {
      try {
        const protocol = staticConfigValue.protocol === 'https' ? 'https' : 'http';
        const port = staticConfigValue.port;
        const host = staticConfigValue.host || (staticConfigValue.instance?.host);
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
    
    console.log(`[NodeDirectory] _isStaticPeer check: publicKey=${p.publicKey?.substring(0, 16)}..., staticConfig=${!!staticConfig}, staticConfigType=${staticConfigType}`);

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
   * Broadcast node announcement transaction
   * Announces this node's status, services, and location to the network
   */
  async broadcastNodeAnnouncement() {
    if (this.app.BROWSER) {
      return; // Browser clients don't announce
    }
    try {
      const myPublicKey = await this.app.wallet.getPublicKey();
      const myServices = this.app.network.getServices() || [];
      // Prefer explicit NodeDirectory config for hostname instead of Registry
      const myHostname = this._getConfiguredHostname();
      const myLocation = this._getConfiguredLocation();
      // Hostname is mandatory - skip announcement if not available in config
      if (!myHostname) {
        console.warn(
          '[NodeDirectory] Cannot broadcast announcement: hostname not configured in app.options.nodeDirectory.hostname for public key',
          myPublicKey.substring(0, 16) + '...'
        );
        return;
      }
      // Get connection URL
      const connectionUrl = `https://${myHostname}`;
      // Normalize services and add hasWebFrontend flag
      const servicesNormalized = myServices.map((s) => {
        const instance = s.instance || s;
        const serviceName = String(instance.service || '');
        return {
          service: serviceName,
          name: String(instance.name || ''),
          domain: String(instance.domain || ''),
          hasWebFrontend: this._hasWebFrontend(serviceName)
        };
      });
      // Create announcement transaction
      const tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(myPublicKey);
      // Add all connected peers as recipients for broadcast
      const peers = await this.app.network.getPeers();
      const connectedPeers = peers.filter(p => p && p.status === 'connected' && p.publicKey);
      for (const peer of connectedPeers) {
        tx.addTo(peer.publicKey);
      }
      // If no connected peers, add ourselves to ensure transaction is valid
      if (connectedPeers.length === 0) {
        tx.addTo(myPublicKey);
      }
      tx.msg = {
        module: this.name,
        request: 'node-announcement',
        data: {
          publicKey: myPublicKey,
          hostname: myHostname,
          connectionUrl: connectionUrl,
          location: myLocation || null,
          services: servicesNormalized,
          timestamp: Date.now(),
          synctype: 'full' // Mark as full node
        }
      };
      await tx.sign();
      await this.app.network.propagateTransaction(tx);
      this._lastAnnouncementTime = Date.now();
      console.log(`[NodeDirectory] Broadcasted node announcement: hostname=${myHostname || 'none'}, services=${servicesNormalized.length}`);
    } catch (err) {
      console.error('[NodeDirectory] Error broadcasting node announcement:', err);
    }
  }
  /**
   * Start periodic node announcements
   */
  startPeriodicAnnouncements(intervalMs = 300000) {
    if (this._announcementInterval) {
      clearInterval(this._announcementInterval);
    }
    // Announce periodically
    this._announcementInterval = setInterval(() => {
      this.broadcastNodeAnnouncement().catch(err => {
        console.error('[NodeDirectory] Error in periodic announcement:', err);
      });
    }, intervalMs);
    console.log(`[NodeDirectory] Started periodic node announcements (every ${intervalMs}ms)`);
  }
  /**
   * Stop periodic node announcements
   */
  stopPeriodicAnnouncements() {
    if (this._announcementInterval) {
      clearInterval(this._announcementInterval);
      this._announcementInterval = null;
      console.log('[NodeDirectory] Stopped periodic node announcements');
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
  /**
   * Listen for node announcement transactions on the blockchain
   */
  async onConfirmation(blk, tx, conf) {
    if (Number(conf) !== 0) {
      return; // Only process first confirmation
    }
    try {
      const txmsg = tx.returnMessage();
      if (!txmsg || txmsg.module !== this.name) {
        return;
      }
      if (txmsg.request === 'node-announcement' && txmsg.data) {
        const announcement = txmsg.data;
        const publicKey = announcement.publicKey;
        if (!publicKey) {
          return;
        }
        // Hostname is mandatory - skip announcements without hostname
        if (!announcement.hostname) {
          console.debug(`[NodeDirectory] Skipping announcement without hostname from ${publicKey.substring(0, 16)}...`);
          return;
        }
        // Skip our own announcements
        try {
          const myPublicKey = await this.app.wallet.getPublicKey();
          if (publicKey === myPublicKey) {
            return;
          }
        } catch (e) {
          // ignore
        }
        // Skip if already in direct peers
        const peers = await this.app.network.getPeers();
        const alreadyDirectPeer = peers.some(p => p && p.publicKey === publicKey);
        if (alreadyDirectPeer) {
          return; // We already know about direct peers
        }
        // Skip clients
        if (announcement.synctype === 'lite' || announcement.synctype === 'none') {
          return;
        }
        // Store/update discovered node from announcement
        const existing = this._discoveredNodes.get(publicKey);
        const now = Date.now();
        if (!existing) {
          // New node discovered via announcement
          this._discoveredNodes.set(publicKey, {
            peerIndex: null,
            publicKey: publicKey,
            hostname: announcement.hostname, // Mandatory, already validated above
            connectionUrl: announcement.connectionUrl || null,
            location: announcement.location || null,
            status: 'discovered',
            peerType: 'discovered',
            services: announcement.services || [],
            lastSeenAt: now,
            discoveredAt: now,
            firstSeenAt: now
          });
          console.log(`[NodeDirectory] Discovered node via announcement: ${publicKey.substring(0, 16)}..., hostname=${announcement.hostname || 'none'}, services=${announcement.services?.length || 0}`);
          // Save to storage
          await this.saveDiscoveredNodes();
        } else {
          // Update existing node - update lastSeenAt and services
          existing.lastSeenAt = now;
          if (announcement.services && announcement.services.length > 0) {
            existing.services = announcement.services;
          }
          if (announcement.hostname && !existing.hostname) {
            existing.hostname = announcement.hostname;
          }
          if (announcement.connectionUrl && !existing.connectionUrl) {
            existing.connectionUrl = announcement.connectionUrl;
          }
          if (announcement.location && !existing.location) {
            existing.location = announcement.location;
          }
          // Keep firstSeenAt from original discovery
          if (!existing.firstSeenAt) {
            existing.firstSeenAt = existing.discoveredAt || now;
          }
        }
      }
    } catch (err) {
      console.error('[NodeDirectory] Error processing node announcement:', err);
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
        try {
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
        } catch (err) {
          console.error(`[NodeDirectory] Error handling peer list request:`, err);
          // Send empty response on error
          mycallback({
            module: this.name,
            request: 'node-directory:peer-list-response',
            nodes: []
          });
        }
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
    // Debug API: check local node's hostname status
    expressApp.get(`/${encodeURI(slug)}/api/debug/my-hostname`, async (req, res) => {
      try {
        const myPublicKey = await this.app.wallet.getPublicKey();
        const myHostname = this.getHostnameForPublicKey(myPublicKey);
        const configuredHostname = this._getConfiguredHostname();
        res.json({
          publicKey: myPublicKey,
          hostname: myHostname,
          configuredHostname: configuredHostname,
          hasHostname: !!myHostname,
          canAnnounce: !!myHostname,
          message: myHostname 
            ? `Node has hostname: ${myHostname}. Can broadcast announcements.`
            : `Node does NOT have a hostname. Configure app.options.nodeDirectory.hostname in config/options to enable announcements.`
        });
      } catch (err) {
        console.error('node-directory /api/debug/my-hostname error', err);
        res.status(500).json({ error: 'failed_to_check_hostname', message: err.message });
      }
    });
    expressApp.use(`/${encodeURI(slug)}`, express.static(webDir));
  }
}
module.exports = NodeDirectory;
