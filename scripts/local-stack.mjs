/**
 * Local stack runner and seeder for Unlock (Archetype W · Airlock).
 *
 * Spawns anvil on port 8718 with chain id 968, deploys Unlock, and seeds 6 offers per spec §5:
 * - Offer 1: Open (newest listing, no buyers)
 * - Offer 2: Paid (Bob bought, Alice seller must reveal, 2h left)
 * - Offer 3: Paid and late (Bob bought, deadline passed, refund available)
 * - Offer 4: Revealed (Bob bought, Alice revealed key, decrypt works with seeded sample file)
 * - Offer 5: Refunded (Charlie bought, deadline passed, Charlie refunded)
 * - Offer 6: Cancelled (Alice cancelled before buy)
 *
 * Role table: seller, buyer, other buyer, outsider.
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createCipheriv, randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  sha256,
  toHex,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8718;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Seller)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Buyer)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Other Buyer)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Outsider)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Outsider)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--balance",
    "1000",
    "--silent",
  ],
  { detached: true, stdio: "ignore" }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

for (let i = 0; i < 40; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const [alice, bob, charlie, dave, eve] = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

const artifact = JSON.parse(
  readFileSync("contracts/out/Unlock.sol/Unlock.json", "utf8")
);

console.log("Deploying Unlock contract...");
const deployTx = await alice.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});
const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployTx });
const contractAddress = deployReceipt.contractAddress;

async function advanceTime(seconds) {
  await pub.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await pub.request({
    method: "evm_mine",
    params: [],
  });
}

function encryptPayload(filename, contentBuffer, customKey) {
  const key = customKey || randomBytes(32);
  const iv = randomBytes(12);
  const filenameBytes = Buffer.from(filename, "utf8");

  const header = Buffer.alloc(2);
  header.writeUInt16BE(filenameBytes.length, 0);

  const plaintext = Buffer.concat([header, filenameBytes, contentBuffer]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const blob = Buffer.concat([iv, encrypted, tag]);
  const blobHash = sha256(blob);
  const keyHash = keccak256(toHex(key));

  return {
    key,
    keyHex: toHex(key),
    iv,
    blob,
    blobHash,
    keyHash,
  };
}

console.log("Preparing sample encrypted files...");
mkdirSync("public/samples", { recursive: true });

// Offer 4 sample file
const sample4Csv = `sample_id,depth_m,strata_type,porosity,permeability_md
BH-2026-A1,142.5,Sandstone,0.22,45.8
BH-2026-A2,189.0,Carbonate,0.14,12.3
BH-2026-A3,230.4,Shale,0.06,0.2
BH-2026-A4,312.8,Sandstone,0.28,89.1
`;
const enc4 = encryptPayload("geological-survey-core-samples.csv", Buffer.from(sample4Csv, "utf8"));
writeFileSync("public/samples/offer-4.unlock", enc4.blob);
writeFileSync("public/samples/offer-4-original.csv", sample4Csv);
writeFileSync(
  "public/samples/offer-4-key.json",
  JSON.stringify(
    {
      id: "4",
      seller: alice.account.address,
      label: "Geological Survey Core Samples (Basin 7)",
      blobHash: enc4.blobHash,
      keyHash: enc4.keyHash,
      key: enc4.keyHex,
      filename: "geological-survey-core-samples.csv",
      createdAt: Date.now(),
    },
    null,
    2
  )
);

// Other offer mock blobs
const enc1 = encryptPayload("satellite-ortho-pass-482.tif", Buffer.from("TIFF_MOCK_DATA_482", "utf8"));
const enc2 = encryptPayload("subsea-telemetry-log.bin", Buffer.from("BINARY_TELEMETRY_DATA_CHUNK", "utf8"));
const enc3 = encryptPayload("expired-firmware-patch.bin", Buffer.from("FIRMWARE_PAYLOAD_v2.0", "utf8"));
const enc5 = encryptPayload("refunded-dataset-archive.tar.gz", Buffer.from("TAR_GZ_DUMMY_STREAM", "utf8"));
const enc6 = encryptPayload("cancelled-draft-specs.docx", Buffer.from("DRAFT_SPECIFICATION_DOC", "utf8"));

// Save backup keys for Alice in public/samples
writeFileSync(
  "public/samples/alice-seller-keys.json",
  JSON.stringify(
    [
      {
        id: "1",
        seller: alice.account.address,
        label: "Satellite Imagery Pass #482",
        blobHash: enc1.blobHash,
        keyHash: enc1.keyHash,
        key: enc1.keyHex,
        filename: "satellite-ortho-pass-482.tif",
        createdAt: Date.now(),
      },
      {
        id: "2",
        seller: alice.account.address,
        label: "Subsea Acoustic Telemetry Stream",
        blobHash: enc2.blobHash,
        keyHash: enc2.keyHash,
        key: enc2.keyHex,
        filename: "subsea-telemetry-log.bin",
        createdAt: Date.now(),
      },
      {
        id: "3",
        seller: alice.account.address,
        label: "Firmware Keypair Batch 12",
        blobHash: enc3.blobHash,
        keyHash: enc3.keyHash,
        key: enc3.keyHex,
        filename: "expired-firmware-patch.bin",
        createdAt: Date.now(),
      },
      {
        id: "4",
        seller: alice.account.address,
        label: "Geological Survey Core Samples (Basin 7)",
        blobHash: enc4.blobHash,
        keyHash: enc4.keyHash,
        key: enc4.keyHex,
        filename: "geological-survey-core-samples.csv",
        createdAt: Date.now(),
      },
    ],
    null,
    2
  )
);

console.log("Seeding 6 offers per spec §5...");

// 1. List Offer 1: Open
console.log("- Listing Offer 1: Open");
const tx1 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "list",
  args: [enc1.blobHash, enc1.keyHash, parseEther("2.5"), 86400n, "Satellite Imagery Pass #482"],
});
await pub.waitForTransactionReceipt({ hash: tx1 });

// 2. List Offer 2: Paid (14400s / 4h window)
console.log("- Listing Offer 2: Paid (to be bought with 2h left)");
const tx2 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "list",
  args: [enc2.blobHash, enc2.keyHash, parseEther("1.8"), 14400n, "Subsea Acoustic Telemetry Stream"],
});
await pub.waitForTransactionReceipt({ hash: tx2 });

// 3. List Offer 3: Paid and late (3600s / 1h window)
console.log("- Listing Offer 3: Paid and late");
const tx3 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "list",
  args: [enc3.blobHash, enc3.keyHash, parseEther("0.8"), 3600n, "Firmware Keypair Batch 12"],
});
await pub.waitForTransactionReceipt({ hash: tx3 });

// 4. List Offer 4: Revealed (3600s window)
console.log("- Listing Offer 4: Revealed (working decrypt sample)");
const tx4 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "list",
  args: [enc4.blobHash, enc4.keyHash, parseEther("3.0"), 86400n, "Geological Survey Core Samples (Basin 7)"],
});
await pub.waitForTransactionReceipt({ hash: tx4 });

// 5. List Offer 5: Refunded (3600s window)
console.log("- Listing Offer 5: Refunded");
const tx5 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "list",
  args: [enc5.blobHash, enc5.keyHash, parseEther("1.0"), 3600n, "Telemetry Archive Batch 9"],
});
await pub.waitForTransactionReceipt({ hash: tx5 });

// 6. List Offer 6: Cancelled
console.log("- Listing Offer 6: Cancelled");
const tx6 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "list",
  args: [enc6.blobHash, enc6.keyHash, parseEther("5.0"), 86400n, "Obsolete Sensor Calibration Data"],
});
await pub.waitForTransactionReceipt({ hash: tx6 });

// Cancel Offer 6 immediately while Open
console.log("- Cancelling Offer 6...");
const txCancel6 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "cancel",
  args: [6n],
});
await pub.waitForTransactionReceipt({ hash: txCancel6 });

// Bob buys Offer 4 and Alice reveals the key
console.log("- Bob buys Offer 4 and Alice reveals the key...");
const txBuy4 = await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "buy",
  args: [4n],
  value: parseEther("3.0"),
});
await pub.waitForTransactionReceipt({ hash: txBuy4 });

const txReveal4 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [4n, enc4.keyHex],
});
await pub.waitForTransactionReceipt({ hash: txReveal4 });

// Charlie buys Offer 5 (window 3600s)
console.log("- Charlie buys Offer 5...");
const txBuy5 = await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "buy",
  args: [5n],
  value: parseEther("1.0"),
});
await pub.waitForTransactionReceipt({ hash: txBuy5 });

// Bob buys Offer 3 (window 3600s)
console.log("- Bob buys Offer 3...");
const txBuy3 = await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "buy",
  args: [3n],
  value: parseEther("0.8"),
});
await pub.waitForTransactionReceipt({ hash: txBuy3 });

// Advance time by 3605 seconds so Offer 3 and Offer 5 become late
console.log("- Advancing time by 3605s past Offer 3 and 5 deadlines...");
await advanceTime(3605);

// Charlie refunds Offer 5
console.log("- Charlie claims refund on Offer 5...");
const txRefund5 = await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "refund",
  args: [5n],
});
await pub.waitForTransactionReceipt({ hash: txRefund5 });

// Now Bob buys Offer 2 (window 14400s / 4 hours)
console.log("- Bob buys Offer 2 (4 hour window)...");
const txBuy2 = await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "buy",
  args: [2n],
  value: parseEther("1.8"),
});
await pub.waitForTransactionReceipt({ hash: txBuy2 });

// Advance time by 7200s (2 hours) so Offer 2 has 2h remaining
console.log("- Advancing time by 7200s (2h remaining for Offer 2)...");
await advanceTime(7200);

console.log("\n=======================================================");
console.log("             UNLOCK LOCAL STACK READY                 ");
console.log("=======================================================");
console.log(`Contract: ${contractAddress}`);
console.log(`RPC:      ${RPC}`);
console.log(`Chain ID: ${CHAIN_ID}`);
console.log("-------------------------------------------------------");
console.log("Role Table (Labelled Wallets):");
console.log(`  Seller Alice:   ${alice.account.address}`);
console.log(`  Buyer Bob:      ${bob.account.address}`);
console.log(`  Other Charlie:  ${charlie.account.address}`);
console.log(`  Outsider Dave:  ${dave.account.address}`);
console.log(`  Outsider Eve:   ${eve.account.address}`);
console.log("-------------------------------------------------------");
console.log("Offers Seeded:");
console.log("  Offer 1: Open (Satellite Imagery Pass #482 · 2.5 BOT)");
console.log("  Offer 2: Paid (Bob bought · Alice must reveal · ~2h left)");
console.log("  Offer 3: Paid and Late (Bob bought · deadline passed · refund available)");
console.log("  Offer 4: Revealed (Bob bought · Alice revealed key · decrypt works with sample file)");
console.log("  Offer 5: Refunded (Charlie bought · deadline passed · Charlie refunded)");
console.log("  Offer 6: Cancelled (Alice cancelled while Open)");
console.log("-------------------------------------------------------");
console.log("Seeded Files in public/samples/:");
console.log("  - offer-4.unlock: Encrypted binary blob for Offer 4");
console.log("  - offer-4-original.csv: Plaintext CSV for comparison");
console.log("  - offer-4-key.json: Key backup for Offer 4");
console.log("  - alice-seller-keys.json: Alice's full localStorage key backup");
console.log("=======================================================\n");

const envContent = `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet
NEXT_PUBLIC_BOHR_RPC=${RPC}
NEXT_PUBLIC_CONTRACT_968=${contractAddress}
NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}
NEXT_PUBLIC_DEPLOY_BLOCK_968=1
NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}
NEXT_PUBLIC_RPC_URL=${RPC}
`;
writeFileSync(".env.local", envContent);
console.log("Wrote .env.local with deployed contract address.");
