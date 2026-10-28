"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";
import { useUnlock } from "@/lib/useUnlock";
import { keyStore, formatRemaining, type StoredKey } from "@/lib/unlock";
import type { OfferDetails } from "@/components/airlock/OfferChamber";

export default function MyVaultPage() {
  const {
    userAddress,
    isConnected,
    getAllOffers,
    getPendingBalance,
    withdrawTill,
    claimRefund,
    nowSec,
    isBusy,
    error,
    setError,
  } = useUnlock();

  const [pendingTill, setPendingTill] = useState<bigint>(0n);
  const [userOffers, setUserOffers] = useState<OfferDetails[]>([]);
  const [userPurchases, setUserPurchases] = useState<OfferDetails[]>([]);
  const [storedKeys, setStoredKeys] = useState<StoredKey[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadUserData = useCallback(async () => {
    if (!userAddress) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const bal = await getPendingBalance(userAddress);
      setPendingTill(bal);

      const all = await getAllOffers();
      const lower = userAddress.toLowerCase();
      const myOffers = all.filter((o) => o.seller.toLowerCase() === lower);
      const myPurchases = all.filter((o) => o.buyer.toLowerCase() === lower);

      setUserOffers(myOffers);
      setUserPurchases(myPurchases);

      const keys = keyStore.list(userAddress);
      setStoredKeys(keys);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, getPendingBalance, getAllOffers]);

  useEffect(() => {
    loadUserData();
    const interval = setInterval(loadUserData, 6000);
    return () => clearInterval(interval);
  }, [loadUserData]);

  const handleWithdraw = async () => {
    try {
      await withdrawTill();
      await loadUserData();
    } catch {
      // error handled by hook
    }
  };

  const handleRefund = async (id: bigint) => {
    try {
      await claimRefund(id);
      await loadUserData();
    } catch {
      // error handled by hook
    }
  };

  const handleImportKeyBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = keyStore.importBackup(text);
        if (imported) {
          loadUserData();
        } else {
          setError("Failed to parse key backup file");
        }
      } catch {
        setError("Invalid JSON backup file");
      }
    };
    reader.readAsText(file);
  };

  if (!isConnected || !userAddress) {
    return (
      <PageShell title="My Vault & Till">
        <div className="p-8 text-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
          <div className="text-[14px] font-mono text-[var(--text-primary)]">
            Connect your wallet to inspect your listed offers, key escrow balances, and till withdrawals.
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="My Vault & Till"
      description="Manage your listed offers, claim late refunds, inspect secret key backups, and withdraw settled earnings."
    >
      <div className="space-y-6">
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

        {/* Pending Till Balance & Withdraw Box */}
        <div className="p-5 sm:p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
              Pending Till Balance (Available for Withdrawal)
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[26px] sm:text-[32px] font-mono font-bold text-[var(--accent)]">
                {formatEther(pendingTill)}
              </span>
              <span className="text-[14px] font-mono font-semibold text-[var(--text-muted)]">
                BOT
              </span>
            </div>
            <p className="mt-1 text-[11px] font-mono text-[var(--text-secondary)]">
              Non-reentrant pull payment till. Funds from revealed sales or claimable refunds accrue here.
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            disabled={pendingTill === 0n || isBusy}
            busy={isBusy}
            onClick={handleWithdraw}
            className="flex-shrink-0"
          >
            Withdraw to Wallet
          </Button>
        </div>

        {/* Section 1: Your Key Listings */}
        <div className="p-5 sm:p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[13px] font-mono uppercase font-bold text-[var(--text-primary)]">
              Your Key Listings ({userOffers.length})
            </h3>
            <Link href="/sell" className="no-underline">
              <span className="text-[11px] font-mono text-[var(--accent)] hover:underline uppercase">
                + New Offer
              </span>
            </Link>
          </div>

          {isLoading ? (
            <div className="text-[12px] font-mono text-[var(--text-muted)] animate-pulse py-4 text-center">
              Loading your listings...
            </div>
          ) : userOffers.length === 0 ? (
            <div className="text-[12px] font-mono text-[var(--text-secondary)] py-4 text-center">
              You haven&apos;t listed any keys yet.
            </div>
          ) : (
            <div className="space-y-2">
              {userOffers.map((o) => {
                const isPaid = o.state === 1;
                const isLate = isPaid && nowSec > o.deadline;
                const remaining = o.deadline > nowSec ? o.deadline - nowSec : 0n;

                return (
                  <div
                    key={o.id.toString()}
                    className="p-3 bg-[var(--bg-base)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                          #{o.id.toString()}
                        </span>
                        <Link
                          href={`/offer/${o.id.toString()}`}
                          className="text-[13px] font-mono font-medium text-[var(--text-primary)] hover:text-[var(--accent)] underline"
                        >
                          {o.label || "Untitled Offer"}
                        </Link>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                        Price: {formatEther(o.price)} BOT · State:{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                          {["Open", "Paid", "Revealed", "Refunded", "Cancelled"][o.state]}
                        </span>
                        {isPaid && (
                          <span className={isLate ? "text-[var(--danger)] ml-2" : "text-[var(--warning)] ml-2"}>
                            ({isLate ? "Late" : `${formatRemaining(remaining)} left`})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPaid && !isLate && (
                        <Link href={`/offer/${o.id.toString()}`} className="no-underline">
                          <Button variant="primary" size="sm">
                            Reveal Key Now
                          </Button>
                        </Link>
                      )}
                      <Link href={`/offer/${o.id.toString()}`} className="no-underline">
                        <Button variant="outline" size="sm">
                          View Chamber
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Your Purchases */}
        <div className="p-5 sm:p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <div className="pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[13px] font-mono uppercase font-bold text-[var(--text-primary)]">
              Your Purchases ({userPurchases.length})
            </h3>
          </div>

          {isLoading ? (
            <div className="text-[12px] font-mono text-[var(--text-muted)] animate-pulse py-4 text-center">
              Loading your purchases...
            </div>
          ) : userPurchases.length === 0 ? (
            <div className="text-[12px] font-mono text-[var(--text-secondary)] py-4 text-center">
              You haven&apos;t purchased any keys yet.
            </div>
          ) : (
            <div className="space-y-2">
              {userPurchases.map((o) => {
                const isPaid = o.state === 1;
                const isLate = isPaid && nowSec > o.deadline;
                const isRevealed = o.state === 2;

                return (
                  <div
                    key={o.id.toString()}
                    className="p-3 bg-[var(--bg-base)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                          #{o.id.toString()}
                        </span>
                        <Link
                          href={`/offer/${o.id.toString()}`}
                          className="text-[13px] font-mono font-medium text-[var(--text-primary)] hover:text-[var(--accent)] underline"
                        >
                          {o.label || "Untitled Offer"}
                        </Link>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                        Paid: {formatEther(o.price)} BOT · State:{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                          {["Open", "Paid", "Revealed", "Refunded", "Cancelled"][o.state]}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isRevealed && (
                        <Link href={`/offer/${o.id.toString()}`} className="no-underline">
                          <Button variant="primary" size="sm">
                            Decrypt File
                          </Button>
                        </Link>
                      )}
                      {isLate && (
                        <Button
                          variant="danger"
                          size="sm"
                          busy={isBusy}
                          onClick={() => handleRefund(o.id)}
                        >
                          Claim Refund
                        </Button>
                      )}
                      <Link href={`/offer/${o.id.toString()}`} className="no-underline">
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Browser Secret Key Vault */}
        <div className="p-5 sm:p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div>
              <h3 className="text-[13px] font-mono uppercase font-bold text-[var(--text-primary)]">
                Local Key Vault ({storedKeys.length})
              </h3>
              <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                Secret AES keys stored in your browser&apos;s localStorage for your seller offers.
              </p>
            </div>

            <label className="text-[11px] font-mono uppercase text-[var(--accent)] hover:underline cursor-pointer flex-shrink-0">
              Import Backup
              <input
                type="file"
                accept=".json"
                onChange={handleImportKeyBackup}
                className="hidden"
              />
            </label>
          </div>

          {storedKeys.length === 0 ? (
            <div className="text-[12px] font-mono text-[var(--text-secondary)] py-2 text-center">
              No keys currently stored in this browser session.
            </div>
          ) : (
            <div className="space-y-2">
              {storedKeys.map((k, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-[11px] font-mono"
                >
                  <div className="truncate min-w-0">
                    <span className="text-[var(--text-primary)] font-semibold">Offer #{k.id}</span>
                    <span className="mx-2 text-[var(--text-tertiary)]">·</span>
                    <span className="text-[var(--text-secondary)] truncate">{k.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => keyStore.downloadBackup(k)}
                    className="text-[var(--accent)] uppercase hover:underline flex-shrink-0"
                  >
                    Download JSON
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
