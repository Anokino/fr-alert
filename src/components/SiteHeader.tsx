import Link from "next/link";
import { Siren, Plus } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-sev-red/15 text-sev-red ring-1 ring-sev-red/30">
            <Siren size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-bold tracking-tight">
              France Alert
            </span>
            <span className="text-[11px] text-muted-foreground">
              Sécurité civile en temps réel
            </span>
          </span>
        </Link>

        <Link
          href="/signaler"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden />
          Signaler
        </Link>
      </div>
    </header>
  );
}
