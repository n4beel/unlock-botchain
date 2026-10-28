"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

export type AirlockButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type AirlockButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AirlockButtonVariant;
  size?: AirlockButtonSize;
  busy?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function AirlockButton(
  {
    variant = "primary",
    size = "md",
    busy = false,
    disabled = false,
    className = "",
    children,
    style,
    ...props
  },
  ref
) {
  const isInactive = disabled || busy;

  // Custom styling map for Airlock interface
  const variantMap = {
    primary: "bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 active:brightness-95 border-transparent",
    outline: "bg-transparent text-[var(--text-primary)] border-[var(--border-default)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
    ghost: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]",
    danger: "bg-transparent text-[var(--danger)] border-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]",
  };

  const sizeMap = {
    sm: "px-2.5 py-1 text-[11px] h-[30px]",
    md: "px-4 py-2 text-[13px] h-[38px]",
    lg: "px-6 py-3 text-[14px] h-[46px]",
  };

  return (
    <button
      ref={ref}
      disabled={isInactive}
      className={`relative inline-flex items-center justify-center gap-2 font-mono font-medium tracking-[0.03em] uppercase transition-all duration-150 select-none border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${variantMap[variant]} ${sizeMap[size]} ${className}`}
      style={style}
      {...props}
    >
      {busy && (
        <span
          className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
      )}
      <span className={busy ? "opacity-75" : ""}>{children}</span>
    </button>
  );
});

Button.displayName = "AirlockButton";
export default Button;
