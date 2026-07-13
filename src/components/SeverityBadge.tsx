import { cn } from "@/lib/utils";
import { SEVERITY_SHORT } from "@/core/severity";
import type { Severity } from "@/core/types";

const STYLES: Record<Severity, string> = {
  green: "bg-sev-green/15 text-sev-green ring-sev-green/30",
  yellow: "bg-sev-yellow/15 text-sev-yellow ring-sev-yellow/30",
  orange: "bg-sev-orange/15 text-sev-orange ring-sev-orange/30",
  red: "bg-sev-red/20 text-sev-red ring-sev-red/40",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STYLES[severity],
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", {
          "bg-sev-green": severity === "green",
          "bg-sev-yellow": severity === "yellow",
          "bg-sev-orange": severity === "orange",
          "bg-sev-red": severity === "red",
        })}
      />
      {SEVERITY_SHORT[severity]}
    </span>
  );
}
