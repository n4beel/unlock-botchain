"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import DockBay from "@/components/airlock/DockBay";
import LimitationBlock from "@/components/airlock/LimitationBlock";
import Button from "@/components/ui/Button";
import { useUnlock } from "@/lib/useUnlock";
import type { OfferDetails } from "@/components/airlock/OfferChamber";

export default function DockPage() {
  const { isContractDeployed, getAllOffers, nowSec } = useUnlock();
  const [offers, setOffers] = useState<OfferDetails[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<"all" | "open" | "active">("all");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      try {
        const data = await getAllOffers();
        if (mounted) setOffers(data);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [getAllOffers]);

  const filteredOffers = useMemo(() => {
    if (filter === "open") return offers.filter((o) => o.state === 0);
    if (filter === "active") return offers.filter((o) => o.state === 1 || o.state === 2);
    return offers;
  }, [offers, filter]);

  const stats = useMemo(() => {
    const openCount = offers.filter((o) => o.state === 0).length;
    const paidCount = offers.filter((o) => o.state === 1).length;
    const settledCount = offers.filter((o) => o.state === 2 || o.state === 3).length;
    return { openCount, paidCount, settledCount };
  }, [offers]);

  return (
    <PageShell
      title="The Dock"
      description="Cryptographic fair exchange bays. Buy a key with escrow protection, or list a key with on-chain hash commitment."
      badge={
        <Link href="/sell" className="no-underline">
          <Button variant="primary" size="sm">
            + List Key
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Not Deployed Banner */}
        {!isContractDeployed && (
          <div className="p-4 bg-[var(--danger)]/15 border border-[var(--danger)] text-[12px] font-mono text-[var(--danger)] flex items-center justify-between">
            <span>Unlock contract is not deployed on this network. Please switch to Bohr Testnet or run local stack.</span>
          </div>
        )}

        {/* Stats Strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:p-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-[var(--text-tertiary)] tracking-wider">
              Open Bays
            </span>
            <span className="text-[18px] sm:text-[22px] font-mono font-bold text-[var(--accent)] mt-0.5">
              {stats.openCount}
            </span>
          </div>
          <div className="flex flex-col border-l border-[var(--border-subtle)] pl-3 sm:pl-4">
            <span className="text-[10px] font-mono uppercase text-[var(--text-tertiary)] tracking-wider">
              In Escrow
            </span>
            <span className="text-[18px] sm:text-[22px] font-mono font-bold text-[var(--warning)] mt-0.5">
              {stats.paidCount}
            </span>
          </div>
          <div className="flex flex-col border-l border-[var(--border-subtle)] pl-3 sm:pl-4">
            <span className="text-[10px] font-mono uppercase text-[var(--text-tertiary)] tracking-wider">
              Resolved
            </span>
            <span className="text-[18px] sm:text-[22px] font-mono font-bold text-[var(--success)] mt-0.5">
              {stats.settledCount}
            </span>
          </div>
        </div>

        {/* Dock Controls / Filter Tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-1 border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                filter === "all"
                  ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              All Bays ({offers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("open")}
              className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                filter === "open"
                  ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Open ({stats.openCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("active")}
              className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                filter === "active"
                  ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              In Airlock ({stats.paidCount})
            </button>
          </div>

          <div className="text-[11px] font-mono text-[var(--text-muted)]">
            Showing newest listings first
          </div>
        </div>

        {/* Vertical Stack of Dock Bays */}
        <div className="space-y-2">
          {isLoading && offers.length === 0 ? (
            <div className="p-8 text-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
              <div className="text-[12px] font-mono text-[var(--accent)] animate-pulse uppercase tracking-wider">
                Scanning Dock Bays...
              </div>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="p-8 text-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-4">
              <div className="text-[13px] font-mono text-[var(--text-secondary)]">
                {filter === "all"
                  ? "No offers listed at the dock yet."
                  : `No offers currently in ${filter} status.`}
              </div>
              <div>
                <Link href="/sell" className="no-underline">
                  <Button variant="outline" size="sm">
                    List the first key
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            filteredOffers.map((offer) => (
              <DockBay key={offer.id.toString()} offer={offer} nowSec={nowSec} />
            ))
          )}
        </div>

        {/* Protocol Limitation Placard */}
        <div className="pt-4">
          <LimitationBlock />
        </div>
      </div>
    </PageShell>
  );
}
