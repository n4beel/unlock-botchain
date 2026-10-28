"use client";

import { useMemo } from "react";

export type AirlockPhase = "Listed" | "Paid" | "Revealed" | "Settled" | "Refunded" | "Cancelled";

interface GateColumnProps {
  state: number; // 0=Open, 1=Paid, 2=Revealed, 3=Refunded, 4=Cancelled
  isLate?: boolean;
  className?: string;
}

type GateLamp = {
  label: string;
  status: "pending" | "active" | "complete" | "disabled";
  active: boolean;
  sublabel?: string;
};

export default function GateColumn({ state, isLate = false, className = "" }: GateColumnProps) {
  /**
   * 4 Lamps:
   * 1. Listed (Active when state >= 0)
   * 2. Paid (Active when state >= 1 and not Cancelled)
   * 3. Key revealed (Active when state == 2)
   * 4. Settled (Active when state == 2 (withdrawn), 3 (refunded), or 4 (cancelled))
   */
  const lamps = useMemo<GateLamp[]>(() => {
    // Stage 1: Listed
    const lamp1: GateLamp = {
      label: "Listed",
      status: state >= 0 ? "complete" : "pending",
      active: state === 0,
    };

    // Stage 2: Paid
    const isPaidOrBeyond = state === 1 || state === 2 || state === 3;
    const lamp2Status: GateLamp["status"] = state === 4 ? "disabled" : isPaidOrBeyond ? (state === 1 ? "active" : "complete") : "pending";
    const lamp2: GateLamp = {
      label: state === 4 ? "Bypassed" : "Paid",
      status: lamp2Status,
      active: state === 1 && !isLate,
      sublabel: state === 1 && isLate ? "Expired" : undefined,
    };

    // Stage 3: Key revealed
    const lamp3Status: GateLamp["status"] = state === 2 ? "active" : state === 3 ? "disabled" : "pending";
    const lamp3: GateLamp = {
      label: state === 3 ? "Window Closed" : "Key Revealed",
      status: lamp3Status,
      active: state === 2,
    };

    // Stage 4: Settled
    let settledLabel = "Settled";
    let settledStatus: GateLamp["status"] = "pending";
    if (state === 2) {
      settledLabel = "Key Released";
      settledStatus = "complete";
    } else if (state === 3) {
      settledLabel = "Refunded";
      settledStatus = "complete";
    } else if (state === 4) {
      settledLabel = "Cancelled";
      settledStatus = "disabled";
    }

    const lamp4: GateLamp = {
      label: settledLabel,
      status: settledStatus,
      active: state === 2 || state === 3 || state === 4,
    };

    return [lamp1, lamp2, lamp3, lamp4];
  }, [state, isLate]);

  return (
    <div
      className={`relative flex flex-row md:flex-col items-center justify-between md:justify-center gap-2 md:gap-6 py-2 px-3 md:py-6 md:px-3 bg-[var(--bg-surface)] border border-[var(--border-default)] select-none ${className}`}
      aria-label="Airlock Gate Navigation"
    >
      {/* Decorative vertical line on desktop */}
      <div
        className="hidden md:block absolute top-8 bottom-8 left-1/2 -translate-x-1/2 w-[2px] bg-[var(--border-subtle)] z-0"
        aria-hidden="true"
      />
      {/* Decorative horizontal line on mobile */}
      <div
        className="block md:hidden absolute left-8 right-8 top-1/2 -translate-y-1/2 h-[2px] bg-[var(--border-subtle)] z-0"
        aria-hidden="true"
      />

      {lamps.map((lamp, idx) => {
        const isCurrent = lamp.active;
        const isDone = lamp.status === "complete";
        const isDisabled = lamp.status === "disabled";

        let lampColor = "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-tertiary)]";
        if (isCurrent) {
          lampColor = "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)] lamp-pulse-active";
        } else if (isDone) {
          lampColor = "bg-[var(--success)] border-[var(--success)] text-[var(--bg-base)]";
        } else if (isDisabled) {
          lampColor = "bg-[var(--danger)]/30 border-[var(--danger)] text-[var(--danger)]";
        }

        return (
          <div
            key={idx}
            className="relative z-10 flex flex-col md:flex-col items-center gap-1.5"
          >
            {/* Lamp Bulb Indicator */}
            <div
              className={`w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center font-mono text-[10px] sm:text-[11px] font-bold border transition-all duration-300 ${lampColor}`}
              title={`${lamp.label}: ${lamp.status}`}
            >
              {idx + 1}
            </div>

            {/* Lamp Label */}
            <div className="flex flex-col items-center text-center">
              <span
                className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.05em] whitespace-nowrap ${
                  isCurrent
                    ? "text-[var(--accent)] font-semibold"
                    : isDone
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {lamp.label}
              </span>
              {lamp.sublabel && (
                <span className="text-[9px] font-mono text-[var(--danger)] uppercase">
                  {lamp.sublabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
