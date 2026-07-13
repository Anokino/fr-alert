import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { ModuleMeta, Severity } from "@/core/types";
import { cn } from "@/lib/utils";

const SEV_VAR: Record<Severity, string> = {
  green: "var(--sev-green)",
  yellow: "var(--sev-yellow)",
  orange: "var(--sev-orange)",
  red: "var(--sev-red)",
};

export interface ModuleSummary {
  count: number;
  maxSeverity: Severity;
}

export function ModuleGrid({
  modules,
  summaries,
}: {
  modules: ModuleMeta[];
  summaries: Record<string, ModuleSummary>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {modules.map((m) => {
        const s = summaries[m.slug];
        const count = s?.count ?? 0;
        const active = count > 0;
        return (
          <Link
            key={m.slug}
            href={`/m/${m.slug}`}
            className={cn(
              "group relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition hover:bg-surface-2 focus-visible:bg-surface-2",
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className="grid size-10 place-items-center rounded-lg"
                style={{
                  background: `color-mix(in oklch, ${m.accent} 16%, transparent)`,
                  color: m.accent,
                }}
              >
                <Icon name={m.icon} size={20} />
              </span>
              {active ? (
                <span
                  className="grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums"
                  style={{
                    background: `color-mix(in oklch, ${SEV_VAR[s.maxSeverity]} 20%, transparent)`,
                    color: SEV_VAR[s.maxSeverity],
                  }}
                >
                  {count}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold">{m.name}</h3>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {m.tagline}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
