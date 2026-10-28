import { type HTMLAttributes, type ReactNode } from "react";

export type PanelVariant = "surface" | "chamber" | "inset" | "bordered";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  compact?: boolean;
  header?: ReactNode;
  elevated?: boolean;
  noPadding?: boolean;
}

export default function Panel({
  variant = "surface",
  compact = false,
  header,
  elevated = false,
  noPadding = false,
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  const variantStyles = {
    surface: "bg-[var(--bg-surface)] border-[var(--border-subtle)]",
    chamber: "bg-[var(--bg-surface)] border-[var(--border-default)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
    inset: "bg-[var(--bg-base)] border-[var(--border-subtle)]",
    bordered: "bg-[var(--bg-elevated)] border-[var(--border-strong)]",
  };

  const bgStyle = elevated ? "var(--bg-elevated)" : undefined;

  return (
    <div
      className={`border relative transition-colors ${variantStyles[variant]} ${className}`}
      style={{
        backgroundColor: bgStyle,
        ...style,
      }}
      {...props}
    >
      {header && (
        <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.05em] text-[var(--text-muted)] bg-[var(--bg-elevated)]">
          {header}
        </div>
      )}
      <div className={noPadding ? "" : compact ? "p-3.5" : "p-5"}>
        {children}
      </div>
    </div>
  );
}
