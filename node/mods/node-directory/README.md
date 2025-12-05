### NodeDirectory module

**Purpose**

- **Node discovery**: list all peers currently known to the local Saito node and the services they advertise.
- **Service host discovery**: for a given service, find all nodes that host that service (based on `PeerService` entries).
- **Nearest-node routing**: choose the best hosting node for an app by measuring round-trip time (RTT) from the browser.

---

### How it works

- The module wraps `app.network.getPeers()` (which uses the `saito-js` WASM bindings) and normalizes each peer to:

  ```ts
  {
    peerIndex: bigint;
    publicKey: string;
    status: string;
    services: { service: string; name: string; domain: string }[];
    lastRttMs?: number;
    lastSeenAt?: number;
  }
  ```

- Apps that want to be discoverable as “hosts” advertise themselves via `PeerService`:

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

- The NodeDirectory module:
  - `getAllNodes()` – returns all peers and their services.
  - `getNodesForApp(slug)` – filters `getAllNodes()` by `service === 'app:<slug>'` or `service === '<slug>'`.
  - `getBestNodeForApp(slug)` – for each hosting node, sends a lightweight ping transaction and measures RTT (in ms), then returns the fastest node.

RTT is measured **from the browser** using `sendTransactionWithCallback` and a simple request/response pair:

- Request: `tx.msg = { module: 'node-directory', request: 'node-directory:ping', sentAt: Date.now() }`.
- Server handler replies with `node-directory:pong`, and the browser computes `Date.now() - sentAt`.

---

### Public JS API (from other modules)

Once the module is enabled and loaded:

```js
const dir = app.modules.returnModule('node-directory');

// all known peers
const nodes = await dir.getAllNodes();

// peers that host a specific service
const hosts = await dir.getNodesForApp('arcade');

// nearest node hosting the service, based on measured RTT
const best = await dir.getBestNodeForApp('arcade');
if (best) {
  console.log('Best host for arcade:', best.peerIndex.toString(), best.lastRttMs);
}
```

Use `best.peerIndex` as the target peer index for `app.network.sendTransactionWithCallback`, `sendRequest`, etc., or `best.domain` if your app exposes an HTTP/WebSocket endpoint there.

---

### Advertising your node via NodeDirectory

To make your node discoverable (and routable) via `node-directory`, you need to:

1. **Enable the module**
   - Ensure `node-directory` is listed as an enabled module in your node’s module configuration (e.g. `modules.config.js` or equivalent).
   - Restart your node so the module is loaded.

2. **Configure a hostname (required) and location (optional)**

   In your node’s `app.options` (typically persisted as `config/options` on disk), add a `nodeDirectory` block with at least a `hostname`:

   ```json
   {
     "nodeDirectory": {
       "hostname": "mynode.example.com",
       "location": "Amsterdam, NL"
     }
   }
   ```

   - **`hostname` (required)**:
     - Must be a DNS name (FQDN) that other users can put into their browser to reach your node (e.g. `usw1.saito.foo`, `nlsaito.net`).
     - NodeDirectory **will not** broadcast announcements or list your node as connectable if this is missing or empty.
   - **`location` (optional)**:
     - Free‑form human‑readable text describing where the node is (city/region/datacenter).
     - If set, it is included in the node’s on-chain announcement and stored with discovered node info.

   Internally, NodeDirectory reads:

   - `app.options.nodeDirectory.hostname` / `location` (preferred)
   - or `app.options['node-directory']` / `app.options.nodedirectory` if used instead.

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
     - Update its `lastSeenAt`, services, and location from subsequent announcements.

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
   - Include them in the `node-announcement` it sends.
   - Use them when answering “best node for service” queries.

5. **Verify that your node is being advertised**

   - Open the NodeDirectory UI on your node:

     - `http://<your-node-host>/node-directory`

     and confirm that:
     - Your node appears in the table with your configured **hostname** (and optional **location** if the UI surfaces it).
     - It lists the expected services (e.g. `arcade`, `relay`, `redsquare`).

   - Use the debug JSON API to inspect your node’s hostname status:

     - `http://<your-node-host>/node-directory/api/debug/my-hostname`

     This endpoint returns:
     - Your public key
     - The resolved hostname (from NodeDirectory config)
     - Whether the node is allowed to announce

---

### Web UI: `/node-directory`

- The module serves a simple dashboard at `/node-directory`:
  - **Controls**:
    - Service dropdown (populated from available services like `arcade`, `redsquare`, `relay`, etc.).
    - "Refresh All Nodes" button – reloads the table from `getAllNodes()`.
    - "Find Best Node for Service" – calls `getBestNodeForApp(slug)` and displays the result.
  - **Known Peers table**:
    - Peer index, public key, status.
    - All advertised services (`service`, `name`, `domain`).
    - Last measured RTT (ms), when available.

To use it:

1. Ensure the `node-directory` module is included/enabled in your node config.
2. Start the node.
3. Open `http://<your-node-host>/node-directory` in a browser.


