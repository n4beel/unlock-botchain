"use client";

export default function LimitationBlock({ className = "" }: { className?: string }) {
  const limitations = [
    {
      title: "The key is public the moment it is revealed.",
      detail:
        "Once written to the blockchain, anyone can read the key. Unlock is built for single-delivery transactions, not perpetual secret vaults.",
    },
    {
      title: "The chain checks the key, not what the file contains.",
      detail:
        "Smart contracts verify the keccak256 hash of the 32-byte key. Verify the SHA-256 blob hash matches your expected data before paying.",
    },
    {
      title: "One buyer. No haggling.",
      detail:
        "The first buyer to lock exact payment wins the exclusive reveal window. There are no counter-offers or partial refunds.",
    },
  ];

  return (
    <div
      className={`border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <span className="w-2 h-2 bg-[var(--warning)]" aria-hidden="true" />
        <h3 className="text-[12px] font-mono font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
          What an unlock can&apos;t do
        </h3>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {limitations.map((item, idx) => (
          <div
            key={idx}
            className="p-3 bg-[var(--bg-base)] border border-[var(--border-subtle)] flex flex-col justify-between"
          >
            <div>
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                RULE 0{idx + 1}
              </div>
              <h4 className="text-[12px] font-mono font-semibold text-[var(--accent)] leading-snug">
                {item.title}
              </h4>
              <p className="mt-2 text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
