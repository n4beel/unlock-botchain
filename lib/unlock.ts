import { keccak256, sha256, toHex, hexToBytes, type Address } from "viem";

export type StoredKey = {
  id: string; // offer id
  seller: Address;
  label: string;
  blobHash: `0x${string}`;
  keyHash: `0x${string}`;
  key: `0x${string}`; // 32-byte hex key
  filename?: string;
  createdAt: number;
};

export type DecryptedFile = {
  name: string;
  data: Uint8Array;
};

/**
 * Generate a cryptographically secure 32-byte key for AES-256.
 */
export function generateKey(): Uint8Array {
  const key = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(key);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    const bytes = nodeCrypto.randomBytes(32);
    key.set(bytes);
  }
  return key;
}

/**
 * Compute keccak256 of the 32-byte key, matching contract's keyHashOf.
 */
export function keyHashOf(key: Uint8Array | `0x${string}`): `0x${string}` {
  const hex = typeof key === "string" ? key : toHex(key);
  return keccak256(hex);
}

/**
 * Compute SHA-256 of the encrypted blob bytes, matching the contract's blobHash.
 */
export function blobHashOf(blob: Uint8Array): `0x${string}` {
  return sha256(blob);
}

/**
 * Encrypt a file using AES-256-GCM.
 * Prepends a 12-byte random IV.
 * Plaintext stores a 2-byte filename length prefix + UTF-8 filename + file data.
 */
export async function encryptFile(
  file: { name: string; data: Uint8Array },
  customKey?: Uint8Array
): Promise<{
  blob: Uint8Array;
  key: Uint8Array;
  keyHex: `0x${string}`;
  blobHash: `0x${string}`;
  keyHash: `0x${string}`;
}> {
  const key = customKey || generateKey();
  const keyHex = toHex(key);
  const keyHash = keyHashOf(key);

  const iv = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(iv);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    iv.set(nodeCrypto.randomBytes(12));
  }

  // Encode header: 2 bytes filename length + filename bytes + data
  const filenameBytes = new TextEncoder().encode(file.name);
  if (filenameBytes.length > 65535) {
    throw new Error("Filename exceeds maximum header length");
  }

  const plaintext = new Uint8Array(2 + filenameBytes.length + file.data.length);
  plaintext[0] = (filenameBytes.length >> 8) & 0xff;
  plaintext[1] = filenameBytes.length & 0xff;
  plaintext.set(filenameBytes, 2);
  plaintext.set(file.data, 2 + filenameBytes.length);

  // WebCrypto AES-GCM
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : null;
  let ciphertext: Uint8Array;

  if (subtle) {
    const cryptoKey = await subtle.importKey("raw", key as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
    const encBuffer = await subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, cryptoKey, plaintext as BufferSource);
    ciphertext = new Uint8Array(encBuffer);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(iv));
    const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const tag = cipher.getAuthTag();
    ciphertext = new Uint8Array(Buffer.concat([encrypted, tag]));
  }

  // Prepend 12-byte IV to ciphertext
  const blob = new Uint8Array(iv.length + ciphertext.length);
  blob.set(iv, 0);
  blob.set(ciphertext, iv.length);

  const blobHash = blobHashOf(blob);

  return {
    blob,
    key,
    keyHex,
    blobHash,
    keyHash,
  };
}

/**
 * Decrypt an encrypted .unlock blob using AES-256-GCM.
 * Extracts the 12-byte IV, decrypts, and unpacks original filename and data.
 */
export async function decryptBlob(
  blob: Uint8Array,
  key: Uint8Array | `0x${string}`
): Promise<DecryptedFile> {
  if (blob.length < 12 + 16) {
    throw new Error("Encrypted blob is too small to be valid");
  }

  const keyBytes = typeof key === "string" ? hexToBytes(key) : key;
  const iv = blob.slice(0, 12);
  const ciphertext = blob.slice(12);

  const subtle = typeof crypto !== "undefined" ? crypto.subtle : null;
  let decryptedBytes: Uint8Array;

  if (subtle) {
    const cryptoKey = await subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
    const decBuffer = await subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, cryptoKey, ciphertext as BufferSource);
    decryptedBytes = new Uint8Array(decBuffer);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    const tag = ciphertext.slice(ciphertext.length - 16);
    const dataOnly = ciphertext.slice(0, ciphertext.length - 16);
    const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", Buffer.from(keyBytes), Buffer.from(iv));
    decipher.setAuthTag(Buffer.from(tag));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataOnly)), decipher.final()]);
    decryptedBytes = new Uint8Array(decrypted);
  }

  // Unpack filename and contents
  if (decryptedBytes.length < 2) {
    throw new Error("Decrypted payload is corrupt");
  }

  const filenameLen = (decryptedBytes[0] << 8) | decryptedBytes[1];
  if (decryptedBytes.length < 2 + filenameLen) {
    throw new Error("Corrupt payload header");
  }

  const filename = new TextDecoder().decode(decryptedBytes.slice(2, 2 + filenameLen));
  const fileData = decryptedBytes.slice(2 + filenameLen);

  return {
    name: filename,
    data: fileData,
  };
}

const STORAGE_KEY = "unlock_seller_keys_v1";

/**
 * Local storage manager for seller secret keys and offer receipts.
 */
export const keyStore = {
  isAvailable(): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      const testKey = "__unlock_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  },

  getAll(): StoredKey[] {
    if (!this.isAvailable()) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as StoredKey[];
    } catch {
      return [];
    }
  },

  list(seller?: string): StoredKey[] {
    const all = this.getAll();
    if (!seller) return all;
    const lower = seller.toLowerCase();
    return all.filter((k) => k.seller.toLowerCase() === lower);
  },

  get(id: bigint | number | string, seller?: string): StoredKey | null {
    const idStr = String(id);
    const all = this.getAll();
    if (seller) {
      const lower = seller.toLowerCase();
      return all.find((k) => k.id === idStr && k.seller.toLowerCase() === lower) || null;
    }
    return all.find((k) => k.id === idStr) || null;
  },

  put(record: StoredKey): boolean {
    if (!this.isAvailable()) return false;
    try {
      const all = this.getAll();
      const existingIdx = all.findIndex((k) => k.id === record.id);
      if (existingIdx >= 0) {
        all[existingIdx] = record;
      } else {
        all.push(record);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  },

  exportJson(record: StoredKey): string {
    return JSON.stringify(record, null, 2);
  },

  downloadBackup(record: StoredKey): void {
    if (typeof window === "undefined") return;
    const json = this.exportJson(record);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unlock-key-offer-${record.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  importBackup(jsonString: string): StoredKey | null {
    try {
      const parsed = JSON.parse(jsonString) as StoredKey;
      if (!parsed.id || !parsed.key || !parsed.keyHash) return null;
      this.put(parsed);
      return parsed;
    } catch {
      return null;
    }
  },
};

/**
 * Format remaining countdown seconds.
 */
export function formatRemaining(seconds: number | bigint): string {
  const sec = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (sec <= 0) return "0s";
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${sec % 60}s`;
  return `${sec}s`;
}

/**
 * Get display state of an offer taking time into account.
 */
export function phaseAt(
  offer: { state: number; deadline: bigint },
  currentTime: bigint
): "Open" | "Paid" | "Revealed" | "Refunded" | "Cancelled" | "Late" {
  if (offer.state === 0) return "Open";
  if (offer.state === 1) {
    if (currentTime > offer.deadline) return "Late";
    return "Paid";
  }
  if (offer.state === 2) return "Revealed";
  if (offer.state === 3) return "Refunded";
  if (offer.state === 4) return "Cancelled";
  return "Open";
}
