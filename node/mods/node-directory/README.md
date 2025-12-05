### NodeDirectory module

**Purpose**

- **Node discovery**: list all peers currently known to the local Saito node and the services they advertise.
- **Service host discovery**: for a given service, find all nodes that host that service (based on `PeerService` entries).
- **Nearest-node routing**: choose the best hosting node for a service by measuring round-trip time (RTT) from the user's browser.

---

### How it works

- The module discovers nodes from two sources:
  1. **Directly connected peers** via `app.network.getPeers()` (which uses the `saito-js` WASM bindings)
  2. **On-chain node-announcement transactions** - nodes broadcast their status, services, hostname, and location as transactions

- Each node is normalized to:

  ```ts
  {
    peerIndex: bigint | null;
    publicKey: string;
    hostname: string | null;
    connectionUrl: string | null;
    location: string | null;
    status: string;
    peerType: 'local' | 'static' | 'connected' | 'discovered';
    services: { 
      service: string; 
      name: string; 
      domain: string;
      hasWebFrontend: boolean;
    }[];
    lastRttMs?: number;  // Server-measured RTT
    lastSeenAt?: number;
  }
  ```

- Apps that want to be discoverable as "hosts" advertise themselves via `PeerService`:

  ```js
  const PeerService = require('saito-js/lib/peer_service').default;

  returnServices() {
    const services = [];
    if (!this.app.BROWSER) {
      services.push(new PeerService(null, `app:${this.slug}`, this.name, this.domain || ''));
    }
    return services;
  }
  ```

- Services with web frontends are automatically detected by checking if the module has a `/web` directory. Only services with web frontends are displayed in the UI.

- The NodeDirectory module:
  - `getAllNodes()` – returns all peers (direct + discovered) and their services.
  - `getNodesForApp(slug)` – filters `getAllNodes()` by `service === 'app:<slug>'` or `service === '<slug>'`.
  - `getBestNodeForApp(slug)` – returns the node with the lowest server-measured RTT (for directly connected peers only).

**RTT Measurement:**

- **Server RTT**: Measured server-to-peer using `sendTransactionWithCallback` with `node-directory:ping`/`node-directory:pong` transactions.
- **User RTT**: Measured from the user's browser to each node's hostname using HTTP requests (image loading technique). This is what the UI uses for "Find Best Node" selection.

---

### Public JS API (from other modules)

Once the module is enabled and loaded:

```js
const dir = app.modules.returnModule('node-directory');

// all known peers (direct + discovered)
const nodes = await dir.getAllNodes();

// peers that host a specific service
const hosts = await dir.getNodesForApp('arcade');

// nearest node hosting the service, based on server-measured RTT
// Note: This only works for directly connected peers (those with peerIndex)
const best = await dir.getBestNodeForApp('arcade');
if (best) {
  console.log('Best host for arcade:', best.peerIndex?.toString(), 'Server RTT:', best.lastRttMs, 'ms');
}
```

**Note**: The web UI's "Find Best Node" feature uses browser-measured RTT (User RTT) instead of the server API, as it provides a better user experience by measuring latency from the user's actual location.

---

### Advertising your node via NodeDirectory

To make your node discoverable (and routable) via `node-directory`, you need to:

1. **Enable the module**
   - Ensure `node-directory` is listed as an enabled module in your node’s module configuration (e.g. `modules.config.js` or equivalent).
   - Restart your node so the module is loaded.

2. **Configure a hostname (required)**

   NodeDirectory reads the hostname from `server.endpoint.host` in your node's configuration (typically persisted as `config/options` on disk).

   ```json
   {
     "server": {
       "endpoint": {
         "host": "mynode.example.com",
         "port": 443,
         "protocol": "https"
       }
     }
   }
   ```

   - **`hostname` (required)**:
     - Must be a DNS name (FQDN) that other users can put into their browser to reach your node (e.g. `usw1.saito.foo`, `use1.saito.foo`).
     - NodeDirectory **will not** broadcast announcements or list your node as connectable if this is missing or empty.
     - Private IP addresses (`127.0.0.1`, `localhost`, `0.0.0.0`, `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`) are automatically excluded.
     - If `server.endpoint.host` is set to a private IP or localhost, NodeDirectory will not use it and announcements will be disabled.

