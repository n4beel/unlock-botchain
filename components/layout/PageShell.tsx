"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
  badge?: React.ReactNode;
}

export default function PageShell({
  children,
  nav,
  title,
  description,
  badge,
}: PageShellProps) {
  const pathname = usePathname();
  const links = footerLinks();

  const defaultNav: NavItem[] = [
    { href: "/", label: "Dock" },
    { href: "/sell", label: "Sell Key" },
    { href: "/me", label: "My Vault" },
  ];
  const navigationItems = nav ?? defaultNav;

  return (
    <div
      className="flex flex-col min-h-[100dvh] w-full overflow-x-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Airlock Bridge Header */}
      <header
        className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-sm"
      >
        <div className="mx-auto w-full max-w-[1040px] px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-3">
            {/* Brand Logo & Lock Lamp */}
            <Link
              href="/"
              className="flex items-center gap-2.5 text-inherit no-underline group flex-shrink-0"
            >
              <div
                className="w-4 h-4 flex items-center justify-center border border-[var(--accent)] bg-[var(--bg-base)] text-[var(--accent)]"
                aria-hidden="true"
              >
                <div className="w-1.5 h-1.5 bg-[var(--accent)] group-hover:scale-125 transition-transform" />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-mono font-bold tracking-[0.08em] text-[var(--text-primary)] uppercase">
                  {app.name}
                </span>
                <span className="text-[9px] font-mono tracking-wider text-[var(--text-tertiary)] -mt-0.5 uppercase hidden sm:inline">
                  Fair Exchange Hashlock
                </span>
              </div>
            </Link>

            {/* Central Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 h-full">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`airlock-nav-link px-3.5 py-1.5 text-[12px] font-mono uppercase tracking-[0.06em] transition-colors relative flex items-center h-full ${
                      isActive
                        ? "text-[var(--accent)] font-semibold"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)]"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Wallet & Network */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <NetworkBadge />
              <div className="w-[140px] sm:w-[170px]">
                <ConnectButton />
              </div>
            </div>
          </div>

          {/* Mobile Navigation Row */}
          <div className="md:hidden flex items-center gap-2 border-t border-[var(--border-subtle)] py-2 overflow-x-auto">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`airlock-nav-link px-3 py-1 text-[11px] font-mono uppercase tracking-[0.05em] whitespace-nowrap border ${
                    isActive
                      ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] font-bold"
                      : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Airlock Compartment */}
      <main className="flex-1 mx-auto w-full max-w-[1040px] px-4 sm:px-6 py-6 sm:py-8">
        {(title || description || badge) && (
          <div className="mb-6 pb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {title && (
                <h1 className="text-[20px] sm:text-[24px] font-mono font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                  {title}
                </h1>
              )}
              {badge && <div>{badge}</div>}
            </div>
            {description && (
              <p className="mt-1.5 text-[13px] text-[var(--text-secondary)] font-mono leading-relaxed max-w-2xl">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </main>

      {/* Required Three-Link Ecosystem Footer */}
      <footer className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-6">
        <div className="mx-auto w-full max-w-[1040px] px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono tracking-wide text-[var(--text-tertiary)] uppercase">
              {app.name} · {app.tagline}
            </span>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-1.5 h-1.5 bg-[var(--accent)]"
                aria-hidden="true"
              />
              <BuiltOnBotChain
                className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-[12px] font-mono">
            <a
              href={links.site}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] underline transition-colors"
            >
              botchain.ai
            </a>
            <span className="text-[var(--border-strong)]" aria-hidden="true">/</span>
            <a
              href={links.explorer}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] underline transition-colors"
            >
              BOT Chain Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
