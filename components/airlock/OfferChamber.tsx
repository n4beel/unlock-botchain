"use client";

import { useState } from "react";
import { formatEther, type Address } from "viem";
import { formatRemaining } from "@/lib/unlock";

export interface OfferDetails {
  id: bigint;
  seller: Address;
  buyer: Address;
  price: bigint;
  revealWindow: bigint;
  deadline: bigint;
  state: number; // 0=Open, 1=Paid, 2=Revealed, 3=Refunded, 4=Cancelled
  blobHash: `0x${string}`;
  keyHash: `0x${string}`;
  key: `0x${string}`;
  label: string;
}

interface OfferChamberProps {
  offer: OfferDetails;
  nowSec: bigint;
  className?: string;
}

export default function OfferChamber({ offer, nowSec, className = "" }: OfferChamberProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isPaid = offer.state === 1;
  const isLate = isPaid && nowSec > offer.deadline;
  const remainingSeconds = offer.deadline > nowSec ? offer.deadline - nowSec : 0n;

  const stateLabels = ["Open", "Paid", "Revealed", "Refunded", "Cancelled"];
  const stateColor = [
    "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/40",
    isLate
      ? "bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/40"
      : "bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/40",
    "bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/40",
    "bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/40",
    "bg-[var(--text-muted)]/15 text-[var(--text-muted)] border-[var(--border-default)]",
  ][offer.state] || "";

  return (
    <div
      className={`bg-[var(--bg-surface)] border border-[var(--border-default)] p-5 sm:p-6 flex flex-col justify-between ${className}`}
    >
      <div>
        {/* Chamber Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[var(--accent)]" aria-hidden="true" />
            <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Chamber A · The Offer
            </span>
          </div>
          <span
            className={`px-2 py-0.5 text-[10px] font-mono uppercase font-bold tracking-wider border ${stateColor}`}
          >
            {isLate ? "Paid (Late)" : stateLabels[offer.state]}
          </span>
        </div>

        {/* Title and Price */}
        <div className="mt-4">
          <div className="text-[11px] font-mono text-[var(--text-tertiary)] uppercase tracking-wide">
            Offer #{offer.id.toString()}
          </div>
          <h2 className="text-[18px] sm:text-[20px] font-mono font-bold text-[var(--text-primary)] mt-1 break-words">
            {offer.label || "Untitled Key Listing"}
          </h2>

          <div className="mt-4 p-3 bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-baseline justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
              Required Price
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] sm:text-[26px] font-mono font-bold text-[var(--accent)]">
                {formatEther(offer.price)}
              </span>
              <span className="text-[12px] font-mono font-semibold text-[var(--text-muted)]">
                BOT
              </span>
            </div>
          </div>
        </div>

        {/* Technical Data Specification */}
        <div className="mt-5 space-y-3 text-[12px] font-mono">
          {/* Seller */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[11px]">Seller</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-primary)] select-all truncate max-w-[200px]">
                {offer.seller}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(offer.seller, "seller")}
                className="text-[10px] text-[var(--accent)] uppercase hover:underline"
              >
                {copiedKey === "seller" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Reveal Window */}
          <div className="flex items-center justify-between gap-1 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[11px]">
              Reveal Window
            </span>
            <span className="text-[var(--text-primary)] font-semibold">
              {Number(offer.revealWindow) >= 86400
                ? `${Number(offer.revealWindow) / 86400} Days`
                : `${Number(offer.revealWindow) / 3600} Hours`}
            </span>
          </div>

          {/* Blob Hash (SHA-256 of encrypted file) */}
          <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[11px]">
                File SHA-256 (blobHash)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(offer.blobHash, "blobHash")}
                className="text-[10px] text-[var(--accent)] uppercase hover:underline"
              >
                {copiedKey === "blobHash" ? "Copied" : "Copy"}
              </button>
            </div>
            <code className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-base)] p-1.5 border border-[var(--border-subtle)] break-all select-all">
              {offer.blobHash}
            </code>
          </div>

          {/* Key Hash (Keccak256 of AES key) */}
          <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[11px]">
                Key Lock (keyHash)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(offer.keyHash, "keyHash")}
                className="text-[10px] text-[var(--accent)] uppercase hover:underline"
              >
                {copiedKey === "keyHash" ? "Copied" : "Copy"}
              </button>
            </div>
            <code className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-base)] p-1.5 border border-[var(--border-subtle)] break-all select-all">
              {offer.keyHash}
            </code>
          </div>

          {/* Buyer if Paid */}
          {offer.buyer && offer.buyer !== "0x0000000000000000000000000000000000000000" && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-[var(--text-tertiary)] uppercase tracking-wide text-[11px]">Buyer</span>
              <span className="text-[var(--text-primary)] select-all truncate max-w-[200px]">
                {offer.buyer}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Deadline countdown footer if in Paid state */}
      {isPaid && (
        <div className="mt-6 pt-3 border-t border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
              {isLate ? "Window Status" : "Reveal Deadline"}
            </span>
            <span
              className={`text-[13px] font-mono font-bold ${
                isLate ? "text-[var(--danger)]" : "text-[var(--warning)]"
              }`}
            >
              {isLate ? "EXPIRED (LATE)" : `${formatRemaining(remainingSeconds)} left`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