3. **Let NodeDirectory announce your node**

   Once the module is enabled and `hostname` is configured:

   - On startup (after a short delay), and then periodically, the module creates a **`node-announcement` transaction** with:
     - `publicKey`: your node’s public key
     - `hostname`: the configured hostname
     - `connectionUrl`: derived as `https://<hostname>`
     - `location`: the configured location (if any)
     - `services`: the list of `PeerService`s this node advertises (apps like `arcade`, `redsquare`, `relay`, etc.)
   - This transaction is propagated to peers and, once confirmed, other nodes running NodeDirectory will:
     - Record your node as a **discovered full node** (not a client).
     - Update its `lastSeenAt`, services, and `hasWebFrontend` flags from subsequent announcements.
     - Services with `hasWebFrontend: true` are automatically detected by checking if the module has a `/web` directory.

4. **Advertise services from your apps**

   For other nodes to know *what* your node hosts, each app should advertise its services via `PeerService` in its own module:

   ```js
   const PeerService = require('saito-js/lib/peer_service').default;

   returnServices() {
     const services = [];
     if (!this.app.BROWSER) {
       services.push(new PeerService(null, `app:${this.slug}`, this.name, this.domain || ''));
     }
     return services;
   }
   ```

   NodeDirectory will then:

   - Discover those services via `app.network.getPeers()` (for directly connected peers).
   - Automatically detect which services have web frontends by checking for `/web` directories.
   - Include them (with `hasWebFrontend` flags) in the `node-announcement` it sends.
   - Use them when answering "best node for service" queries.

5. **Verify that your node is being advertised**

   - Open the NodeDirectory UI on your node:

     - `http://<your-node-host>/node-directory`

     and confirm that:
     - Your node appears in the table with your configured **hostname**.
     - It lists the expected services (e.g. `arcade`, `relay`, `redsquare`).

   - Use the debug JSON API to inspect your node’s hostname status:

     - `http://<your-node-host>/node-directory/api/debug/my-hostname`

     This endpoint returns:
     - Your public key
     - The resolved hostname (from NodeDirectory config)
     - Whether the node is allowed to announce

---

### Web UI: `/node-directory`

- The module serves a dashboard at `/node-directory`:
  - **Controls**:
    - Service dropdown (populated from available services with web frontends like `arcade`, `redsquare`, `chat`, `node-directory`, etc.).
    - "Find Best Node for Service" button – selects the node with the lowest User RTT (browser-measured).
    - "Refresh All Nodes" button – reloads the table from `getAllNodes()`.
  - **Known Peers table**:
    - **Hostname / Public Key**: Clickable hostname links to `https://<hostname>/explorer`, or public key if no hostname.
    - **Status**: Connection status (local, connected, disconnected, etc.).
    - **Type**: Peer type (local, static, connected, discovered).
    - **Services**: Only services with web frontends are shown. Each service is a clickable link to `https://<hostname>/<service>`.
    - **Server RTT (ms)**: Round-trip time measured server-to-peer.
    - **User RTT (ms)**: Round-trip time measured from your browser to the node.
    - **Last Seen**: When the node was last seen (for discovered nodes) or connection status (for direct peers).

**Best Node Selection:**
- The "Find Best Node for Service" feature uses **User RTT** (browser-measured) to select the fastest node from your location.
- If no User RTT measurements are available yet, it will show an error message asking you to wait a few seconds.

To use it:

1. Ensure the `node-directory` module is included/enabled in your node config.
2. Start the node.
3. Open `http://<your-node-host>/node-directory` in a browser.


