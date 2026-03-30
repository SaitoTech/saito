import assert from "node:assert/strict";

import Factory from "../lib/factory";
import Hop from "../lib/hop";
import Slip from "../lib/slip";
import Transaction, { TransactionType } from "../lib/transaction";
import Wallet, { DefaultEmptyPrivateKey, DefaultEmptyPublicKey } from "../lib/wallet";

class FakeWasmSlip {
  public static parse_slip_from_utxokey(_utxoKey: string): FakeWasmSlip | undefined {
    return undefined;
  }

  public slip_type = 0;
  public amount = BigInt(0);
  public public_key = DefaultEmptyPublicKey;
  public slip_index = 0;
  public block_id = BigInt(0);
  public tx_ordinal = BigInt(0);
  public utxo_key = "";
}

class FakeWasmHop {
  public from = "from-key";
  public to = "to-key";
  public sig = "hop-sig";
}

class FakeWasmTransaction {
  public static deserialize(buffer: Uint8Array): FakeWasmTransaction {
    const tx = new FakeWasmTransaction();
    tx.data = buffer;
    return tx;
  }

  public to: FakeWasmSlip[] = [];
  public from: FakeWasmSlip[] = [];
  public routing_path: FakeWasmHop[] = [];
  public type = TransactionType.Normal;
  public timestamp = BigInt(0);
  public signature = "";
  public data = new Uint8Array();
  public txs_replacements = 0;
  public total_fees = BigInt(0);

  public add_from_slip(slip: FakeWasmSlip): void {
    this.from.push(slip);
  }

  public add_to_slip(slip: FakeWasmSlip): void {
    this.to.push(slip);
  }

  public sign(): string {
    this.signature = "signed";
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

class FakeWasmWallet {
  public publicKey = DefaultEmptyPublicKey;
  public privateKey = DefaultEmptyPrivateKey;

  public async save(): Promise<void> {}
  public async load(): Promise<void> {}
  public async reset(_keepKeys: boolean): Promise<void> {}
  public async get_public_key(): Promise<string> {
    return this.publicKey;
  }
  public async set_public_key(key: string): Promise<void> {
    this.publicKey = key;
  }
  public async get_private_key(): Promise<string> {
    return this.privateKey;
  }
  public async set_private_key(key: string): Promise<void> {
    this.privateKey = key;
  }
  public async get_balance(): Promise<bigint> {
    return BigInt(0);
  }
  public async get_pending_txs(): Promise<never[]> {
    return [];
  }
  public async get_slips(): Promise<never[]> {
    return [];
  }
  public async add_slip(_slip: unknown): Promise<void> {}
  public async get_key_list(): Promise<string[]> {
    return [];
  }
  public async set_key_list(_keyList: string[]): Promise<void> {}
  public async add_to_pending(_tx: unknown): Promise<void> {}
  public async add_nft(): Promise<void> {}
}

describe("saito-js wrappers", function () {
  beforeEach(function () {
    Transaction.Type = FakeWasmTransaction;
    Slip.Type = FakeWasmSlip;
    Hop.Type = FakeWasmHop;
    Wallet.Type = FakeWasmWallet;
  });

  it("packs and unpacks normal transaction message data", function () {
    const tx = new Transaction();
    tx.msg = { memo: "hello", amount: 22 };

    tx.packData();
    tx.unpackData();

    assert.deepEqual(tx.msg, { memo: "hello", amount: 22 });
    assert.equal(Buffer.from(tx.data).toString("utf-8"), '{"memo":"hello","amount":22}');
  });

  it("clears unpacked message data for non-normal transaction types", function () {
    const tx = new Transaction();
    tx.type = TransactionType.Fee;
    tx.data = new Uint8Array(Buffer.from('{"memo":"ignored"}', "utf-8"));

    tx.unpackData();

    assert.deepEqual(tx.msg, {});
  });

  it("preserves the default empty public key sentinel in slips", function () {
    const slip = new Slip();

    slip.publicKey = "";

    assert.equal(slip.wasmSlip.public_key, DefaultEmptyPublicKey);
    assert.equal(slip.publicKey, "");
  });

  it("maps wallet empty keys to an ergonomic empty string", async function () {
    const wallet = new Wallet(new FakeWasmWallet() as never);

    assert.equal(await wallet.getPublicKey(), "");
    assert.equal(await wallet.getPrivateKey(), "");

    await wallet.setPublicKey("");
    await wallet.setPrivateKey("");

    const wasmWallet = wallet.instance as unknown as FakeWasmWallet;

    assert.equal(wasmWallet.publicKey, DefaultEmptyPublicKey);
    assert.equal(wasmWallet.privateKey, DefaultEmptyPrivateKey);
  });

  it("uses the configured wrapper constructors in the factory", function () {
    const factory = new Factory();

    const tx = factory.createTransaction();
    const slip = factory.createSlip();
    const path = factory.createRoutingPath();

    assert.ok(tx instanceof Transaction);
    assert.ok(slip instanceof Slip);
    assert.ok(path instanceof Hop);
    assert.equal(path.toJson().sig, "hop-sig");
  });
});
