import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <PageShell title="Chamber Depressurized · 404">
      <div className="max-w-md mx-auto p-8 text-center border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4">
        <div className="text-[28px] font-mono font-bold text-[var(--accent)]">
          404
        </div>
        <h2 className="text-[16px] font-mono font-semibold text-[var(--text-primary)]">
          Airlock Seal Not Found
        </h2>
        <p className="text-[12px] font-mono text-[var(--text-secondary)] leading-relaxed">
          The requested dock bay, offer chamber, or cryptographic receipt does not exist or has been decompressed.
        </p>
        <div className="pt-2">
          <Link href="/" className="no-underline">
            <Button variant="primary" size="md">
              Return to The Dock
            </Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
