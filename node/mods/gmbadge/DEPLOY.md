# Running the gm badge issuer on a public Saito node

The browser side of this module works in any wallet that bundles it. The streak index and the
badge minting run on a node. Whoever runs that node is the **issuer**: their wallet key is the
creator on every badge, and wallets verify that key before showing a badge as genuine.

## 1. Node

Ubuntu 24.04, Node 20+, 4 GB RAM, a domain with TLS (NGINX + certbot, websocket + CORS forwarded).

```bash
git clone https://github.com/SaitoTech/saito && cd saito/node
npm install
# add 'gmbadge/gmbadge.js' and 'league/league.js' to BOTH lists in config/modules.config.js
bash scripts/compile nuke
```

## 2. Mainnet peers

In `config/options` set the server endpoint to your public host, and peer to mainnet:

```json
"peers": [
  { "host": "eames.saito.io", "port": 443, "protocol": "https", "synctype": "lite" },
  { "host": "arthur.saito.io", "port": 443, "protocol": "https", "synctype": "lite" }
]
```

## 3. Issuer wallet

The node's own wallet mints badges. Fund it on mainnet with SAITO: **1 SAITO per badge** is locked as
the ATR deposit so the badge pays its own rent forever, plus fees. Back the key up; losing it means
future badges come from a different creator key and will not verify against earlier ones.

```json
"gmbadge": { "mint": true, "deposit_saito": 1, "max_states": 2000 }
```

Set `"mint": false` to run an index-only node (badges show from the index, nothing is minted).

## 4. Start

```bash
npm run dev          # or scripts/prompt-start for production
# https://your.host/gmbadge
```

## 5. What users need

- A wallet that includes this module (a saito.io release that bundles it, or your node's own wallet).
- To say **gm** in Red Square once per UTC day. First gm mints their badge.

## 6. Verifying a badge by hand

```
GET https://your.host/gmbadge/api/streak/<publickey>   -> issuer key, serial, mint tx signature
```

A genuine badge NFT has type `gm`, slip1 creator == issuer key, and a serial in its mint message
that matches the index. Anything else is counterfeit and the wallet card draws it as such.
