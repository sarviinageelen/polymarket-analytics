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
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Timer,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Field, SelectField } from "@/components/shared/fields"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { buildRawUrl, formatDate, formatDuration, formatNumber } from "@/lib/api"
import { PIPELINE_STEPS } from "@/lib/constants"
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
                  status === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  status === "failed" && "border-red-200 bg-red-50 text-red-700",
                  status === "running" && "border-blue-200 bg-blue-50 text-blue-700",
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

function WorkbookCard({ selected, validation, repository, branch }) {
  const validationUrl = buildRawUrl(repository, branch, `reports/${selected?.id}_validation.json`)
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><FileSpreadsheet className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selected?.workbook?.name || "Workbook not generated"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Generated {formatDate(selected?.generated_at_utc)} · {validation.pass || 0} checks passed</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {validationUrl && <Button asChild variant="ghost" className="h-9"><a href={validationUrl} target="_blank" rel="noreferrer">Validation <ArrowUpRight /></a></Button>}
          {selected?.workbook?.download_url && selected?.workbook?.exists && <Button asChild variant="outline" className="h-9"><a href={selected.workbook.download_url} target="_blank" rel="noreferrer">Open Excel <Download /></a></Button>}
        </div>
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
}) {
  const summary = validationSummary(selected?.validation)
  const activeRun = runtime.running ? runtime.last_run : null
  const selectedRun = [runtime.last_run, ...(runtime.history || [])].find((item) => item?.sport === selected?.id && item?.status !== "running") || null
  const activeSport = data?.sports?.find((item) => item.id === activeRun?.sport)
  const activeLabel = activeSport?.label || activeRun?.sport || "Refresh"
  const activeMatchesSelection = activeRun?.sport === selected?.id
  const pipelineRuntime = activeMatchesSelection ? runtime : { ...runtime, running: false, current_step: null }
  const pipelineRun = activeMatchesSelection ? activeRun : selectedRun
  const disabled = !data || runtime.running || starting

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refresh data"
        description={`Fetch new ${selected?.label || "sports"} trades, rebuild the local analysis, validate the result, and publish the workbook.`}
        meta={<StatusBadge status={runtime.running ? "running" : selectedRun?.status || "neutral"}>{runtime.running ? `${activeLabel} running` : selectedRun?.status === "success" ? `Last completed ${formatDate(selectedRun.finished_at_utc)}` : "Ready"}</StatusBadge>}
      />

      {runtime.running && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-900">
          <LoaderCircle className="animate-spin" />
          <AlertTitle>{activeLabel} refresh in progress</AlertTitle>
          <AlertDescription>{runtime.current_step || "Starting the pipeline…"}{!activeMatchesSelection ? ` You are currently viewing ${selected?.label}.` : ""}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Refresh {selected?.label}</CardTitle>
              <CardDescription>The same trade data is fetched in both validation modes.</CardDescription>
              {runtime.running && <CardAction><StatusBadge status="running">{activeMatchesSelection ? "Working" : `${activeLabel} is running`}</StatusBadge></CardAction>}
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-medium">Validation depth</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <ValidationOption checked={!form.full_validation} icon={Timer} title="Standard validation" tag="Recommended" description="Fast integrity checks across the local snapshots and database." disabled={disabled} onClick={() => setField("full_validation", false)} />
                  <ValidationOption checked={Boolean(form.full_validation)} icon={ShieldCheck} title="Extended validation" tag="Slower" description="Adds Gamma, CLOB, ESPN, and Polygon comparisons after the refresh." disabled={disabled} onClick={() => setField("full_validation", true)} />
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
                <span><strong className="font-medium text-foreground">Trade collection is identical.</strong> Extended validation adds external comparisons; it does not fetch a different set of trades.</span>
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

          <WorkbookCard selected={selected} validation={selected?.validation || {}} repository={data?.project?.repository} branch={data?.project?.push_branch || data?.project?.branch} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automation</CardTitle>
              <CardDescription>Schedule refreshes while this server is online.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <SelectField label="Scheduled dataset" value={form.sport || selected?.id} onValueChange={(value) => setField("sport", value)} options={(data?.sports || []).map((item) => ({ value: item.id, label: item.label }))} hint="This setting is separate from the dataset you are currently viewing." />
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-medium">Automatic refreshes</p><p className="mt-1 text-xs text-muted-foreground">Run the selected dataset on a cadence.</p></div>
                <Switch checked={Boolean(form.enabled)} onCheckedChange={(checked) => setField("enabled", checked)} aria-label="Enable automatic refreshes" />
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-3">
                <Field label="Run every" htmlFor="refresh-interval"><Input id="refresh-interval" className="h-10" type="number" min="1" max="10080" value={form.interval_value} onChange={(event) => setField("interval_value", event.target.value)} disabled={!form.enabled} /></Field>
                <SelectField label="Unit" value={form.interval_unit} onValueChange={(value) => setField("interval_unit", value)} options={["minutes", "hours"]} disabled={!form.enabled} />
              </div>
              <Separator />
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-medium">Publish to GitHub</p><p className="mt-1 text-xs text-muted-foreground">Push the workbook and validation report.</p></div>
                <Switch checked={Boolean(form.auto_push)} onCheckedChange={(checked) => setField("auto_push", checked)} aria-label="Enable automatic GitHub publishing" />
              </div>
              <Button variant="outline" className="h-9 w-full" onClick={saveSchedule} disabled={saving || !formDirty}>{saving ? <LoaderCircle className="animate-spin" /> : null}Save schedule</Button>
              <div className="flex items-start gap-2 rounded-lg border p-3"><CalendarClock className="mt-0.5 size-4 text-muted-foreground" /><span><span className="block text-xs text-muted-foreground">Next scheduled run</span><span className="mt-0.5 block text-sm font-medium">{form.enabled ? formatDate(runtime.next_run_at) : "Scheduler paused"}</span></span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data health</CardTitle>
              <CardDescription>Exact status counts from the latest validation report.</CardDescription>
              <CardAction><StatusBadge status={summary.status}>{summary.label}</StatusBadge></CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight tabular-nums">{summary.total ? `${summary.pass}/${summary.total}` : "—"}</span><span className="text-xs text-muted-foreground">checks passed</span></div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/50 p-2.5"><span className="block text-xs text-muted-foreground">Passed</span><span className="mt-0.5 block font-medium tabular-nums">{summary.pass}</span></div>
                <div className="rounded-lg bg-muted/50 p-2.5"><span className="block text-xs text-muted-foreground">Warnings</span><span className="mt-0.5 block font-medium tabular-nums">{summary.warning}</span></div>
                <div className="rounded-lg bg-muted/50 p-2.5"><span className="block text-xs text-muted-foreground">Failed</span><span className="mt-0.5 block font-medium tabular-nums">{summary.fail}</span></div>
                <div className="rounded-lg bg-muted/50 p-2.5"><span className="block text-xs text-muted-foreground">Not run</span><span className="mt-0.5 block font-medium tabular-nums">{summary.notRun}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Latest run</CardTitle>
              {selectedRun && <CardAction><StatusBadge status={selectedRun.status}>{selectedRun.status}</StatusBadge></CardAction>}
            </CardHeader>
            <CardContent>
              {selectedRun ? <div className="space-y-2 text-sm"><p className="font-medium">{selected?.label} refresh {selectedRun.status}</p><p className="text-xs text-muted-foreground">{formatDate(selectedRun.finished_at_utc || selectedRun.started_at_utc)} · {formatDuration(selectedRun.duration_seconds)}</p>{selectedRun.push?.pushed && <p className="text-xs text-muted-foreground">Published commit {String(selectedRun.push.commit || "").slice(0, 7)}</p>}</div> : <p className="text-sm text-muted-foreground">No refresh has been recorded for this dataset.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
