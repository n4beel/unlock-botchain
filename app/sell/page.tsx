"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";
import { WINDOW_PRESETS, MIN_WINDOW, MAX_WINDOW, MAX_LABEL } from "@/lib/limits";
import { encryptFile, keyStore, type StoredKey } from "@/lib/unlock";
import { useUnlock } from "@/lib/useUnlock";

export default function SellPage() {
  const router = useRouter();
  const { isConnected, userAddress, listOffer, isBusy, error, setError } = useUnlock();

  // Wizard steps: 1 = File selection & encrypt, 2 = Backup & listing details
  const [step, setStep] = useState<1 | 2>(1);

  // File & Crypto State
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [encryptedBlob, setEncryptedBlob] = useState<Uint8Array | null>(null);
  const [keyHex, setKeyHex] = useState<`0x${string}` | null>(null);
  const [keyHash, setKeyHash] = useState<`0x${string}` | null>(null);
  const [blobHash, setBlobHash] = useState<`0x${string}` | null>(null);
  const [isEncrypting, setIsEncrypting] = useState<boolean>(false);

  // Download checkpoints
  const [downloadedUnlock, setDownloadedUnlock] = useState<boolean>(false);
  const [downloadedBackup, setDownloadedBackup] = useState<boolean>(false);

  // Listing Form State
  const [label, setLabel] = useState<string>("");
  const [priceInput, setPriceInput] = useState<string>("1.0");
  const [windowSecs, setWindowSecs] = useState<number>(86400); // 24 hours default
  const [formError, setFormError] = useState<string | null>(null);

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setChosenFile(file);
    setIsEncrypting(true);
    setFormError(null);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const enc = await encryptFile({
        name: file.name,
        data: new Uint8Array(buffer),
      });

      setEncryptedBlob(enc.blob);
      setKeyHex(enc.keyHex);
      setKeyHash(enc.keyHash);
      setBlobHash(enc.blobHash);
      if (!label) {
        setLabel(file.name.slice(0, MAX_LABEL));
      }
      setStep(2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Encryption failed";
      setFormError(msg);
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleDownloadUnlock = () => {
    if (!encryptedBlob || !chosenFile) return;
    const blob = new Blob([encryptedBlob as unknown as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chosenFile.name}.unlock`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedUnlock(true);
  };

  const handleDownloadBackup = () => {
    if (!keyHex || !keyHash || !blobHash || !chosenFile || !userAddress) return;
    const backup: StoredKey = {
      id: "pending",
      seller: userAddress,
      label: label || chosenFile.name,
      blobHash,
      keyHash,
      key: keyHex,
      filename: chosenFile.name,
      createdAt: Date.now(),
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unlock-key-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedBackup(true);
  };

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setError(null);

    if (!isConnected || !userAddress) {
      setFormError("Please connect your wallet first.");
      return;
    }
    if (!blobHash || !keyHash || !keyHex || !chosenFile) {
      setFormError("File has not been encrypted.");
      return;
    }
    if (!label.trim()) {
      setFormError("Please provide a label for your key.");
      return;
    }
    if (new TextEncoder().encode(label).length > MAX_LABEL) {
      setFormError(`Label exceeds max length of ${MAX_LABEL} bytes.`);
      return;
    }

    const priceNum = parseFloat(priceInput);
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError("Price must be greater than zero.");
      return;
    }

    if (windowSecs < MIN_WINDOW || windowSecs > MAX_WINDOW) {
      setFormError("Reveal window must be between 1 hour and 7 days.");
      return;
    }

    // Verify localStorage availability
    if (!keyStore.isAvailable()) {
      setFormError("Local storage is disabled or unavailable. Listing blocked to protect secret key.");
      return;
    }

    try {
      const priceWei = parseEther(priceInput);
      const newId = await listOffer(
        blobHash,
        keyHash,
        priceWei,
        BigInt(windowSecs),
        label.trim()
      );

      // Save key in local storage keyed to this offer
      const record: StoredKey = {
        id: newId > 0n ? newId.toString() : "latest",
        seller: userAddress,
        label: label.trim(),
        blobHash,
        keyHash,
        key: keyHex,
        filename: chosenFile.name,
        createdAt: Date.now(),
      };
      keyStore.put(record);

      if (newId > 0n) {
        router.push(`/offer/${newId.toString()}`);
      } else {
        router.push("/me");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to list offer on chain";
      setFormError(msg);
    }
  };

  return (
    <PageShell
      title="Sell a Key"
      description="Guided fair exchange setup: Encrypt your secret file in the browser, secure your key backup, and publish the hashlock on chain."
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Step Indicator */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono uppercase tracking-wider border-b border-[var(--border-subtle)] pb-3">
          <div
            className={`flex items-center gap-2 ${
              step === 1 ? "text-[var(--accent)] font-bold" : "text-[var(--text-muted)]"
            }`}
          >
            <span className="w-4 h-4 border flex items-center justify-center border-current">1</span>
            <span>Encrypt & Secure</span>
          </div>
          <div
            className={`flex items-center gap-2 ${
              step === 2 ? "text-[var(--accent)] font-bold" : "text-[var(--text-muted)]"
            }`}
          >
            <span className="w-4 h-4 border flex items-center justify-center border-current">2</span>
            <span>Publish Hashlock</span>
          </div>
        </div>

        {/* STEP 1: Select File & Encrypt */}
        {step === 1 && (
          <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-5">
            <div>
              <h3 className="text-[14px] font-mono font-bold uppercase text-[var(--text-primary)]">
                1. Select File to Lock
              </h3>
              <p className="mt-1 text-[12px] font-mono text-[var(--text-secondary)] leading-relaxed">
                Your file is encrypted locally in your browser using AES-256-GCM. The plaintext and the decryption key never touch any server.
              </p>
            </div>

            <div className="p-6 border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-base)] text-center space-y-3">
              <input
                type="file"
                id="file-upload"
                onChange={handleFileChosen}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="inline-block px-5 py-2.5 bg-[var(--accent)] text-[var(--accent-ink)] font-mono text-[12px] font-bold uppercase tracking-wider cursor-pointer hover:brightness-105"
              >
                Choose File to Encrypt
              </label>
              <div className="text-[11px] font-mono text-[var(--text-tertiary)]">
                Supports documents, datasets, binaries, archives (up to browser memory limits)
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  id="sample-file-btn"
                  onClick={async () => {
                    const sample = {
                      name: "ocean-survey-charlie.csv",
                      data: new TextEncoder().encode("timestamp,depth,temp\n1718000000,450.2,4.2\n"),
                    };
                    setChosenFile({ name: sample.name } as File);
                    setIsEncrypting(true);
                    setFormError(null);
                    try {
                      const enc = await encryptFile(sample);
                      setEncryptedBlob(enc.blob);
                      setKeyHex(enc.keyHex);
                      setKeyHash(enc.keyHash);
                      setBlobHash(enc.blobHash);
                      if (!label) setLabel(sample.name.slice(0, MAX_LABEL));
                      setStep(2);
                    } catch (err: unknown) {
                      console.error("Encryption failed in sample-file-btn:", err);
                      const msg = err instanceof Error ? err.message : "Encryption failed";
                      setFormError(msg);
                    } finally {
                      setIsEncrypting(false);
                    }
                  }}
                  className="text-[11px] font-mono uppercase text-[var(--accent)] hover:underline cursor-pointer"
                >
                  Or Load Sample Dataset
                </button>
              </div>
            </div>

            {isEncrypting && (
              <div className="text-[12px] font-mono text-[var(--accent)] text-center animate-pulse">
                Generating 32-byte key & encrypting with AES-256-GCM...
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Download Backups & Configure Listing */}
        {step === 2 && (
          <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-mono font-bold uppercase text-[var(--text-primary)]">
                  2. Secure Backups & List
                </h3>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] font-mono uppercase text-[var(--accent)] hover:underline"
                >
                  Change File
                </button>
              </div>
              <p className="mt-1 text-[12px] font-mono text-[var(--text-secondary)]">
                Target file: <span className="text-[var(--text-primary)] font-semibold">{chosenFile?.name}</span>
              </p>
            </div>

            {/* Seller Warning Placard */}
            <div className="p-4 bg-[var(--accent)]/10 border border-[var(--accent)]/40 space-y-2">
              <div className="text-[11px] font-mono uppercase font-bold text-[var(--accent)]">
                Seller Warning
              </div>
              <p className="text-[12px] font-mono text-[var(--text-primary)] font-medium leading-relaxed">
                Keep the key backup. Without it you cannot reveal, and the buyer is refunded.
              </p>
            </div>

            {/* Checkpoints: Download .unlock and Key JSON */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDownloadUnlock}
                className={`p-3 text-left border font-mono text-[11px] uppercase transition-all cursor-pointer ${
                  downloadedUnlock
                    ? "bg-[var(--success)]/15 border-[var(--success)] text-[var(--success)]"
                    : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent)]"
                }`}
              >
                <div className="font-bold">1. Download .unlock</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {downloadedUnlock ? "✓ Blob Downloaded" : "Encrypted file payload"}
                </div>
              </button>

              <button
                type="button"
                onClick={handleDownloadBackup}
                className={`p-3 text-left border font-mono text-[11px] uppercase transition-all cursor-pointer ${
                  downloadedBackup
                    ? "bg-[var(--success)]/15 border-[var(--success)] text-[var(--success)]"
                    : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent)]"
                }`}
              >
                <div className="font-bold">2. Download Key Backup</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {downloadedBackup ? "✓ Key Saved" : "JSON secret backup"}
                </div>
              </button>
            </div>

            {/* Hashes Summary */}
            <div className="space-y-2 bg-[var(--bg-base)] p-3 border border-[var(--border-subtle)] text-[11px] font-mono">
              <div>
                <span className="text-[var(--text-tertiary)] uppercase">blobHash (SHA-256): </span>
                <span className="text-[var(--text-secondary)] break-all">{blobHash}</span>
              </div>
              <div>
                <span className="text-[var(--text-tertiary)] uppercase">keyHash (Keccak256): </span>
                <span className="text-[var(--text-secondary)] break-all">{keyHash}</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleListingSubmit} className="space-y-4 pt-2">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                  Listing Label (Max 64 bytes)
                </label>
                <input
                  type="text"
                  maxLength={MAX_LABEL}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Subsea Telemetry Log Q3"
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-default)] text-[13px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                  Price (BOT)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="1.0"
                  className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-default)] text-[13px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                  Reveal Window Duration
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {WINDOW_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.secs}
                      onClick={() => setWindowSecs(preset.secs)}
                      className={`px-2 py-2 text-[11px] font-mono uppercase tracking-wider border cursor-pointer transition-colors ${
                        windowSecs === preset.secs
                          ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] font-bold"
                          : "bg-[var(--bg-base)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {(formError || error) && (
                <div className="p-3 bg-[var(--danger)]/15 border border-[var(--danger)] text-[11px] font-mono text-[var(--danger)]">
                  {formError || error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                busy={isBusy}
                disabled={isBusy}
              >
                Publish Key Listing to Chain
              </Button>
            </form>
          </div>
        )}
      </div>
    </PageShell>
  );
}
