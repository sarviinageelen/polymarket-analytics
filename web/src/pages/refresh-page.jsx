import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  FileSpreadsheet,
  History,
  Info,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Timer,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Field, SelectField } from "@/components/shared/fields"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { buildRawUrl, formatDate, formatDuration } from "@/lib/api"
import { FALLBACK_SCHEDULE, PIPELINE_STEPS } from "@/lib/constants"
import { cn } from "@/lib/utils"

function validationSummary(validation = {}) {
  const pass = Number(validation.pass || 0)
  const warning = Number(validation.warning || 0)
  const fail = Number(validation.fail || 0)
  const notRun = Number(validation.not_run || 0)
  const total = pass + warning + fail + notRun
  if (fail) return { status: "failed", label: "Needs attention", pass, warning, fail, notRun, total }
  if (warning || notRun) return { status: "partial", label: "Partially checked", pass, warning, fail, notRun, total }
  if (total) return { status: "success", label: "Passed", pass, warning, fail, notRun, total }
  return { status: "neutral", label: "Not available", pass, warning, fail, notRun, total }
}

function latestRunFor(runtime, sport) {
  return [runtime?.last_run, ...(runtime?.history || [])]
    .find((run) => run?.sport === sport && run?.status !== "running") || null
}

function scheduleFor(data, dataset) {
  const nested = data?.config?.schedules?.[dataset?.id]
  const attached = dataset?.schedule
  if (nested || attached) return { ...FALLBACK_SCHEDULE, ...(nested || attached), next_run_at: attached?.next_run_at || data?.runtime?.next_runs?.[dataset?.id] }

  const legacy = data?.config
  if (legacy?.sport === dataset?.id) {
    return {
      ...FALLBACK_SCHEDULE,
      interval_value: legacy.interval_value,
      interval_unit: legacy.interval_unit,
      enabled: legacy.enabled,
      auto_push: legacy.auto_push,
      full_validation: legacy.full_validation,
      next_run_at: data?.runtime?.next_run_at,
    }
  }
  return { ...FALLBACK_SCHEDULE, next_run_at: null }
}

function cadenceLabel(schedule) {
  const value = Number(schedule.interval_value || 1)
  const unit = String(schedule.interval_unit || "hours")
  const readableUnit = value === 1 ? unit.replace(/s$/, "") : unit
  return `Every ${value} ${readableUnit}`
}

function runStatus(status) {
  if (status === "success") return "success"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "warning"
  if (status === "running") return "running"
  return "neutral"
}

function runLabel(status) {
  if (!status) return "No runs"
  return String(status).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ValidationOption({ checked, icon: Icon, title, description, tag, onClick, disabled }) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        checked ? "border-foreground bg-muted/50 ring-1 ring-foreground" : "border-border hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
      aria-pressed={checked}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background ring-1 ring-border"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{title}<span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-normal text-foreground/70">{tag}</span></span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className={cn("mt-0.5 grid size-4 place-items-center rounded-full border", checked && "border-foreground bg-foreground text-background")} aria-hidden="true">
        {checked && <Check className="size-3" />}
      </span>
    </button>
  )
}

