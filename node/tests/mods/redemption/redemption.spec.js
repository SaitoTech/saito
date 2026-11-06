const fs = require('fs');
const os = require('os');
const path = require('path');

const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const Database = require('../../../mods/redemption/lib/database');
const {
  blocksSince,
  parseRedemptionTerms,
  transactionSignatureStatus,
  evaluateRedemption,
  defaultBlocksRequired
} = require('../../../mods/redemption/lib/transactions');

const SERVER = 'SERVERPUBLICKEY';
const TERMS = {
  ticker: 'ETH',
  amount: '1000000000000000000',
  server_publickey: SERVER,
  blocks_required: '10',
  collateral_id: 'deposit-1'
};

function eligibleInput(overrides = {}) {
  return {
    nft_type: 'redemption-nft',
    terms: TERMS,
    processing_server: SERVER,
    signature: { ok: true },
    spendable: true,
    on_longest_chain: true,
    tip_block_id: 100,
    custody_block_id: 90,
    ...overrides
  };
}

describe('redemption claims', () => {
  test('terms keep amount as an integer string', () => {
    const parsed = parseRedemptionTerms({
      data: {
        ticker: ' usdt ',
        amount: '00042',
        server_publickey: SERVER,
        blocks_required: 10,
        collateral_id: ' deposit-1 '
      }
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.terms.ticker).toBe('USDT');
    expect(parsed.terms.amount).toBe('42');
    expect(parsed.terms.blocks_required).toBe('10');
    expect(parsed.terms.collateral_id).toBe('deposit-1');
    expect(parseRedemptionTerms({ data: { ...TERMS, amount: '1.5' } }).ok).toBe(false);
    expect(parseRedemptionTerms({ data: { ...TERMS, blocks_required: -1 } }).ok).toBe(false);
    expect(parseRedemptionTerms({ data: { ...TERMS, collateral_id: '' } }).reason).toBe(
      'invalid-collateral-id'
    );
  });

  test('maturity uses block height and the claim delay', () => {
    expect(blocksSince(100, 90)).toBe(10n);
    expect(blocksSince(99, 90)).toBe(9n);
    expect(blocksSince(90, 100)).toBe(null);

    const mature = evaluateRedemption(eligibleInput());
    expect(mature.eligible).toBe(true);
    expect(mature.remaining_blocks).toBe('0');

    const early = evaluateRedemption(eligibleInput({ tip_block_id: 99, custody_block_id: 90 }));
    expect(early.status).toBe('immature');
    expect(early.remaining_blocks).toBe('1');
    expect(early.eligible).toBe(false);

    const unknown = evaluateRedemption(eligibleInput({ tip_block_id: null }));
    expect(unknown.status).toBe('unavailable');
    expect(unknown.remaining_blocks).toBe(null);
  });

  test('a wallet entry is not redeemable without the chain and server checks', () => {
    expect(evaluateRedemption(eligibleInput({ nft_type: 'vault-nft-key' })).reasons).toContain(
      'unexpected-type'
    );
    expect(evaluateRedemption(eligibleInput({ processing_server: 'OTHER' })).reasons).toContain(
      'server-mismatch'
    );
    expect(evaluateRedemption(eligibleInput({ spendable: false })).reasons).toContain('not-spendable');
    expect(evaluateRedemption(eligibleInput({ on_longest_chain: false })).reasons).toContain(
      'not-on-longest-chain'
    );
    expect(evaluateRedemption(eligibleInput({ existing_status: 'pending' })).status).toBe('pending');
    expect(evaluateRedemption(eligibleInput({ existing_status: 'processed' })).status).toBe('redeemed');
  });

  test('transaction signature verification is not fabricated', () => {
    const missing = transactionSignatureStatus({
      signature: 'abcd',
      generateHashForSignature() {},
      getHashForSignature() {
        return new Uint8Array();
      }
    });
    expect(missing).toEqual({ ok: false, reason: 'signature-preimage-unavailable' });
    expect(evaluateRedemption(eligibleInput({ signature: missing })).status).toBe('unverified');
  });

  test('default issuance delay is the current genesis window', async () => {
    await expect(defaultBlocksRequired({})).resolves.toBe(null);
    await expect(
      defaultBlocksRequired({
        blockchain: {
          instance: {
            async get_last_block_id() {
              return 250n;
            },
            async get_genesis_block_id() {
              return 150n;
            }
          }
        }
      })
    ).resolves.toBe('100');
  });

  test('pending redemption rows are unique and rejected rows can be retried', async () => {
    const file = path.join(os.tmpdir(), `redemption-${Date.now()}-${Math.random().toString(16).slice(2)}.sq3`);
    const sqlite = await open({ filename: file, driver: sqlite3.Database });
    const database = new Database(
      {
        storage: {
          returnFileSystem: () => fs,
          returnDatabaseByName: async () => sqlite
        }
      },
      { dbname: 'redemption' }
    );

    const row = {
      nft_id: 'nft-1',
      custody_utxo: 'utxo',
      requester: 'alice',
      ticker: 'ETH',
      amount: '42',
      withdrawal_address: '0xabc'
    };

    const first = await database.recordPending(row);
    const second = await database.recordPending(row);
    expect(first.result).toBe('pending');
    expect(second.result).toBe('duplicate');
    expect(second.status).toBe('pending');

    await sqlite.run(`DELETE FROM redemption_requests WHERE nft_id = $nft_id`, { $nft_id: 'nft-1' });
    await database.recordTerminal({ ...row, reason: 'not-spendable' }, 'rejected');
    await expect(database.recordPending(row)).resolves.toMatchObject({ result: 'pending' });

    await sqlite.close();
    fs.unlinkSync(file);
  });
});
