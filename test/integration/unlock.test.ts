import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unlockAbi } from "@/lib/botchain/abi";
import { encryptFile, decryptBlob, generateKey, keyHashOf, blobHashOf } from "@/lib/unlock";

const PORT = 8618;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Seller)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Buyer)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Other Buyer)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Eve (Outsider)
].map((k) => privateKeyToAccount(k as `0x${string}`));

describe("Unlock On-Chain Integration Tests", () => {
  let anvil: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC),
  });

  const [alice, bob, charlie, eve] = ACCOUNTS.map((account) =>
    createWalletClient({
      account,
      chain: localChain,
      transport: http(RPC),
    })
  );

  async function mineBlock() {
    await publicClient.request({
      method: "evm_mine" as any,
      params: [] as any,
    });
  }

  async function advanceTime(seconds: number) {
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [seconds] as any,
    });
    await mineBlock();
  }

  beforeAll(async () => {
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
    } catch {}

    anvil = spawn("anvil", [
      "--port",
      String(PORT),
      "--chain-id",
      String(CHAIN_ID),
      "--silent",
    ]);

    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const artifactPath = join(
      process.cwd(),
      "contracts",
      "out",
      "Unlock.sol",
      "Unlock.json"
    );
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

    const deployHash = await alice.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
    });
    contractAddress = receipt.contractAddress!;
  });

  afterAll(() => {
    if (anvil) {
      anvil.kill();
    }
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
    } catch {}
  });

  it("deploys contract successfully and reads initial state", async () => {
    expect(contractAddress).toBeDefined();
    const count = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "offerCount",
    });
    expect(count).toBe(0n);
  });

  it("completes full happy path: encrypt -> list -> buy -> reveal -> decrypt -> withdraw", async () => {
    // 1. Prepare sample file and encrypt
    const sample = {
      name: "classified-research.pdf",
      data: new TextEncoder().encode("CONFIDENTIAL RESEARCH PROTOCOL v1.0"),
    };
    const encrypted = await encryptFile(sample);

    // 2. Alice lists the offer
    const listTx = await alice.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "list",
      args: [
        encrypted.blobHash,
        encrypted.keyHash,
        parseEther("2.5"),
        3600n, // 1 hour window
        "Classified Research Document",
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: listTx });

    const offer = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "offerOf",
      args: [1n],
    });

    expect(offer.seller.toLowerCase()).toBe(alice.account.address.toLowerCase());
    expect(offer.price).toBe(parseEther("2.5"));
    expect(offer.state).toBe(0); // Open
    expect(offer.blobHash).toBe(encrypted.blobHash);
    expect(offer.keyHash).toBe(encrypted.keyHash);
    expect(offer.label).toBe("Classified Research Document");

    // 3. Alice cannot buy her own offer
    await expect(
      alice.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "buy",
        args: [1n],
        value: parseEther("2.5"),
      })
    ).rejects.toThrow();

    // 4. Bob buying with wrong payment reverts
    await expect(
      bob.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "buy",
        args: [1n],
        value: parseEther("1.0"),
      })
    ).rejects.toThrow();

    // 5. Bob buys with exact payment
    const buyTx = await bob.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "buy",
      args: [1n],
      value: parseEther("2.5"),
    });
    await publicClient.waitForTransactionReceipt({ hash: buyTx });

    const paidOffer = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "offerOf",
      args: [1n],
    });
    expect(paidOffer.state).toBe(1); // Paid
    expect(paidOffer.buyer.toLowerCase()).toBe(bob.account.address.toLowerCase());
    expect(paidOffer.deadline).toBeGreaterThan(0n);

    // 6. Non-seller reveal reverts
    await expect(
      bob.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "reveal",
        args: [1n, encrypted.keyHex],
      })
    ).rejects.toThrow();

    // 7. Wrong key reveal reverts
    const bogusKey = "0x" + "11".repeat(32) as `0x${string}`;
    await expect(
      alice.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "reveal",
        args: [1n, bogusKey],
      })
    ).rejects.toThrow();

    // 8. Alice reveals correct key
    const revealTx = await alice.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "reveal",
      args: [1n, encrypted.keyHex],
    });
    await publicClient.waitForTransactionReceipt({ hash: revealTx });

    const revealedOffer = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "offerOf",
      args: [1n],
    });
    expect(revealedOffer.state).toBe(2); // Revealed
    expect(revealedOffer.key).toBe(encrypted.keyHex);

    // 9. Bob retrieves revealed key and decrypts blob
    const decrypted = await decryptBlob(encrypted.blob, revealedOffer.key);
    expect(decrypted.name).toBe("classified-research.pdf");
    expect(new TextDecoder().decode(decrypted.data)).toBe("CONFIDENTIAL RESEARCH PROTOCOL v1.0");

    // 10. Check Alice's pending balance and withdraw
    const pendingBalance = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "pending",
      args: [alice.account.address],
    });
    expect(pendingBalance).toBe(parseEther("2.5"));

    const balBefore = await publicClient.getBalance({ address: alice.account.address });
    const withdrawTx = await alice.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "withdraw",
    });
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
    const gasUsed = withdrawReceipt.gasUsed * withdrawReceipt.effectiveGasPrice;
    const balAfter = await publicClient.getBalance({ address: alice.account.address });

    expect(balAfter).toBe(balBefore + parseEther("2.5") - gasUsed);

    // Withdrawing again reverts
    await expect(
      alice.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "withdraw",
      })
    ).rejects.toThrow();
  });

  it("handles late refund flow when seller fails to reveal", async () => {
    // 1. Alice lists offer 2
    const key = generateKey();
    const keyHash = keyHashOf(key);
    const blobHash = blobHashOf(new TextEncoder().encode("unrevealed"));

    const listTx = await alice.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "list",
      args: [blobHash, keyHash, parseEther("1.0"), 3600n, "Ephemeral Key"],
    });
    await publicClient.waitForTransactionReceipt({ hash: listTx });

    // 2. Charlie buys offer 2
    const buyTx = await charlie.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "buy",
      args: [2n],
      value: parseEther("1.0"),
    });
    await publicClient.waitForTransactionReceipt({ hash: buyTx });

    // 3. Charlie attempts refund before deadline -> reverts
    await expect(
      charlie.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "refund",
        args: [2n],
      })
    ).rejects.toThrow();

    // 4. Advance time past deadline (3601s)
    await advanceTime(3601);

    // 5. Alice attempts late reveal -> reverts (cannot race buyer's refund)
    await expect(
      alice.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "reveal",
        args: [2n, ("0x" + Buffer.from(key).toString("hex")) as `0x${string}`],
      })
    ).rejects.toThrow();

    // 6. Outsider (Eve) cannot refund Charlie's offer
    await expect(
      eve.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "refund",
        args: [2n],
      })
    ).rejects.toThrow();

    // 7. Charlie claims refund
    const refundTx = await charlie.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "refund",
      args: [2n],
    });
    await publicClient.waitForTransactionReceipt({ hash: refundTx });

    const refundedOffer = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "offerOf",
      args: [2n],
    });
    expect(refundedOffer.state).toBe(3); // Refunded

    const pendingRefund = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "pending",
      args: [charlie.account.address],
    });
    expect(pendingRefund).toBe(parseEther("1.0"));

    // Charlie withdraws refund
    const withdrawTx = await charlie.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "withdraw",
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
  });

  it("handles offer cancellation by seller when Open", async () => {
    // 1. Alice lists offer 3
    const key = generateKey();
    const keyHash = keyHashOf(key);
    const blobHash = blobHashOf(new TextEncoder().encode("cancelled data"));

    const listTx = await alice.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "list",
      args: [blobHash, keyHash, parseEther("0.5"), 7200n, "Offer To Cancel"],
    });
    await publicClient.waitForTransactionReceipt({ hash: listTx });

    // 2. Non-seller cannot cancel
    await expect(
      bob.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "cancel",
        args: [3n],
      })
    ).rejects.toThrow();

    // 3. Alice cancels
    const cancelTx = await alice.writeContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "cancel",
      args: [3n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cancelTx });

    const cancelledOffer = await publicClient.readContract({
      address: contractAddress,
      abi: unlockAbi,
      functionName: "offerOf",
      args: [3n],
    });
    expect(cancelledOffer.state).toBe(4); // Cancelled

    // 4. Bob cannot buy a cancelled offer
    await expect(
      bob.writeContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "buy",
        args: [3n],
        value: parseEther("0.5"),
      })
    ).rejects.toThrow();
  });
});