function PipelineProgress({ runtime, run }) {
  const [open, setOpen] = useState(Boolean(runtime.running || run?.status === "failed"))
  const records = useMemo(() => new Map((run?.steps || []).map((step) => [step.name, step])), [run])
  const activeIndex = PIPELINE_STEPS.findIndex(([name]) => name === runtime.current_step)

  useEffect(() => {
    if (runtime.running || run?.status === "failed") setOpen(true)
  }, [runtime.running, run?.id, run?.status])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-4">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="h-9 w-full justify-between px-2">
          <span className="flex items-center gap-2">
            {runtime.running ? <LoaderCircle className="animate-spin" /> : run?.status === "failed" ? <CircleAlert className="text-red-600" /> : run ? <CheckCircle2 className="text-emerald-600" /> : <Clock3 className="text-muted-foreground" />}
            {runtime.running ? runtime.current_step || "Starting refresh…" : run?.status === "failed" ? "The last refresh needs attention" : run ? "Last refresh completed" : "No refresh recorded"}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">{PIPELINE_STEPS.length} steps <ChevronDown className={cn("transition-transform", open && "rotate-180")} /></span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PIPELINE_STEPS.map(([name, detail], index) => {
            const record = records.get(name)
            const active = runtime.running && index === activeIndex
            const status = record?.status || (active ? "running" : runtime.running && activeIndex > index ? "success" : "pending")
            return (
              <div key={name} className="flex items-start gap-2 rounded-lg px-2 py-2">
                <span className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-muted-foreground",
                  status === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
                  status === "failed" && "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300",
                  status === "running" && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300",
                )}>
                  {status === "success" ? <Check className="size-3" /> : status === "failed" ? <CircleAlert className="size-3" /> : status === "running" ? <LoaderCircle className="size-3 animate-spin" /> : <span className="size-1 rounded-full bg-current" />}
                </span>
                <span className="min-w-0"><span className="block text-xs font-medium">{name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ScheduleOverview({ data, selectedSport, runtime, onSelectSport, onViewLogs }) {
  const sports = data?.sports || []
  const activeCount = sports.filter((item) => scheduleFor(data, item).enabled).length

  function rowData(item) {
    const schedule = scheduleFor(data, item)
    const activeRun = runtime.running && runtime.last_run?.sport === item.id ? runtime.last_run : null
    const latestRun = activeRun || latestRunFor(runtime, item.id)
    const health = validationSummary(item.validation)
    return { schedule, latestRun, health }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Dataset schedules</CardTitle>
        <CardDescription>Automation, data health, and the latest run for every sport and season.</CardDescription>
        <CardAction><StatusBadge status={activeCount ? "success" : "neutral"}>{activeCount} active</StatusBadge></CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 md:hidden">
          {sports.map((item) => {
            const { schedule, latestRun, health } = rowData(item)
            const selected = item.id === selectedSport
            return (
              <div key={item.id} className={cn("rounded-xl border p-3", selected && "border-foreground/25 bg-muted/35")}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-medium">{item.label}</p><p className="mt-0.5 text-xs text-muted-foreground">Full-time moneyline</p></div>
                  <StatusBadge status={schedule.enabled ? "success" : "neutral"}>{schedule.enabled ? "On" : "Paused"}</StatusBadge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 text-xs">
                  <div><dt className="text-muted-foreground">Cadence</dt><dd className="mt-0.5 font-medium">{cadenceLabel(schedule)}</dd></div>
                  <div><dt className="text-muted-foreground">Next run</dt><dd className="mt-0.5 font-medium">{schedule.enabled ? formatDate(schedule.next_run_at, { timeZoneName: undefined }) : "Not scheduled"}</dd></div>
                  <div><dt className="text-muted-foreground">Latest run</dt><dd className="mt-0.5 flex items-center gap-1.5 font-medium"><span className={cn("size-1.5 rounded-full", latestRun?.status === "success" ? "bg-emerald-500" : latestRun?.status === "failed" ? "bg-red-500" : "bg-muted-foreground")} />{runLabel(latestRun?.status)}</dd></div>
                  <div><dt className="text-muted-foreground">Data health</dt><dd className="mt-0.5 font-medium tabular-nums">{health.total ? `${health.pass}/${health.total} passed` : "Not available"}</dd></div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant={selected ? "secondary" : "outline"} onClick={() => onSelectSport(item.id)}>Configure</Button>
                  <Button size="sm" variant="ghost" onClick={() => onViewLogs(item.id)}><History />Logs</Button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="hidden md:block">
          <Table>
            <caption className="sr-only">Refresh schedule and run status by dataset</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Dataset</TableHead>
                <TableHead>Automation</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Latest run</TableHead>
                <TableHead>Data health</TableHead>
                <TableHead>Publishing</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sports.map((item) => {
                const { schedule, latestRun, health } = rowData(item)
                const selected = item.id === selectedSport
                return (
                  <TableRow key={item.id} data-state={selected ? "selected" : undefined}>
                    <TableCell><span className="block font-medium">{item.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">Full-time moneyline</span></TableCell>
                    <TableCell><StatusBadge status={schedule.enabled ? "success" : "neutral"}>{schedule.enabled ? "On" : "Paused"}</StatusBadge><span className="mt-1 block text-xs text-muted-foreground">{cadenceLabel(schedule)}</span></TableCell>
                    <TableCell><span className="block text-sm font-medium">{schedule.enabled ? formatDate(schedule.next_run_at, { year: undefined, timeZoneName: undefined }) : "Not scheduled"}</span></TableCell>
                    <TableCell>{latestRun ? <><StatusBadge status={runStatus(latestRun.status)}>{runLabel(latestRun.status)}</StatusBadge><span className="mt-1 block text-xs text-muted-foreground">{formatDate(latestRun.finished_at_utc || latestRun.started_at_utc, { year: undefined, timeZoneName: undefined })} · {formatDuration(latestRun.duration_seconds)}</span></> : <span className="text-muted-foreground">No runs</span>}</TableCell>
                    <TableCell><span className="font-medium tabular-nums">{health.total ? `${health.pass}/${health.total}` : "—"}</span><span className="mt-1 block text-xs text-muted-foreground">{health.label}</span></TableCell>
                    <TableCell><span className="font-medium">{schedule.auto_push ? "GitHub on" : "Local only"}</span><span className="mt-1 block text-xs text-muted-foreground">{schedule.full_validation ? "Extended checks" : "Standard checks"}</span></TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant={selected ? "secondary" : "ghost"} onClick={() => onSelectSport(item.id)}>Configure</Button><Button size="icon-sm" variant="ghost" onClick={() => onViewLogs(item.id)} aria-label={`View ${item.label} logs`}><History /></Button></div></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function WorkbookCard({ selected, validation, repository, branch }) {
  const validationUrl = buildRawUrl(repository, branch, `reports/${selected?.id}_validation.json`)
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Workbook</CardTitle>
        <CardDescription>Latest downloadable analysis.</CardDescription>
        <CardAction><StatusBadge status={selected?.workbook?.exists ? "success" : "neutral"}>{selected?.workbook?.exists ? "Ready" : "Missing"}</StatusBadge></CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"><FileSpreadsheet className="size-4" /></span>
          <div className="min-w-0"><p className="truncate text-sm font-medium">{selected?.workbook?.name || "Workbook not generated"}</p><p className="mt-0.5 text-xs text-muted-foreground">Generated {formatDate(selected?.generated_at_utc, { timeZoneName: undefined })}</p></div>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {selected?.workbook?.download_url && selected?.workbook?.exists && <Button asChild variant="outline" className="h-9"><a href={selected.workbook.download_url} target="_blank" rel="noreferrer">Open Excel <Download /></a></Button>}
          {validationUrl && <Button asChild variant="ghost" className="h-9"><a href={validationUrl} target="_blank" rel="noreferrer">Validation <ArrowUpRight /></a></Button>}
        </div>
      </CardContent>
    </Card>
  )
}

function HealthCard({ validation }) {
  const summary = validationSummary(validation)
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Data health</CardTitle>
        <CardDescription>Latest validation coverage.</CardDescription>
        <CardAction><StatusBadge status={summary.status}>{summary.label}</StatusBadge></CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight tabular-nums">{summary.total ? `${summary.pass}/${summary.total}` : "—"}</span><span className="text-xs text-muted-foreground">checks passed</span></div>
        <dl className="mt-auto grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Pass</dt><dd className="mt-1 font-medium tabular-nums">{summary.pass}</dd></div>
          <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Warn</dt><dd className="mt-1 font-medium tabular-nums">{summary.warning}</dd></div>
          <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Fail</dt><dd className="mt-1 font-medium tabular-nums">{summary.fail}</dd></div>
          <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Skipped</dt><dd className="mt-1 font-medium tabular-nums">{summary.notRun}</dd></div>
        </dl>
      </CardContent>
    </Card>
  )
}

function LatestRunCard({ selected, run, onViewLogs }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Latest run</CardTitle>
        <CardDescription>Most recent pipeline outcome.</CardDescription>
        {run && <CardAction><StatusBadge status={runStatus(run.status)}>{runLabel(run.status)}</StatusBadge></CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {run ? <div><p className="text-sm font-medium">{selected?.label} refresh</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(run.finished_at_utc || run.started_at_utc)} · {formatDuration(run.duration_seconds)}</p><p className="mt-2 text-xs text-muted-foreground">{run.push?.pushed ? `Published commit ${String(run.push.commit || "").slice(0, 7)}` : run.push?.reason || "No GitHub publication recorded"}</p></div> : <p className="text-sm text-muted-foreground">No refresh has been recorded for this dataset.</p>}
        <Button className="mt-auto w-fit" size="sm" variant="ghost" onClick={onViewLogs}><History />View logs</Button>
      </CardContent>
    </Card>
  )
}

export function RefreshPage({
  data,
  selected,
  form,
  setField,
  runtime,
  runNow,
  starting,
  saveSchedule,
  saving,
  formDirty,
  onSelectSport,
  onViewLogs,
}) {
  const activeRun = runtime.running ? runtime.last_run : null
  const selectedRun = latestRunFor(runtime, selected?.id)
  const activeSport = data?.sports?.find((item) => item.id === activeRun?.sport)
  const activeLabel = activeSport?.label || activeRun?.sport || "Refresh"
  const activeMatchesSelection = activeRun?.sport === selected?.id
  const pipelineRuntime = activeMatchesSelection ? runtime : { ...runtime, running: false, current_step: null }
  const pipelineRun = activeMatchesSelection ? activeRun : selectedRun
  const selectedSchedule = scheduleFor(data, selected)
  const disabled = !data || runtime.running || starting

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refresh data"
        description="Manage manual updates and automation for every sports dataset from one place."
        meta={<StatusBadge status={selectedSchedule.enabled ? "success" : "neutral"}>{selected?.label} · {selectedSchedule.enabled ? "scheduled" : "paused"}</StatusBadge>}
      />

      {runtime.running && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          <LoaderCircle className="animate-spin" />
          <AlertTitle>{activeLabel} refresh in progress</AlertTitle>
          <AlertDescription>{runtime.current_step || "Starting the pipeline…"}{!activeMatchesSelection ? ` You are currently viewing ${selected?.label}.` : ""}</AlertDescription>
        </Alert>
      )}

      <ScheduleOverview data={data} selectedSport={selected?.id} runtime={runtime} onSelectSport={onSelectSport} onViewLogs={onViewLogs} />

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Manual refresh</CardTitle>
            <CardDescription>Fetch and rebuild {selected?.label} now.</CardDescription>
            {runtime.running && <CardAction><StatusBadge status="running">{activeMatchesSelection ? "Working" : `${activeLabel} is running`}</StatusBadge></CardAction>}
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-medium">Validation depth</p>
              <div className="grid gap-2 md:grid-cols-2">
                <ValidationOption checked={!form.full_validation} icon={Timer} title="Standard validation" tag="Recommended" description="Fast integrity checks across local snapshots and the database." disabled={disabled} onClick={() => setField("full_validation", false)} />
                <ValidationOption checked={Boolean(form.full_validation)} icon={ShieldCheck} title="Extended validation" tag="Slower" description="Adds Gamma, CLOB, ESPN, and Polygon comparisons." disabled={disabled} onClick={() => setField("full_validation", true)} />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
              <span><strong className="font-medium text-foreground">Trade collection is identical.</strong> Extended validation adds external comparisons; it does not fetch different trades.</span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button className="h-11 px-4 text-sm" onClick={runNow} disabled={disabled}>
                {runtime.running || starting ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                {runtime.running ? `${activeLabel} running` : `Refresh ${selected?.label}`}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">Settled markets reuse the local cache; open markets refresh.</p>
            </div>

            <PipelineProgress runtime={pipelineRuntime} run={pipelineRun} />
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Schedule {selected?.label}</CardTitle>
            <CardDescription>These settings apply only to this dataset.</CardDescription>
            <CardAction><StatusBadge status={form.enabled ? "success" : "neutral"}>{form.enabled ? "On" : "Paused"}</StatusBadge></CardAction>
          </CardHeader>
          <CardContent className="flex h-full flex-col gap-5">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
              <div><p className="text-xs text-muted-foreground">Next scheduled run</p><p className="mt-0.5 text-sm font-medium">{form.enabled ? formatDate(selectedSchedule.next_run_at) : "Not scheduled"}</p></div>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-medium">Automatic refreshes</p><p className="mt-1 text-xs text-muted-foreground">Run {selected?.label} on a repeating cadence.</p></div>
              <Switch checked={Boolean(form.enabled)} onCheckedChange={(checked) => setField("enabled", checked)} aria-label={`Enable ${selected?.label} automatic refreshes`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Run every" htmlFor={`refresh-interval-${selected?.id}`}><Input id={`refresh-interval-${selected?.id}`} className="h-10" type="number" min="1" max="10080" value={form.interval_value} onChange={(event) => setField("interval_value", event.target.value)} disabled={!form.enabled} /></Field>
              <SelectField label="Unit" value={form.interval_unit} onValueChange={(value) => setField("interval_unit", value)} options={["minutes", "hours"]} disabled={!form.enabled} />
            </div>
            <Separator />
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-medium">Publish to GitHub</p><p className="mt-1 text-xs text-muted-foreground">Push the latest workbook and validation report.</p></div>
              <Switch checked={Boolean(form.auto_push)} onCheckedChange={(checked) => setField("auto_push", checked)} aria-label={`Publish ${selected?.label} refreshes to GitHub`} />
            </div>
            <div className="mt-auto space-y-2">
              <Button variant="outline" className="h-10 w-full" onClick={saveSchedule} disabled={saving || !formDirty}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}Save {selected?.label} schedule</Button>
              <p className="text-center text-xs text-muted-foreground">{form.full_validation ? "Extended" : "Standard"} validation will be used for scheduled runs.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <WorkbookCard selected={selected} validation={selected?.validation || {}} repository={data?.project?.repository} branch={data?.project?.push_branch || data?.project?.branch} />
        <HealthCard validation={selected?.validation || {}} />
        <LatestRunCard selected={selected} run={selectedRun} onViewLogs={() => onViewLogs(selected?.id)} />
      </div>
    </div>
  )
}
