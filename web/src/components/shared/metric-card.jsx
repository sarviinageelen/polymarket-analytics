import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function MetricCard({ label, value, detail, comparison, icon: Icon, tone = "neutral", className }) {
  const toneClass = {
    positive: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    danger: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    info: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    neutral: "bg-muted text-muted-foreground",
  }[tone] || "bg-muted text-muted-foreground"

  return (
    <Card size="sm" className={cn("gap-0", className)}>
      <CardContent className="flex items-start gap-3">
        {Icon && (
          <div className={cn("grid size-9 shrink-0 place-items-center rounded-lg", toneClass)} aria-hidden="true">
            <Icon className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {comparison && <span className="text-xs font-medium text-foreground">{comparison}</span>}
          </div>
          <p className="mt-0.5 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
