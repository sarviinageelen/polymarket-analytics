import { Database, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { SelectField } from "@/components/shared/fields"
import { formatDate } from "@/lib/api"
import { viewLabel } from "@/lib/constants"

export function AppHeader({ view, sport, sports, onSportChange, snapshot, onRefreshStatus, statusRefreshing }) {
  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
      <SidebarTrigger className="-ml-1 size-9" />
      <Separator orientation="vertical" className="h-4" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium sm:text-sm">{viewLabel(view)}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          Data current as of {formatDate(snapshot?.generated_at_utc)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-28 sm:w-40">
          <SelectField
            value={sport}
            onValueChange={onSportChange}
            options={sports.map((item) => ({ value: item.id, label: item.label }))}
            ariaLabel="Active dataset"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-9"
          onClick={onRefreshStatus}
          aria-label="Refresh dashboard status"
          title="Refresh dashboard status"
          disabled={statusRefreshing}
        >
          <RefreshCw className={statusRefreshing ? "animate-spin" : ""} />
        </Button>
        <div className="hidden items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground xl:flex">
          <Database className="size-3.5" />
          <span>{snapshot?.label || "Dataset"}</span>
        </div>
      </div>
    </header>
  )
}
