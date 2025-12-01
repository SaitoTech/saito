### NodeDirectory module

**Purpose**

- **Node discovery**: list all peers currently known to the local Saito node and the services they advertise.
- **App host discovery**: for a given app slug, find all nodes that host that app (based on `PeerService` entries).
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
  - `getNodesForApp(slug)` – filters `getAllNodes()` by `service === 'app:<slug>'`.
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

// peers that host a specific app (by slug)
const hosts = await dir.getNodesForApp('arcade');

// nearest node hosting the app, based on measured RTT
const best = await dir.getBestNodeForApp('arcade');
if (best) {
  console.log('Best host for arcade:', best.peerIndex.toString(), best.lastRttMs);
}
```

Use `best.peerIndex` as the target peer index for `app.network.sendTransactionWithCallback`, `sendRequest`, etc., or `best.domain` if your app exposes an HTTP/WebSocket endpoint there.

---

### Web UI: `/node-directory`

- The module serves a simple dashboard at `/node-directory`:
  - **Controls**:
    - App slug input (`arcade`, `redsquare`, etc.).
    - “Refresh All Nodes” button – reloads the table from `getAllNodes()`.
    - “Find Best Node for App” – calls `getBestNodeForApp(slug)` and displays the result.
  - **Known Peers table**:
    - Peer index, public key, status.
    - All advertised services (`service`, `name`, `domain`).
    - Last measured RTT (ms), when available.

To use it:

1. Ensure the `node-directory` module is included/enabled in your node config.
2. Start the node.
3. Open `http://<your-node-host>/node-directory` in a browser.


