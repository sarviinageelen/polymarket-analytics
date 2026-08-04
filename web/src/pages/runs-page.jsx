import { useEffect, useMemo, useState } from "react"
import {
  Ban,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  GitCommitHorizontal,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states"
import { StatusBadge } from "@/components/shared/status-badge"
import { apiUrl, buildQuery, formatDate, formatDuration, request } from "@/lib/api"
import { cn } from "@/lib/utils"

const ALL_FILTER = "__all__"

function sportLabel(value) {
  const labels = { wnba_2026: "WNBA 2026", nfl_2025: "NFL 2025" }
  if (!value) return "Unknown dataset"
  return labels[value] || String(value).replaceAll("_", " ").toUpperCase()
}

function readableLabel(value, fallback = "—") {
  if (!value) return fallback
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function badgeStatus(status) {
  if (status === "cancelled") return "warning"
  if (status === "success") return "success"
  if (status === "running") return "running"
  if (status === "failed") return "failed"
  return "neutral"
}

function validationLabel(run) {
  return run?.metrics?.validation_score || run?.validation_score || (run?.full_validation ? "Extended" : "Standard")
}

function publicationLabel(run) {
  if (run?.push?.pushed) return "Published"
  if (run?.push?.reason === "no artifact changes") return "No changes"
  return "Not published"
}

function statusIcon(status, className) {
  if (status === "running") return <LoaderCircle className={cn("animate-spin", className)} />
  if (status === "success") return <Check className={className} />
  if (status === "failed") return <CircleAlert className={className} />
  if (status === "cancelled") return <Ban className={className} />
  return <Clock3 className={className} />
}

function Metric({ label, value, detail, mono = false }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/45 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-medium tabular-nums", mono && "font-mono text-xs")} title={String(value || "")}>
        {value || "—"}
      </p>
      {detail && <p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>{detail}</p>}
    </div>
  )
}

function ActiveRun({ run, currentStep, pending, onCancel, onOpen }) {
  return (
    <Card size="sm" className="border-blue-200 bg-blue-50/60 ring-blue-200 dark:border-blue-900 dark:bg-blue-950/30 dark:ring-blue-900">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" aria-hidden="true">
          <LoaderCircle className="size-4 animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{sportLabel(run?.sport)} refresh is running</p>
            <StatusBadge status="running">In progress</StatusBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {currentStep || run?.current_step || "Starting the pipeline…"} · started {formatDate(run?.started_at_utc)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:self-center">
          <Button variant="ghost" className="h-9" disabled={Boolean(pending)} onClick={onOpen}>View live details</Button>
          <Button variant="outline" className="h-9" disabled={Boolean(pending)} onClick={onCancel}>
            {pending === "cancel" ? <LoaderCircle className="animate-spin" /> : <Ban />}
            {pending === "cancel" ? "Requesting…" : "Cancel safely"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RunMobileCard({ run, onSelect }) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={() => onSelect(run.id)}
      aria-label={`Open details for ${sportLabel(run.sport)} run ${run.id}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{sportLabel(run.sport)}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{formatDate(run.started_at_utc)}</span>
        </span>
        <StatusBadge status={badgeStatus(run.status)}>{readableLabel(run.status)}</StatusBadge>
      </span>
      <span className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
        <span><span className="block text-muted-foreground">Trigger</span><span className="mt-0.5 block font-medium">{readableLabel(run.trigger, "Manual")}</span></span>
        <span><span className="block text-muted-foreground">Duration</span><span className="mt-0.5 block font-medium tabular-nums">{formatDuration(run.duration_seconds)}</span></span>
        <span><span className="block text-muted-foreground">Validation</span><span className="mt-0.5 block font-medium tabular-nums">{validationLabel(run)}</span></span>
      </span>
    </button>
  )
}

function RunsTable({ runs, onSelect }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {runs.map((run) => <RunMobileCard key={run.id} run={run} onSelect={onSelect} />)}
      </div>
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">Recent data refresh runs</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Started</TableHead>
              <TableHead>Dataset</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Checks</TableHead>
              <TableHead>Publication</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <span className="block text-sm font-medium">{formatDate(run.started_at_utc, { timeZoneName: undefined })}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{run.id}</span>
                </TableCell>
                <TableCell className="font-medium">{sportLabel(run.sport)}</TableCell>
                <TableCell><StatusBadge status={badgeStatus(run.status)}>{readableLabel(run.status)}</StatusBadge></TableCell>
                <TableCell>{readableLabel(run.trigger, "Manual")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDuration(run.duration_seconds)}</TableCell>
                <TableCell className="text-right tabular-nums">{validationLabel(run)}</TableCell>
                <TableCell>
                  <span className={cn("inline-flex items-center gap-1.5", run?.push?.pushed && "text-emerald-700 dark:text-emerald-400")}>
                    {run?.push?.pushed && <Check className="size-3.5" aria-hidden="true" />}
                    {publicationLabel(run)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onSelect(run.id)} aria-label={`Open details for run ${run.id}`}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function StepList({ steps }) {
  if (!steps.length) {
    return <EmptyState compact title="No step details" description="This older run does not include per-step records." />
  }

  return (
    <ol className="space-y-1" aria-label="Pipeline steps">
      {steps.map((step, index) => (
        <li key={`${step.name}-${index}`} className="relative flex gap-3 rounded-lg px-2 py-2.5">
          {index < steps.length - 1 && <span className="absolute top-8 bottom-[-10px] left-[18px] w-px bg-border" aria-hidden="true" />}
          <span className={cn(
            "relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground",
            step.status === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950",
            step.status === "failed" && "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950",
            step.status === "running" && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950",
            step.status === "cancelled" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950",
          )} aria-hidden="true">
            {statusIcon(step.status, "size-3")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium">{step.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(step.duration_seconds)}</span>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{readableLabel(step.status, "Pending")}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function LogFilters({ search, setSearch, level, setLevel, step, setStep, steps }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_190px]">
      <div className="space-y-1.5">
        <Label htmlFor="run-log-search" className="text-xs">Search logs</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="run-log-search" className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Message or field" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="run-log-level" className="text-xs">Level</Label>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger id="run-log-level" className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="run-log-step" className="text-xs">Pipeline step</Label>
        <Select value={step} onValueChange={setStep}>
          <SelectTrigger id="run-log-step" className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All steps</SelectItem>
            {steps.map((item, index) => <SelectItem key={`${item.name}-${index}`} value={item.name}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function LogViewer({ logs }) {
  if (!logs.length) {
    return <div className="rounded-lg border"><EmptyState compact title="No matching log entries" description="Clear a filter or try a broader search." /></div>
  }

  return (
    <ScrollArea className="h-80 rounded-lg border bg-zinc-950 text-zinc-100">
      <ol className="divide-y divide-white/10 font-mono text-[11px] leading-5">
        {logs.map((event, index) => (
          <li key={`${event.timestamp_utc || "log"}-${index}`} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[145px_60px_minmax(100px,180px)_1fr] sm:gap-3">
            <time className="text-zinc-500" dateTime={event.timestamp_utc || undefined}>{formatDate(event.timestamp_utc, { year: undefined, timeZoneName: undefined })}</time>
            <span className={cn(
              "w-fit uppercase tracking-wide",
              event.level === "error" ? "text-red-400" : event.level === "warning" ? "text-amber-300" : "text-sky-300",
            )}>{event.level || "info"}</span>
            <span className="truncate text-zinc-400" title={event.step || "No step"}>{event.step || "—"}</span>
            <code className="break-words whitespace-pre-wrap text-zinc-200">{event.message || ""}</code>
          </li>
        ))}
      </ol>
    </ScrollArea>
  )
}

function RunDetails({
  run,
  loading,
  error,
  notice,
  level,
  setLevel,
  step,
  setStep,
  search,
  setSearch,
  actionPending,
  retryDisabled,
  onRetry,
  onCopy,
}) {
  if (loading && !run) return <LoadingState label="Loading run details…" />
  if (error && !run) return <ErrorState title="Could not load this run" description={error} compact />
  if (!run) return null

  const steps = run.steps || []
  const logs = run.logs || []
  const filters = {
    level: level === ALL_FILTER ? "" : level,
    step: step === ALL_FILTER ? "" : step,
    search,
  }
  const visibleLogText = logs.map((event) => (
    `${event.timestamp_utc || ""} [${event.level || "info"}] ${event.step || ""} ${event.message || ""}`.trim()
  )).join("\n")
  const jsonUrl = apiUrl(buildQuery(`/api/runs/${run.id}/logs`, { ...filters, format: "json" }))
  const textUrl = apiUrl(buildQuery(`/api/runs/${run.id}/logs`, { ...filters, format: "text" }))

  return (
    <div className="space-y-6 pb-6">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not update the detail</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert className="border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          <Check />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {run.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Run ended with an error</AlertTitle>
          <AlertDescription className="break-words">{run.error}</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="run-summary-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="run-summary-heading" className="text-sm font-medium">Summary</h3>
          {run.status !== "running" && (
            <Button variant="outline" size="sm" disabled={Boolean(actionPending) || retryDisabled} onClick={onRetry} title={retryDisabled ? "Wait for the active refresh to finish" : undefined}>
              {actionPending === "retry" ? <LoaderCircle className="animate-spin" /> : <Play />}
              {actionPending === "retry" ? "Starting…" : "Run again"}
            </Button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Duration" value={formatDuration(run.duration_seconds)} />
          <Metric label="Validation" value={validationLabel(run)} detail={run.full_validation ? "External comparisons included" : "Local integrity checks"} />
          <Metric label="Publication" value={publicationLabel(run)} detail={run.push?.branch || undefined} />
          <Metric label="Commit" value={run.push?.commit ? String(run.push.commit).slice(0, 7) : "—"} mono />
        </div>
      </section>

      <Separator />

      <section aria-labelledby="run-steps-heading">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 id="run-steps-heading" className="text-sm font-medium">Pipeline steps</h3>
        </div>
        <StepList steps={steps} />
      </section>

      {(run.push?.pushed || run.download_url) && (
        <>
          <Separator />
          <section aria-labelledby="run-output-heading">
            <div className="mb-3 flex items-center gap-2">
              <GitCommitHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
              <h3 id="run-output-heading" className="text-sm font-medium">Published output</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {run.download_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={run.download_url} target="_blank" rel="noreferrer">Open workbook <ExternalLink /></a>
                </Button>
              )}
              {run.push?.commit && <span className="inline-flex h-7 items-center rounded-md bg-muted px-2 font-mono text-xs">{String(run.push.commit).slice(0, 12)}</span>}
            </div>
          </section>
        </>
      )}

      <Separator />

      <section className="space-y-3" aria-labelledby="run-logs-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" aria-hidden="true" />
              <h3 id="run-logs-heading" className="text-sm font-medium">Run logs</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">{logs.length} matching {logs.length === 1 ? "entry" : "entries"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={!logs.length} onClick={() => onCopy(visibleLogText)}><Copy /> Copy</Button>
            <Button asChild variant="outline" size="sm"><a href={jsonUrl} download><Download /> JSONL</a></Button>
            <Button asChild variant="outline" size="sm"><a href={textUrl} download><Download /> Text</a></Button>
          </div>
        </div>
        <LogFilters search={search} setSearch={setSearch} level={level} setLevel={setLevel} step={step} setStep={setStep} steps={steps} />
        {loading && <div className="rounded-lg border"><LoadingState compact label="Filtering logs…" /></div>}
        {!loading && <LogViewer logs={logs} />}
      </section>
    </div>
  )
}

export function RunsPage({ data, error, onRefresh, onCopy }) {
  const runtime = data?.runtime || {}
  const runs = runtime.history || []
  const active = runtime.running ? runtime.last_run : null
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [actionPending, setActionPending] = useState("")
  const [actionError, setActionError] = useState("")
  const [notice, setNotice] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [level, setLevel] = useState(ALL_FILTER)
  const [step, setStep] = useState(ALL_FILTER)
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")

  const outcome = useMemo(() => {
    const completed = runs.filter((run) => run.status !== "running")
    const successes = completed.filter((run) => run.status === "success").length
    return { successes, completed: completed.length }
  }, [runs])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  useEffect(() => {
    if (!selectedRunId) return undefined
    let cancelled = false

    async function loadDetail({ quiet = false } = {}) {
      if (!quiet) setDetailLoading(true)
      setDetailError("")
      try {
        const response = await request(buildQuery(`/api/runs/${selectedRunId}`, {
          level: level === ALL_FILTER ? "" : level,
          step: step === ALL_FILTER ? "" : step,
          search,
        }))
        if (!cancelled) setRunDetail(response.run)
      } catch (cause) {
        if (!cancelled) setDetailError(cause.message || "Could not load this run.")
      } finally {
        if (!cancelled && !quiet) setDetailLoading(false)
      }
    }

    loadDetail()
    const shouldPoll = runtime.running && active?.id === selectedRunId
    const timer = shouldPoll ? window.setInterval(() => loadDetail({ quiet: true }), 3000) : null
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
  }, [selectedRunId, level, step, search, runtime.running, active?.id])

  function selectRun(runId) {
    setSelectedRunId(runId)
    setRunDetail(null)
    setDetailError("")
    setActionError("")
    setNotice("")
    setLevel(ALL_FILTER)
    setStep(ALL_FILTER)
    setSearchDraft("")
    setSearch("")
  }

  function closeDetails() {
    setSelectedRunId(null)
    setRunDetail(null)
    setDetailError("")
  }

  async function refreshHistory() {
    if (!onRefresh) return
    setRefreshing(true)
    setActionError("")
    try {
      await onRefresh()
    } catch (cause) {
      setActionError(cause.message || "Could not refresh run history.")
    } finally {
      setRefreshing(false)
    }
  }

  async function runAction(action, runId) {
    if (!runId) return
    setActionPending(action)
    setActionError("")
    setNotice("")
    try {
      const response = await request(`/api/runs/${runId}/${action}`, { method: "POST", body: "{}" })
      if (action === "cancel") {
        setNotice(response.message || "Cancellation requested. The current step will finish safely.")
      } else {
        setNotice(`A new ${sportLabel(runDetail?.sport)} refresh has started.`)
        closeDetails()
      }
      if (onRefresh) await onRefresh()
    } catch (cause) {
      setActionError(cause.message || `Could not ${action} this run.`)
    } finally {
      setActionPending("")
    }
  }

  async function copyLogs(text) {
    try {
      if (onCopy) await onCopy(text)
      else await navigator.clipboard.writeText(text)
      setNotice("Visible log entries copied.")
    } catch {
      setActionError("The browser could not copy the logs. Download them instead.")
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Run history"
        description="Review refresh outcomes, validation coverage, publication details, and diagnostic logs."
        meta={outcome.completed > 0 && <StatusBadge status={outcome.successes === outcome.completed ? "success" : "neutral"}>{outcome.successes} of {outcome.completed} completed successfully</StatusBadge>}
        actions={(
          <Button variant="outline" className="h-9" onClick={refreshHistory} disabled={!data || refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh history"}
          </Button>
        )}
      />

      {active && (
        <ActiveRun
          run={active}
          currentStep={runtime.current_step}
          pending={actionPending}
          onCancel={() => runAction("cancel", active.id)}
          onOpen={() => selectRun(active.id)}
        />
      )}

      {actionError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert className="border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          <Check />
          <AlertTitle>Update received</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Recent refreshes</CardTitle>
          <CardDescription>The controller keeps the ten most recent run records and up to forty structured log files.</CardDescription>
          {runs.length > 0 && <CardAction><span className="text-xs tabular-nums text-muted-foreground">{runs.length} {runs.length === 1 ? "run" : "runs"}</span></CardAction>}
        </CardHeader>
        <CardContent>
          {!data && !error && <LoadingState label="Loading run history…" />}
          {!data && error && <ErrorState title="Could not load run history" description={error} onRetry={refreshHistory} />}
          {data && !runs.length && <EmptyState title="No runs recorded yet" description="Start a data refresh to create the first audit record." />}
          {data && runs.length > 0 && <RunsTable runs={runs} onSelect={selectRun} />}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedRunId)} onOpenChange={(open) => { if (!open) closeDetails() }}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl lg:max-w-4xl">
          <SheetHeader className="border-b px-5 py-4 pr-14">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>{runDetail ? sportLabel(runDetail.sport) : "Run details"}</SheetTitle>
              {runDetail && <StatusBadge status={badgeStatus(runDetail.status)}>{readableLabel(runDetail.status)}</StatusBadge>}
            </div>
            <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs">{selectedRunId}</span>
              {runDetail?.started_at_utc && <><span aria-hidden="true">·</span><span>{formatDate(runDetail.started_at_utc)}</span></>}
              {runDetail?.trigger && <><span aria-hidden="true">·</span><span>{readableLabel(runDetail.trigger)} trigger</span></>}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <RunDetails
              run={runDetail}
              loading={detailLoading}
              error={detailError || actionError}
              notice={notice}
              level={level}
              setLevel={setLevel}
              step={step}
              setStep={setStep}
              search={searchDraft}
              setSearch={setSearchDraft}
              actionPending={actionPending}
              retryDisabled={Boolean(runtime.running)}
              onRetry={() => runAction("retry", runDetail?.id)}
              onCopy={copyLogs}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
