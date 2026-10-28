import type { Log, Address } from "viem";

export type ListedEvent = {
  id: bigint;
  seller: Address;
  price: bigint;
  revealWindow: bigint;
  blobHash: `0x${string}`;
  keyHash: `0x${string}`;
  label: string;
};

export type BoughtEvent = {
  id: bigint;
  buyer: Address;
  deadline: bigint;
};

export type RevealedEvent = {
  id: bigint;
  key: `0x${string}`;
};

export type RefundedEvent = {
  id: bigint;
};

export type CancelledEvent = {
  id: bigint;
};

export type WithdrawnEvent = {
  to: Address;
  amount: bigint;
};

export function parseListedLog(log: Log): ListedEvent | null {
  try {
    const topics = log.topics;
    if (!topics || topics.length < 3) return null;
    const id = BigInt(topics[1] as string);
    const seller = ("0x" + (topics[2] as string).slice(26)) as Address;
    return {
      id,
      seller,
      price: 0n,
      revealWindow: 0n,
      blobHash: "0x0",
      keyHash: "0x0",
      label: "",
    };
  } catch {
    return null;
  }
}
