"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import OfferChamber, { type OfferDetails } from "@/components/airlock/OfferChamber";
import GateColumn from "@/components/airlock/GateColumn";
import KeyChamber from "@/components/airlock/KeyChamber";
import Button from "@/components/ui/Button";
import { useUnlock } from "@/lib/useUnlock";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OfferPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const offerIdStr = resolvedParams.id;
  const offerId = BigInt(offerIdStr || "0");

  const {
    getOffer,
    userAddress,
    nowSec,
    buyOffer,
    revealKey,
    claimRefund,
    cancelOffer,
    isBusy,
    error,
    setError,
  } = useUnlock();

  const [offer, setOffer] = useState<OfferDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const reloadOffer = useCallback(async () => {
    if (offerId <= 0n) {
      setIsLoading(false);
      return;
    }
    const data = await getOffer(offerId);
    setOffer(data);
    setIsLoading(false);
  }, [offerId, getOffer]);

  useEffect(() => {
    reloadOffer();
    const interval = setInterval(reloadOffer, 4000);
    return () => clearInterval(interval);
  }, [reloadOffer]);

  const handleBuy = async () => {
    if (!offer) return;
    try {
      await buyOffer(offer.id, offer.price);
      await reloadOffer();
    } catch {
      // error handled inside hook
    }
  };

  const handleReveal = async (keyHex: `0x${string}`) => {
    if (!offer) return;
    try {
      await revealKey(offer.id, keyHex);
      await reloadOffer();
    } catch {
      // error handled inside hook
    }
  };

  const handleRefund = async () => {
    if (!offer) return;
    try {
      await claimRefund(offer.id);
      await reloadOffer();
    } catch {
      // error handled inside hook
    }
  };

  const handleCancel = async () => {
    if (!offer) return;
    try {
      await cancelOffer(offer.id);
      await reloadOffer();
    } catch {
      // error handled inside hook
    }
  };

  if (isLoading) {
    return (
      <PageShell title={`Airlock Chamber #${offerIdStr}`}>
        <div className="p-12 text-center border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="text-[13px] font-mono text-[var(--accent)] animate-pulse uppercase tracking-wider">
            Pressurizing Airlock Chamber #{offerIdStr}...
          </div>
        </div>
      </PageShell>
    );
  }

  if (!offer || offer.seller === "0x0000000000000000000000000000000000000000") {
    return (
      <PageShell title="Chamber Not Found">
        <div className="p-8 text-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-4">
          <div className="text-[14px] font-mono text-[var(--danger)]">
            Offer #{offerIdStr} does not exist in the hashlock registry.
          </div>
          <div>
            <Link href="/" className="no-underline">
              <Button variant="outline" size="sm">
                Return to Dock
              </Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const isLate = offer.state === 1 && nowSec > offer.deadline;

  return (
    <PageShell
      title={`Airlock Bay #${offer.id.toString()}`}
      description="Two-chamber cryptographic gateway with central gate column verification."
      badge={
        <Link href="/" className="no-underline">
          <Button variant="ghost" size="sm">
            ← Dock
          </Button>
        </Link>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-[var(--danger)]/15 border border-[var(--danger)] text-[12px] font-mono text-[var(--danger)] flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[11px] font-bold uppercase hover:underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Archetype W · Airlock Two-Chamber + Gate Column Layout */}
        <div className="flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
          {/* Chamber A (Left Chamber: The Offer) */}
          <div className="order-2 md:order-1 flex flex-col">
            <OfferChamber offer={offer} nowSec={nowSec} className="h-full" />
          </div>

          {/* Central Gate Column */}
          <div className="order-1 md:order-2 flex flex-col justify-center">
            <GateColumn
              state={offer.state}
              isLate={isLate}
              className="h-full"
            />
          </div>

          {/* Chamber B (Right Chamber: The Key) */}
          <div className="order-3 md:order-3 flex flex-col">
            <KeyChamber
              offer={offer}
              userAddress={userAddress}
              nowSec={nowSec}
              onBuy={handleBuy}
              onReveal={handleReveal}
              onRefund={handleRefund}
              onCancel={handleCancel}
              isTxBusy={isBusy}
              className="h-full"
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
