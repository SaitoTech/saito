Longer-chain sync test base scenario.

Purpose:

- Two-node fresh-chain scenario for testing longer-chain recognition and sync.
- Genesis period: 100 blocks.
- Heartbeat / target block-time economics: 5 seconds (`consensus.heartbeat_interval = 5000`).
- Staking disabled for simple block production (`default_social_stake = 0`).

Topology:

- node1: `127.0.0.1:12101`, no peers listed. It is intended to start first and create the fresh genesis chain.
- node2: `127.0.0.2:12102`, lists node1 as a full-sync peer. It is intended to start after node1 has created about 5 blocks, sync to node1, then begin producing blocks.

Intended manual test flow after deployment:

1. Start node1 only and let it create 5 blocks.
2. Start node2 and wait until `/options` shows it is in sync with node1.
3. Let both run until the chain reaches 20 blocks.
4. Stop node1.
5. Let node2 produce 10 more blocks, reaching a longer chain.
6. Stop everything and snapshot/store the resulting scenario state if needed.
7. Later, restart node1 and node2 and verify node1 recognizes/syncs node2's longer chain.

Verification helpers:

- Use `/options` on each node to compare latest block id/hash and peers.
- Use `/balance/` on each node to compare UTXO set / money supply and confirm genesis issuance.

Example endpoints:

```bash
curl -s http://127.0.0.1:12101/options
curl -s http://127.0.0.2:12102/options
curl -s http://127.0.0.1:12101/balance/
curl -s http://127.0.0.2:12102/balance/
```
