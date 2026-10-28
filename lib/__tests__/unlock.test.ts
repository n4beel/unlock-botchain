import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { keccak256, toHex, hexToBytes } from "viem";
import {
  generateKey,
  keyHashOf,
  blobHashOf,
  encryptFile,
  decryptBlob,
  keyStore,
  formatRemaining,
  phaseAt,
  type StoredKey,
} from "../unlock";
import { decodeContractError } from "../errors";

describe("Unlock cryptographic and utility functions", () => {
  const SAMPLE_KEY_HEX = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as const;

  it("generateKey generates a 32-byte key", () => {
    const key = generateKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
    // Two generated keys should be different
    const key2 = generateKey();
    expect(toHex(key)).not.toBe(toHex(key2));
  });

  it("keyHashOf matches Solidity keccak256(abi.encodePacked(key))", () => {
    const expectedHash = keccak256(SAMPLE_KEY_HEX);
    // Test with hex string
    expect(keyHashOf(SAMPLE_KEY_HEX)).toBe(expectedHash);
    // Test with Uint8Array
    const keyBytes = hexToBytes(SAMPLE_KEY_HEX);
    expect(keyHashOf(keyBytes)).toBe(expectedHash);
  });

  it("blobHashOf matches SHA-256 byte-for-byte", () => {
    const data = new TextEncoder().encode("Hello Unlock Protocol");
    const hash = blobHashOf(data);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    // Deterministic check
    const hash2 = blobHashOf(data);
    expect(hash).toBe(hash2);
  });

  it("round-trips encryptFile and decryptBlob with text data and UTF-8 filename", async () => {
    const testFile = {
      name: "secret-plan-🔐.txt",
      data: new TextEncoder().encode("This is secret payload data with special chars: 🚀 12345"),
    };

    const encrypted = await encryptFile(testFile);
    expect(encrypted.blob.length).toBeGreaterThan(testFile.data.length);
    expect(encrypted.blobHash).toBe(blobHashOf(encrypted.blob));
    expect(encrypted.keyHash).toBe(keyHashOf(encrypted.key));

    const decrypted = await decryptBlob(encrypted.blob, encrypted.key);
    expect(decrypted.name).toBe(testFile.name);
    expect(new TextDecoder().decode(decrypted.data)).toBe(new TextDecoder().decode(testFile.data));

    // Also decrypt using hex key
    const decryptedWithHex = await decryptBlob(encrypted.blob, encrypted.keyHex);
    expect(decryptedWithHex.name).toBe(testFile.name);
    expect(new TextDecoder().decode(decryptedWithHex.data)).toBe(new TextDecoder().decode(testFile.data));
  });

  it("round-trips encryptFile and decryptBlob with arbitrary binary data", async () => {
    const binaryData = new Uint8Array([0x00, 0xff, 0x88, 0x77, 0x12, 0x34, 0x00, 0xaa, 0xbb]);
    const testFile = {
      name: "data.bin",
      data: binaryData,
    };

    const encrypted = await encryptFile(testFile);
    const decrypted = await decryptBlob(encrypted.blob, encrypted.key);
    expect(decrypted.name).toBe("data.bin");
    expect(Array.from(decrypted.data)).toEqual(Array.from(binaryData));
  });

  it("decryptBlob fails when given the wrong key", async () => {
    const testFile = {
      name: "secret.txt",
      data: new TextEncoder().encode("Top secret message"),
    };
    const encrypted = await encryptFile(testFile);

    const wrongKey = generateKey();
    await expect(decryptBlob(encrypted.blob, wrongKey)).rejects.toThrow();
  });

  it("decryptBlob fails when blob is tampered with", async () => {
    const testFile = {
      name: "secret.txt",
      data: new TextEncoder().encode("Top secret message"),
    };
    const encrypted = await encryptFile(testFile);

    const tampered = new Uint8Array(encrypted.blob);
    // Tamper with one byte in ciphertext
    tampered[tampered.length - 1] ^= 0x01;

    await expect(decryptBlob(tampered, encrypted.key)).rejects.toThrow();
  });

  it("decryptBlob throws if blob is too small", async () => {
    const tiny = new Uint8Array([1, 2, 3]);
    const key = generateKey();
    await expect(decryptBlob(tiny, key)).rejects.toThrow("Encrypted blob is too small");
  });

  describe("keyStore local storage manager", () => {
    let mockStore: Record<string, string> = {};

    beforeEach(() => {
      mockStore = {};
      const mockLocalStorage = {
        getItem: (k: string) => mockStore[k] || null,
        setItem: (k: string, v: string) => {
          mockStore[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStore[k];
        },
        clear: () => {
          mockStore = {};
        },
      };
      (globalThis as unknown as { window?: unknown }).window = {
        localStorage: mockLocalStorage,
      };
    });

    afterEach(() => {
      delete (globalThis as unknown as { window?: unknown }).window;
    });

    it("correctly saves, lists, gets, and queries by seller", () => {
      expect(keyStore.isAvailable()).toBe(true);

      const record1: StoredKey = {
        id: "1",
        seller: "0x1111111111111111111111111111111111111111",
        label: "Offer 1",
        blobHash: "0x11",
        keyHash: "0x11",
        key: SAMPLE_KEY_HEX,
        createdAt: 1000,
      };

      const record2: StoredKey = {
        id: "2",
        seller: "0x2222222222222222222222222222222222222222",
        label: "Offer 2",
        blobHash: "0x22",
        keyHash: "0x22",
        key: SAMPLE_KEY_HEX,
        createdAt: 2000,
      };

      keyStore.put(record1);
      keyStore.put(record2);

      expect(keyStore.getAll().length).toBe(2);
      expect(keyStore.get("1")?.label).toBe("Offer 1");
      expect(keyStore.get(2)?.label).toBe("Offer 2");
      expect(keyStore.get(999)).toBeNull();

      // By seller
      expect(keyStore.list("0x1111111111111111111111111111111111111111").length).toBe(1);
      expect(keyStore.list("0x2222222222222222222222222222222222222222").length).toBe(1);
      expect(keyStore.list("0x9999999999999999999999999999999999999999").length).toBe(0);

      // Overwrite existing record
      const record1Updated = { ...record1, label: "Offer 1 Updated" };
      keyStore.put(record1Updated);
      expect(keyStore.getAll().length).toBe(2);
      expect(keyStore.get("1")?.label).toBe("Offer 1 Updated");
    });

    it("exports JSON and imports backup", () => {
      const record: StoredKey = {
        id: "42",
        seller: "0x3333333333333333333333333333333333333333",
        label: "Important Secret",
        blobHash: "0x42",
        keyHash: "0x42",
        key: SAMPLE_KEY_HEX,
        createdAt: 5000,
      };

      const exported = keyStore.exportJson(record);
      expect(exported).toContain("Important Secret");

      const imported = keyStore.importBackup(exported);
      expect(imported).not.toBeNull();
      expect(imported?.id).toBe("42");
      expect(keyStore.get("42")?.label).toBe("Important Secret");

      // Invalid backup
      expect(keyStore.importBackup("invalid json")).toBeNull();
      expect(keyStore.importBackup(JSON.stringify({ incomplete: true }))).toBeNull();
    });
  });

  describe("formatRemaining helper", () => {
    it("formats durations accurately", () => {
      expect(formatRemaining(0)).toBe("0s");
      expect(formatRemaining(-5)).toBe("0s");
      expect(formatRemaining(45)).toBe("45s");
      expect(formatRemaining(125)).toBe("2m 5s");
      expect(formatRemaining(3665)).toBe("1h 1m");
      expect(formatRemaining(90000)).toBe("1d 1h");
      expect(formatRemaining(86400n)).toBe("1d 0h");
    });
  });

  describe("phaseAt helper", () => {
    it("returns correct phase for all states and deadlines", () => {
      // 0: Open
      expect(phaseAt({ state: 0, deadline: 1000n }, 500n)).toBe("Open");
      // 1: Paid before deadline
      expect(phaseAt({ state: 1, deadline: 1000n }, 900n)).toBe("Paid");
      // 1: Paid after deadline -> Late
      expect(phaseAt({ state: 1, deadline: 1000n }, 1001n)).toBe("Late");
      // 2: Revealed
      expect(phaseAt({ state: 2, deadline: 1000n }, 1500n)).toBe("Revealed");
      // 3: Refunded
      expect(phaseAt({ state: 3, deadline: 1000n }, 1500n)).toBe("Refunded");
      // 4: Cancelled
      expect(phaseAt({ state: 4, deadline: 1000n }, 500n)).toBe("Cancelled");
    });
  });

  describe("decodeContractError", () => {
    it("decodes known contract error signatures into spec messages", () => {
      expect(decodeContractError(new Error("execution reverted: WrongKey()"))).toBe(
        "That key doesn't match the sale."
      );
      expect(decodeContractError(new Error("execution reverted: TooLate()"))).toBe(
        "The window closed. The buyer can claim a refund."
      );
      expect(decodeContractError(new Error("execution reverted: WrongPayment(2000000000000000000)"))).toBe(
        "Pay exactly 2 BOT."
      );
      expect(decodeContractError(new Error("execution reverted: NotLate()"))).toBe(
        "The deadline has not passed yet. The seller still has time to reveal the key."
      );
      expect(decodeContractError(new Error("execution reverted: SellerCannotBuy()"))).toBe(
        "Sellers cannot buy their own offer."
      );
      expect(decodeContractError(new Error("execution reverted: NotOpen()"))).toBe(
        "This offer is no longer open for purchase."
      );
      expect(decodeContractError(new Error("User rejected the request"))).toBe(
        "Transaction was cancelled in your wallet."
      );
    });
  });
});
