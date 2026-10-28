"use client";

import Link from "next/link";
import { formatEther } from "viem";
import type { OfferDetails } from "./OfferChamber";

interface DockBayProps {
  offer: OfferDetails;
  nowSec?: bigint;
}

export default function DockBay({ offer, nowSec }: DockBayProps) {
  const isPaid = offer.state === 1;
  const isLate = Boolean(isPaid && nowSec && nowSec > offer.deadline);

  // State lamps: 0=Open, 1=Paid, 2=Revealed, 3=Refunded, 4=Cancelled
  const lampColors = [
    "bg-[var(--accent)] text-[var(--accent-ink)]", // Open
    isLate ? "bg-[var(--danger)] text-white" : "bg-[var(--warning)] text-[var(--bg-base)]", // Paid
    "bg-[var(--success)] text-[var(--bg-base)]", // Revealed
    "bg-[var(--danger)] text-white", // Refunded
    "bg-[var(--text-tertiary)] text-[var(--bg-base)]", // Cancelled
  ];

  const stateLabels = [
    "Open",
    isLate ? "Paid (Late)" : "Paid",
    "Revealed",
    "Refunded",
    "Cancelled",
  ];

  const lampClass = lampColors[offer.state] || "bg-[var(--text-muted)]";
  const stateLabel = stateLabels[offer.state] || "Unknown";

  const windowHours = Number(offer.revealWindow) / 3600;

  return (
    <Link
      href={`/offer/${offer.id.toString()}`}
      className="group block w-full no-underline transition-colors focus:outline-none"
    >
      <div className="w-full bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] px-4 py-3 flex items-center justify-between gap-3 transition-all duration-150">
        {/* Left: State Lamp & Meta */}
        <div className="flex items-center gap-3 min-w-0">
          {/* State Lamp Pill */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full inline-block ${lampClass} ${
                offer.state === 0 ? "lamp-pulse-active" : ""
              }`}
              aria-hidden="true"
            />
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-[var(--text-secondary)] hidden sm:inline">
              {stateLabel}
            </span>
          </div>

          <div className="h-4 w-[1px] bg-[var(--border-subtle)] hidden sm:block" aria-hidden="true" />

          {/* Title and ID */}
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-[var(--text-tertiary)] uppercase flex-shrink-0">
                #{offer.id.toString()}
              </span>
              <span className="text-[13px] font-mono font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                {offer.label || "Untitled Key Listing"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-0.5">
              <span>{windowHours >= 24 ? `${windowHours / 24}d window` : `${windowHours}h window`}</span>
              <span className="mx-1.5 text-[var(--border-strong)]">·</span>
              <span>Seller {offer.seller.slice(0, 6)}...{offer.seller.slice(-4)}</span>
            </div>
          </div>
        </div>

        {/* Right: Price & Navigation Arrow */}
        <div className="flex items-center gap-3 flex-shrink-0 text-right">
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="text-[15px] sm:text-[17px] font-mono font-bold text-[var(--accent)]">
                {formatEther(offer.price)}
              </span>
              <span className="text-[10px] font-mono font-semibold text-[var(--text-muted)] uppercase">
                BOT
              </span>
            </div>
          </div>
          <span
            className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all font-mono text-[14px]"
            aria-hidden="true"
          >
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
