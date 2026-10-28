"use client";

import { useState, useEffect } from "react";
import { formatEther, type Address } from "viem";
import Button from "@/components/ui/Button";
import { decryptBlob, blobHashOf, keyStore, formatRemaining, type DecryptedFile } from "@/lib/unlock";
import type { OfferDetails } from "./OfferChamber";

interface KeyChamberProps {
  offer: OfferDetails;
  userAddress?: Address;
  nowSec: bigint;
  onBuy: () => Promise<void>;
  onReveal: (keyHex: `0x${string}`) => Promise<void>;
  onRefund: () => Promise<void>;
  onCancel: () => Promise<void>;
  isTxBusy: boolean;
  className?: string;
}

export default function KeyChamber({
  offer,
  userAddress,
  nowSec,
  onBuy,
  onReveal,
  onRefund,
  onCancel,
  isTxBusy,
  className = "",
}: KeyChamberProps) {
  // Key reveal form states
  const [revealKeyInput, setRevealKeyInput] = useState<string>("");
  const [keyInputError, setKeyInputError] = useState<string | null>(null);

  // Decryption panel states
  const [decryptFile, setDecryptFile] = useState<File | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptedResult, setDecryptedResult] = useState<DecryptedFile | null>(null);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  const isSeller = Boolean(userAddress && offer.seller.toLowerCase() === userAddress.toLowerCase());
  const isBuyer = Boolean(userAddress && offer.buyer.toLowerCase() === userAddress.toLowerCase());
  const isPaid = offer.state === 1;
  const isRevealed = offer.state === 2;
  const isRefunded = offer.state === 3;
  const isCancelled = offer.state === 4;
  const isLate = isPaid && nowSec > offer.deadline;
  const remainingSec = offer.deadline > nowSec ? offer.deadline - nowSec : 0n;

  // Auto-fill key if stored in local storage for this seller
  useEffect(() => {
    if (isSeller && isPaid && !revealKeyInput) {
      const stored = keyStore.get(offer.id, userAddress);
      if (stored?.key) {
        setRevealKeyInput(stored.key);
      }
    }
  }, [isSeller, isPaid, offer.id, userAddress, revealKeyInput]);

  const handleKeyImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed.key) {
          setRevealKeyInput(parsed.key);
          setKeyInputError(null);
        } else {
          setKeyInputError("No 'key' found in JSON file");
        }
      } catch {
        setKeyInputError("Invalid JSON backup file");
      }
    };
    reader.readAsText(file);
  };

  const handleRevealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyInputError(null);
    const trimmed = revealKeyInput.trim();
    if (!trimmed.startsWith("0x") || trimmed.length !== 66) {
      setKeyInputError("Key must be a 32-byte hex string (0x followed by 64 hex characters)");
      return;
    }
    await onReveal(trimmed as `0x${string}`);
  };

  const handleDecryptFileChosen = async (file: File) => {
    setDecryptFile(file);
    setDecryptError(null);
    setDecryptedResult(null);
    setIsDecrypting(true);

    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      // Verify blobHash matches
      const computedBlobHash = blobHashOf(uint8);
      if (computedBlobHash.toLowerCase() !== offer.blobHash.toLowerCase()) {
        setDecryptError("This file isn't the one that was sold.");
        setIsDecrypting(false);
        return;
      }

      // Decrypt using revealed key
      const result = await decryptBlob(uint8, offer.key);
      setDecryptedResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Decryption failed";
      setDecryptError(`Decryption failed: ${msg}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  const loadSeededSampleFile = async () => {
    setIsDecrypting(true);
    setDecryptError(null);
    try {
      const res = await fetch("/samples/offer-4.unlock");
      if (!res.ok) throw new Error("Could not load seeded demo sample");
      const buffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      const computedBlobHash = blobHashOf(uint8);
      if (computedBlobHash.toLowerCase() !== offer.blobHash.toLowerCase()) {
        setDecryptError("This file isn't the one that was sold.");
        setIsDecrypting(false);
        return;
      }

      const result = await decryptBlob(uint8, offer.key);
      setDecryptedResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not load demo sample";
      setDecryptError(msg);
    } finally {
      setIsDecrypting(false);
    }
  };

  const downloadDecrypted = () => {
    if (!decryptedResult) return;
    const blob = new Blob([decryptedResult.data as unknown as BlobPart]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = decryptedResult.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`bg-[var(--bg-surface)] border border-[var(--border-default)] p-5 sm:p-6 flex flex-col justify-between ${className}`}
    >
      <div>
        {/* Chamber Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[var(--text-secondary)]" aria-hidden="true" />
            <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Chamber B · The Key
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
            Action Protocol
          </span>
        </div>

        {/* STATE: OPEN */}
        {offer.state === 0 && (
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-[var(--bg-base)] border border-[var(--border-subtle)]">
              <h3 className="text-[14px] font-mono font-semibold text-[var(--text-primary)]">
                Acquire Decryption Key
              </h3>
              <p className="mt-1 text-[12px] font-mono text-[var(--text-secondary)] leading-relaxed">
                Paying exact price locks the escrow. The seller then has{" "}
                <span className="text-[var(--text-primary)] font-semibold">
                  {Number(offer.revealWindow) / 3600} hours
                </span>{" "}
                to reveal the key on chain. If the window closes without a valid reveal, you can claim a full refund.
              </p>
            </div>

            {isSeller ? (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[12px] font-mono text-[var(--warning)]">
                  You are the seller of this offer. Sellers cannot buy their own key.
                </div>
                <Button
                  variant="outline"
                  size="md"
                  className="w-full"
                  busy={isTxBusy}
                  onClick={onCancel}
                >
                  Cancel Listing
                </Button>
              </div>
            ) : userAddress ? (
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  busy={isTxBusy}
                  onClick={onBuy}
                >
                  Pay for the key ({formatEther(offer.price)} BOT)
                </Button>
              </div>
            ) : (
              <div className="p-4 text-center border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[12px] font-mono text-[var(--text-secondary)]">
                Connect your wallet to purchase this key.
              </div>
            )}
          </div>
        )}

        {/* STATE: PAID */}
        {isPaid && (
          <div className="mt-4 space-y-4">
            {isSeller ? (
              /* Seller view in Paid state */
              <div className="space-y-4">
                <div className="p-3 bg-[var(--accent)]/10 border border-[var(--accent)]/40">
                  <div className="text-[12px] font-mono font-bold text-[var(--accent)] uppercase tracking-wider">
                    {isLate ? "Window Closed" : `Reveal key — ${formatRemaining(remainingSec)} left`}
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-[var(--text-secondary)]">
                    Buyer deposited {formatEther(offer.price)} BOT. Submit your 32-byte AES key to release funds to your till.
                  </p>
                </div>

                {!isLate ? (
                  <form onSubmit={handleRevealSubmit} className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)] mb-1">
                        <span>32-Byte Secret Key (0x...)</span>
                        <label className="text-[var(--accent)] cursor-pointer hover:underline">
                          Import JSON
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleKeyImport}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        value={revealKeyInput}
                        onChange={(e) => setRevealKeyInput(e.target.value)}
                        placeholder="0x..."
                        className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-default)] font-mono text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                      {keyInputError && (
                        <div className="mt-1 text-[11px] font-mono text-[var(--danger)]">
                          {keyInputError}
                        </div>
                      )}
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      className="w-full"
                      busy={isTxBusy}
                      disabled={!revealKeyInput.trim()}
                    >
                      Reveal Key on Chain
                    </Button>
                  </form>
                ) : (
                  <div className="p-3 bg-[var(--danger)]/10 border border-[var(--danger)]/40 text-[11px] font-mono text-[var(--danger)]">
                    The reveal window has closed. The buyer can now claim a refund.
                  </div>
                )}
              </div>
            ) : isBuyer ? (
              /* Buyer view in Paid state */
              <div className="space-y-4">
                <div className="p-4 bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-mono uppercase text-[var(--text-secondary)]">
                      Escrow Active
                    </span>
                    <span className="text-[12px] font-mono font-bold text-[var(--text-primary)]">
                      {formatEther(offer.price)} BOT
                    </span>
                  </div>
                  <p className="text-[12px] font-mono text-[var(--text-muted)] leading-relaxed">
                    {isLate
                      ? "The window closed without a key reveal. The seller is late. You can now claim your full refund."
                      : "Waiting for the key. The seller must reveal the matching key before the window closes."}
                  </p>
                </div>

                {isLate ? (
                  <Button
                    variant="danger"
                    size="lg"
                    className="w-full"
                    busy={isTxBusy}
                    onClick={onRefund}
                  >
                    Claim Refund ({formatEther(offer.price)} BOT)
                  </Button>
                ) : (
                  <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-center text-[12px] font-mono text-[var(--warning)]">
                    Seller deadline: {formatRemaining(remainingSec)} remaining
                  </div>
                )}
              </div>
            ) : (
              /* Outsider view */
              <div className="p-4 bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-secondary)]">
                Key pending seller reveal. Reveal window expires in{" "}
                <span className="text-[var(--text-primary)] font-bold">
                  {formatRemaining(remainingSec)}
                </span>
                .
              </div>
            )}
          </div>
        )}

        {/* STATE: REVEALED */}
        {isRevealed && (
          <div className="mt-4 space-y-4">
            <div className="p-3 bg-[var(--success)]/10 border border-[var(--success)]/40">
              <div className="text-[12px] font-mono font-bold text-[var(--success)] uppercase tracking-wider">
                Key Revealed on Chain
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 bg-[var(--bg-base)] p-2 border border-[var(--border-subtle)]">
                <code className="text-[11px] font-mono text-[var(--text-primary)] break-all select-all">
                  {offer.key}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(offer.key);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="text-[10px] font-mono uppercase text-[var(--accent)] hover:underline flex-shrink-0"
                >
                  {copiedKey ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Decrypt Panel */}
            <div className="p-4 bg-[var(--bg-base)] border border-[var(--border-default)] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[12px] font-mono uppercase font-bold text-[var(--text-primary)]">
                  Decrypt .unlock Payload
                </h4>
                <button
                  type="button"
                  onClick={loadSeededSampleFile}
                  disabled={isDecrypting}
                  className="text-[10px] font-mono uppercase text-[var(--accent)] hover:underline"
                >
                  Load Demo File
                </button>
              </div>
              <p className="text-[11px] font-mono text-[var(--text-secondary)]">
                Select your downloaded .unlock file to verify the SHA-256 hash and decrypt the plaintext contents.
              </p>

              <div>
                <input
                  type="file"
                  accept=".unlock,application/octet-stream"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleDecryptFileChosen(f);
                  }}
                  className="w-full text-[11px] font-mono text-[var(--text-muted)] file:mr-3 file:py-1.5 file:px-3 file:border-0 file:bg-[var(--bg-elevated)] file:text-[var(--text-primary)] file:font-mono file:text-[11px] file:uppercase file:cursor-pointer hover:file:bg-[var(--border-default)]"
                />
              </div>

              {isDecrypting && (
                <div className="text-[11px] font-mono text-[var(--accent)]">
                  Verifying SHA-256 hash and decrypting payload...
                </div>
              )}

              {decryptError && (
                <div className="p-2.5 bg-[var(--danger)]/15 border border-[var(--danger)] text-[11px] font-mono text-[var(--danger)] font-semibold">
                  {decryptError}
                </div>
              )}

              {decryptedResult && (
                <div className="p-3 bg-[var(--success)]/10 border border-[var(--success)]/40 space-y-2">
                  <div className="text-[11px] font-mono text-[var(--success)] font-bold uppercase">
                    Decryption Verified
                  </div>
                  <div className="text-[12px] font-mono text-[var(--text-primary)]">
                    File: <span className="font-bold">{decryptedResult.name}</span> (
                    {decryptedResult.data.length} bytes)
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={downloadDecrypted}
                  >
                    Download Decrypted File
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATE: REFUNDED */}
        {isRefunded && (
          <div className="mt-4 p-4 bg-[var(--danger)]/10 border border-[var(--danger)]/40 space-y-2">
            <h4 className="text-[12px] font-mono font-bold text-[var(--danger)] uppercase">
              Offer Refunded
            </h4>
            <p className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed">
              The reveal window expired without a valid key on-chain. Escrowed BOT was credited to the buyer&apos;s till balance.
            </p>
          </div>
        )}

        {/* STATE: CANCELLED */}
        {isCancelled && (
          <div className="mt-4 p-4 bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2">
            <h4 className="text-[12px] font-mono font-bold text-[var(--text-muted)] uppercase">
              Offer Cancelled
            </h4>
            <p className="text-[11px] font-mono text-[var(--text-tertiary)] leading-relaxed">
              This offer was cancelled by the seller prior to any purchase. No funds were exchanged.
            </p>
          </div>
        )}
      </div>

      {/* Seller Warning Footer Note */}
      <div className="mt-6 pt-3 border-t border-[var(--border-subtle)]">
        <p className="text-[10px] font-mono text-[var(--text-tertiary)] leading-relaxed">
          Keep the key backup. Without it you cannot reveal, and the buyer is refunded.
        </p>
      </div>
    </div>
  );
}
