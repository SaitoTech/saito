// @ts-ignore
import * as base58 from "base-58";

export function toBase58(input: string): string {
  return base58.encode(Buffer.from(input, "hex"));
}

export function fromBase58(input: string): string {
  return Buffer.from(base58.decode(input)).toString("hex");
}
