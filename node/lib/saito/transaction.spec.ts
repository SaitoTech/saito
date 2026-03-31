import Saito from 'saito-js/saito';
import BaseSlip, { SlipType } from 'saito-js/lib/slip';
import BaseTransaction, { TransactionType } from 'saito-js/lib/transaction';
import Slip from './slip';
import Transaction from './transaction';

class FakeWasmSlip {
  public static parse_slip_from_utxokey(_utxoKey: string): FakeWasmSlip | undefined {
    return undefined;
  }

  public slip_type = SlipType.Normal;
  public amount = BigInt(0);
  public public_key = '';
  public slip_index = 0;
  public block_id = BigInt(0);
  public tx_ordinal = BigInt(0);
  public utxo_key = '';
}

class FakeWasmTransaction {
  public static deserialize(buffer: Uint8Array): FakeWasmTransaction {
    const tx = new FakeWasmTransaction();
    tx.data = buffer;
    return tx;
  }

  public to: FakeWasmSlip[] = [];
  public from: FakeWasmSlip[] = [];
  public routing_path: never[] = [];
  public type = TransactionType.Normal;
  public timestamp = BigInt(0);
  public signature = '';
  public data = new Uint8Array();
  public txs_replacements = 1;
  public total_fees = BigInt(0);

  public add_from_slip(slip: FakeWasmSlip): void {
    this.from.push(slip);
  }

  public add_to_slip(slip: FakeWasmSlip): void {
    this.to.push(slip);
  }

  public sign(): string {
    this.signature = 'signed';
    return this.signature;
  }

  public is_from(key: string): boolean {
    return this.from.some((slip) => slip.public_key === key);
  }

  public is_to(key: string): boolean {
    return this.to.some((slip) => slip.public_key === key);
  }

  public serialize(): Uint8Array {
    return this.data;
  }

  public generate_hash_for_signature(): void {}

  public get_hash_for_signature(): Uint8Array {
    return new Uint8Array([1, 2, 3]);
  }
}

describe('Transaction', () => {
  beforeEach(() => {
    BaseTransaction.Type = FakeWasmTransaction;
    BaseSlip.Type = FakeWasmSlip;
    Transaction.Type = FakeWasmTransaction;
    Slip.Type = FakeWasmSlip;
    (Saito as any).instance = {
      factory: {
        createSlip(data?: any) {
          return new Slip(data);
        }
      }
    };
  });

  test('constructs from JSON using current field names', () => {
    const message = { module: 'chat', request: 'send-message', text: 'hello' };

    const tx = new Transaction(undefined, {
      from: [
        {
          publicKey: 'from-public-key',
          amount: '25',
          type: SlipType.Normal,
          index: 2,
          blockId: '11',
          txOrdinal: '3'
        }
      ],
      to: [
        {
          publicKey: 'to-public-key',
          amount: '20',
          type: SlipType.ATR,
          index: 5,
          blockId: '12',
          txOrdinal: '4'
        }
      ],
      timestamp: 1234567890,
      signature: 'sig-123',
      txs_replacements: 2,
      type: TransactionType.Normal,
      buffer: Buffer.from(JSON.stringify(message), 'utf-8').toString('base64')
    });

    expect(tx.timestamp).toBe(1234567890);
    expect(tx.signature).toBe('sig-123');
    expect(tx.txs_replacements).toBe(2);
    expect(tx.type).toBe(TransactionType.Normal);

    expect(tx.from).toHaveLength(1);
    expect(tx.to).toHaveLength(1);

    expect(tx.from[0].publicKey).toBe('from-public-key');
    expect(tx.from[0].amount).toBe(BigInt(25));
    expect(tx.from[0].type).toBe(SlipType.Normal);
    expect(tx.from[0].index).toBe(2);
    expect(tx.from[0].blockId).toBe(BigInt(11));
    expect(tx.from[0].txOrdinal).toBe(BigInt(3));

    expect(tx.to[0].publicKey).toBe('to-public-key');
    expect(tx.to[0].amount).toBe(BigInt(20));
    expect(tx.to[0].type).toBe(SlipType.ATR);
    expect(tx.to[0].index).toBe(5);
    expect(tx.to[0].blockId).toBe(BigInt(12));
    expect(tx.to[0].txOrdinal).toBe(BigInt(4));

    expect(tx.returnMessage()).toEqual(message);
  });

  test('addTo and addFrom do not create duplicate slips', () => {
    const tx = new Transaction();

    tx.addTo('alice');
    tx.addTo('alice');
    tx.addFrom('bob');
    tx.addFrom('bob');

    expect(tx.to).toHaveLength(1);
    expect(tx.from).toHaveLength(1);
    expect(tx.to[0].publicKey).toBe('alice');
    expect(tx.from[0].publicKey).toBe('bob');
    expect(tx.to[0].amount).toBe(BigInt(0));
  });

  test('returnMessage falls back to an empty object for empty data', () => {
    const tx = new Transaction();
    tx.data = new Uint8Array();

    expect(tx.returnMessage()).toEqual({});
  });
});
