import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_STYLES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  online: "border-emerald-200 bg-emerald-50 text-emerald-700",
  passed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  connecting: "border-blue-200 bg-blue-50 text-blue-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  error: "border-red-200 bg-red-50 text-red-700",
  offline: "border-red-200 bg-red-50 text-red-700",
}

export function StatusBadge({ status = "neutral", children, className }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", STATUS_STYLES[status] || "border-border bg-muted text-muted-foreground", className)}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </Badge>
  )
}
