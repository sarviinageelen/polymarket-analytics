import { AlertCircle, Inbox, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LoadingState({ label = "Loading data…", compact = false }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-sm text-muted-foreground ${compact ? "min-h-24" : "min-h-56"}`} role="status" aria-live="polite">
      <LoaderCircle className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, description, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "min-h-32" : "min-h-56"}`}>
      <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><Inbox className="size-5" /></div>
      <h3 className="mt-3 text-sm font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = "Could not load this view", description, onRetry, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "min-h-32" : "min-h-56"}`} role="alert">
      <div className="grid size-10 place-items-center rounded-full bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"><AlertCircle className="size-5" /></div>
      <h3 className="mt-3 text-sm font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {onRetry && <Button variant="outline" className="mt-4 h-9" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
