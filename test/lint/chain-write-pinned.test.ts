import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as errors from "../../lib/errors";

// describeError in most projects; a few name it decodeContractError.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const describe_ = ((errors as any).describeError ?? (errors as any).decodeContractError) as (e: unknown) => string;

/**
 * Every transaction must be pinned to the network this build runs on.
 *
 * Without a chainId, wagmi sends on whatever network the wallet is on. BOT Chain has two networks and a
 * contract address is the same text on both, so a wallet left on the other one sends a real, gas-costing
 * transaction to an empty address (this happened on the Vouch testnet build, 2026-10-28). lib/useChainWrite.ts
 * wraps wagmi's useWriteContract so every write carries chainId; nothing may import the raw hook.
 */
const ROOTS = ["app", "components", "lib"];
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "node_modules" || n === "__tests__" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

describe("writes are pinned to this build's chain", () => {
  it("no file imports useWriteContract or useSendTransaction from wagmi", () => {
    const bad: string[] = [];
    for (const root of ROOTS)
      for (const f of walk(root)) {
        if (f.endsWith("useChainWrite.ts")) continue;
        const src = readFileSync(f, "utf8");
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']wagmi["']/g))
          if (/\b(useWriteContract|useSendTransaction)\b/.test(m[1])) bad.push(relative(".", f));
      }
    expect(bad).toEqual([]);
  });

  it("every walletClient.writeContract is preceded by assertActiveChain", () => {
    const bad: string[] = [];
    for (const root of ROOTS)
      for (const f of walk(root)) {
        if (f.endsWith("useChainWrite.ts")) continue;
        const src = readFileSync(f, "utf8");
        const writes = (src.match(/\bwalletClient\.writeContract\(/g) ?? []).length;
        const asserts = (src.match(/assertActiveChain\(/g) ?? []).length;
        if (writes > asserts) bad.push(`${relative(".", f)}: ${writes} writes, ${asserts} chain checks`);
      }
    expect(bad).toEqual([]);
  });

  it("no file uses the raw wagmi receipt hook or a bare waitForTransactionReceipt", () => {
    const bad: string[] = [];
    for (const root of ROOTS)
      for (const f of walk(root)) {
        if (f.endsWith("useChainWrite.ts")) continue;
        const src = readFileSync(f, "utf8");
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']wagmi["']/g))
          if (/\buseWaitForTransactionReceipt\b/.test(m[1])) bad.push(`${relative(".", f)}: raw useWaitForTransactionReceipt`);
        if (/\.waitForTransactionReceipt\(/.test(src)) bad.push(`${relative(".", f)}: bare waitForTransactionReceipt (use waitSuccess)`);
      }
    expect(bad).toEqual([]);
  });

  it("the contract and the public client follow the build's network, not the wallet's", () => {
    const bad: string[] = [];
    for (const root of ROOTS)
      for (const f of walk(root)) {
        if (/(NetworkBadge|TxStatus|ConnectButton|BotChainGate|useChainWrite)/.test(f)) continue;
        const src = readFileSync(f, "utf8");
        if (/\busePublicClient\(\s*\)/.test(src)) bad.push(`${relative(".", f)}: usePublicClient()`);
        if (/isBotChainId\(chainId\)\s*\?\s*chainId\s*:\s*968|chainId \?\? activeBotChain\.id/.test(src)) bad.push(`${relative(".", f)}: deployment chosen by wallet chain`);
      }
    expect(bad).toEqual([]);
  });

  it("useChainWrite passes the active chain id on both write functions", () => {
    const src = readFileSync("lib/useChainWrite.ts", "utf8");
    expect(src.match(/chainId: activeBotChain\.id/g)?.length).toBe(2);
  });

  it("a chain mismatch is explained as a sentence", () => {
    const e = new Error("The current chain of the wallet (id: 677) does not match the target chain for the transaction (id: 968).");
    e.name = "ConnectorChainMismatchError";
    expect(describe_(e)).toMatch(/different network/i);
  });
});
