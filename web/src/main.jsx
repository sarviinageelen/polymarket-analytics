import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowClockwise,
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  ChartLine,
  CheckCircle,
  ClockCountdown,
  CloudArrowUp,
  Database,
  DownloadSimple,
  FileXls,
  GithubLogo,
  Info,
  Lightning,
  Pulse,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  WarningCircle,
} from "@phosphor-icons/react";
import { Badge, Button, Input, LayerCard, Switch } from "@cloudflare/kumo";
import "@cloudflare/kumo/styles/standalone";
import "./styles.css";

const API_BASE = (window.__POLYMARKET_API__ || "").replace(/\/$/, "");

const FALLBACK_CONFIG = {
  sport: "wnba_2026",
  interval_value: 6,
  interval_unit: "hours",
  enabled: false,
  auto_push: true,
  full_validation: false,
};

const FALLBACK_SPORTS = [
  { id: "wnba_2026", label: "WNBA 2026" },
  { id: "nfl_2025", label: "NFL 2025" },
];

const PIPELINE_STEPS = [
  ["Refresh event metadata", "Gamma event list"],
  ["Fetch and persist trades", "Parquet bronze layer"],
  ["Rebuild local DuckDB", "Silver analytical layer"],
  ["Recalculate bettor analysis", "Wallet/game ledgers"],
  ["Export Excel workbook", "Downloadable report"],
  ["Validate the refreshed snapshot", "Local + external checks"],
  ["Commit and push updated artifacts", "GitHub publication"],
];

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US").format(Number(value));
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const value = Number(seconds);
  if (value < 60) return `${Math.round(value)} sec`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function badgeVariant(status) {
  if (status === "success" || status === "online") return "success";
  if (status === "failed" || status === "offline") return "error";
  if (status === "running") return "info";
  return "warning";
}

function buildRawUrl(repository, branch, path) {
  if (!repository || !branch) return null;
  return `https://github.com/${repository}/raw/refs/heads/${encodeURIComponent(branch).replace(/%2F/g, "/")}/${path}`;
}

function Kicker({ children }) {
  return <span className="kicker">{children}</span>;
}

function StatusBadge({ status, children }) {
  return <Badge variant={badgeVariant(status)} appearance="dot">{children}</Badge>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon"><Icon size={19} weight="bold" /></div>
      <div className="metric-content">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
        <span className="metric-detail">{detail}</span>
      </div>
    </article>
  );
}

function PanelHeader({ kicker, title, description, icon: Icon, children }) {
  return (
    <div className="panel-header">
      <div className="panel-heading-copy">
        <div className="panel-title-row">
          {Icon && <span className="panel-title-icon"><Icon size={18} weight="bold" /></span>}
          <Kicker>{kicker}</Kicker>
        </div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

function ModeOption({ active, icon: Icon, title, description, badge, onClick }) {
  return (
    <button type="button" className={`mode-option ${active ? "is-selected" : ""}`} aria-pressed={active} onClick={onClick}>
      <span className="mode-option-icon"><Icon size={19} weight="bold" /></span>
      <span className="mode-option-copy">
        <span className="mode-option-title">{title}{badge && <Badge variant="success">{badge}</Badge>}</span>
        <span className="mode-option-description">{description}</span>
      </span>
      <span className="mode-radio" aria-hidden="true"><span /></span>
    </button>
  );
}

function PipelineSteps({ runtime }) {
  const activeIndex = PIPELINE_STEPS.findIndex(([name]) => name === runtime?.current_step);
  const isRunning = Boolean(runtime?.running);
  const isComplete = !isRunning && runtime?.last_run?.status === "success";

  return (
    <div className="pipeline-list" aria-label="Refresh pipeline progress">
      {PIPELINE_STEPS.map(([name, detail], index) => {
        const active = isRunning && index === activeIndex;
        const complete = isComplete || (isRunning && activeIndex > -1 && index < activeIndex);
        return (
          <div className={`pipeline-step ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`} key={name}>
            <span className="pipeline-marker">
              {active ? <ArrowClockwise className="spin" size={14} /> : complete ? <CheckCircle size={15} /> : <span />}
            </span>
            <span className="pipeline-copy"><strong>{name}</strong><small>{detail}</small></span>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(FALLBACK_CONFIG);
  const [formDirty, setFormDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await request("/api/status");
        if (cancelled) return;
        setData(response);
        setError("");
        if (!formDirty && response.config) setForm(response.config);
      } catch (cause) {
        if (!cancelled) setError(cause.message || "The local controller is unavailable.");
      }
    }
    load();
    const timer = window.setInterval(load, data?.runtime?.running ? 3000 : 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [data?.runtime?.running, formDirty]);

  const sports = data?.sports?.length ? data.sports : FALLBACK_SPORTS;
  const selected = useMemo(
    () => sports.find((sport) => sport.id === form.sport) || sports[0],
    [sports, form.sport],
  );
  const runtime = data?.runtime || {};
  const lastRun = runtime.last_run;
  const lastRunForSelected = lastRun?.sport === selected?.id ? lastRun : null;
  const validation = selected?.validation || {};
  const counts = selected?.counts || {};
  const downloadUrl = selected?.workbook?.download_url;
  const validationUrl = buildRawUrl(data?.project?.repository, data?.project?.branch, `reports/${selected?.id}_validation.json`);
  const controllerStatus = error ? "offline" : runtime.running ? "running" : "online";
  const qualityStatus = validation.fail > 0 ? "failed" : validation.not_run > 0 ? "partial" : validation.pass > 0 ? "passed" : "unknown";
  const qualityLabel = qualityStatus === "failed" ? "Needs attention" : qualityStatus === "partial" ? "Partially checked" : qualityStatus === "passed" ? "All checks passed" : "No report yet";
  const externalStatus = validation.not_run > 0 ? "Partial" : validation.fail > 0 ? "Failed" : validation.pass > 0 ? "Passed" : "Not available";

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setFormDirty(true);
    setNotice("");
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      const response = await request("/api/config", { method: "POST", body: JSON.stringify(form) });
      setForm(response.config);
      setFormDirty(false);
      setNotice(response.config.enabled ? "Schedule saved. The next run is queued." : "Schedule paused.");
      setError("");
      setData(await request("/api/status"));
    } catch (cause) {
      setError(cause.message || "Could not save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setStarting(true);
    try {
      const response = await request("/api/run", {
        method: "POST",
        body: JSON.stringify({ sport: form.sport, full_validation: form.full_validation }),
      });
      setNotice(`${selected?.label || "Refresh"} started${response.run_id ? ` · run ${response.run_id}` : ""}.`);
      setError("");
      setData(await request("/api/status"));
    } catch (cause) {
      setError(cause.message || "Could not start the refresh.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-lockup">
            <div className="brand-mark"><span /></div>
            <div><strong>Polymarket Analytics</strong><small>Operations control center</small></div>
          </div>
          <div className="topbar-actions">
            {data?.project?.repository && (
              <a className="repo-link" href={`https://github.com/${data.project.repository}`} target="_blank" rel="noreferrer">
                <GithubLogo size={16} /><span>{data.project.repository}</span><ArrowUpRight size={13} />
              </a>
            )}
            <StatusBadge status={controllerStatus}>
              {controllerStatus === "offline" ? "Controller offline" : controllerStatus === "running" ? "Refresh running" : "Controller online"}
            </StatusBadge>
          </div>
        </div>
      </header>

      <main className="page-wrap">
        <section className="page-heading">
          <div>
            <Kicker>DATA OPERATIONS</Kicker>
            <h1>Refresh, verify, publish.</h1>
            <p className="page-lede">Run the sports pipeline from one place. The system saves the API snapshot locally, rebuilds the analysis, validates the result, and can publish the workbook to GitHub.</p>
          </div>
          <div className="last-check-card">
            <span className="last-check-icon"><Pulse size={19} weight="bold" /></span>
            <span><small>Last controller check</small><strong>{formatDate(data?.controller?.now_utc)}</strong></span>
          </div>
        </section>

        <section className="dataset-bar" aria-label="Active dataset">
          <div className="dataset-bar-title"><span className="dataset-bar-icon"><Database size={18} weight="bold" /></span><span><small>ACTIVE DATASET</small><strong>{selected?.label || "—"}</strong></span></div>
          <span className="dataset-scope">Full-time moneyline</span>
          <div className="dataset-meta"><span><small>Snapshot</small><strong>{formatDate(selected?.generated_at_utc)}</strong></span><span><small>Branch</small><strong>{data?.project?.branch || "—"}</strong></span></div>
        </section>

        {error && <div className="alert alert-error" role="alert"><WarningCircle size={19} /><span>{error}</span></div>}
        {notice && <div className="alert alert-success" role="status"><CheckCircle size={19} /><span>{notice}</span></div>}

        <section className="metrics-grid" aria-label="Dataset overview">
          <MetricCard label="Markets" value={formatNumber(counts.markets)} detail={`${formatNumber(counts.resolved_markets)} resolved`} icon={Database} tone="orange" />
          <MetricCard label="Canonical trades" value={formatNumber(counts.trade_rows)} detail="Deduplicated analytical rows" icon={CloudArrowUp} tone="blue" />
          <MetricCard label="Wallets" value={formatNumber(counts.bettors)} detail="Wallets with trades" icon={ChartLine} tone="violet" />
          <MetricCard label="Candidates" value={formatNumber(counts.candidates_5games_70pct)} detail="5+ games · 70% win rate" icon={CheckCircle} tone="green" />
        </section>

        <section className="primary-grid">
          <LayerCard className="panel update-panel">
            <PanelHeader
              kicker="PRIMARY ACTION · 1 / 3"
              title="Run a data update"
              description="Choose the dataset and verification depth, then start the cache-first refresh."
              icon={Lightning}
            >
              {runtime.running && <StatusBadge status="running">Working now</StatusBadge>}
            </PanelHeader>

            <div className="field-block">
              <label className="field-label" htmlFor="dataset-select">Dataset</label>
              <select id="dataset-select" className="native-select" value={form.sport} onChange={(event) => setField("sport", event.target.value)} disabled={runtime.running}>
                {sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.label}</option>)}
              </select>
              <span className="field-helper">Only full-game moneyline markets are collected.</span>
            </div>

            <div className="field-block validation-block">
              <div className="field-label">Verification depth</div>
              <div className="mode-grid">
                <ModeOption
                  active={!form.full_validation}
                  icon={Timer}
                  title="Local checks"
                  description="Fast checks across Parquet, DuckDB, analysis, and Excel."
                  badge="Routine"
                  onClick={() => !runtime.running && setField("full_validation", false)}
                />
                <ModeOption
                  active={Boolean(form.full_validation)}
                  icon={ShieldCheck}
                  title="Full external checks"
                  description="Adds Gamma, CLOB, ESPN, and Polygon comparisons."
                  badge="Before publish"
                  onClick={() => !runtime.running && setField("full_validation", true)}
                />
              </div>
              <div className="info-callout"><Info size={16} weight="bold" /><span><strong>Both modes fetch the same trades.</strong> Full checks only add a slower, broader quality review afterward.</span></div>
            </div>

            <div className="update-action-row">
              <Button type="button" variant="primary" size="lg" onClick={runNow} loading={starting || runtime.running} disabled={starting || runtime.running}>
                <ArrowRight size={18} weight="bold" /> Update {selected?.label || "dataset"}
              </Button>
              <span className="action-helper"><ArrowClockwise size={14} /> Settled markets use the local cache; open markets refresh.</span>
            </div>

            <div className="pipeline-heading">
              <div><Kicker>LIVE PIPELINE</Kicker><h3>{runtime.running ? runtime.current_step || "Starting refresh…" : lastRunForSelected?.status === "success" ? "Ready for the next update" : "Waiting for an update"}</h3></div>
              <span className={`pipeline-state ${runtime.running ? "running" : lastRunForSelected?.status === "success" ? "success" : lastRunForSelected?.status === "failed" ? "failed" : ""}`}>{runtime.running ? "In progress" : lastRunForSelected?.status === "success" ? "Complete" : lastRunForSelected?.status === "failed" ? "Needs attention" : "Idle"}</span>
            </div>
            <PipelineSteps runtime={{ ...runtime, last_run: lastRunForSelected }} />
          </LayerCard>

          <div className="side-stack">
            <LayerCard className="panel schedule-panel">
              <PanelHeader kicker="AUTOMATION · 2 / 3" title="Schedule refreshes" description="Keep the controller online to run scheduled updates." icon={ClockCountdown} />
              <div className="setting-row">
                <div><strong>Automatic refreshes</strong><span>Runs while this server is online.</span></div>
                <Switch checked={Boolean(form.enabled)} onCheckedChange={(checked) => setField("enabled", checked)} aria-label="Enable automatic refreshes" />
              </div>
              <div className="schedule-fields">
                <Input label="Run every" type="number" min="1" max="10080" value={form.interval_value} onChange={(event) => setField("interval_value", event.target.value)} disabled={!form.enabled} />
                <label className="field-block unit-field"><span className="field-label">Unit</span><select className="native-select" value={form.interval_unit} onChange={(event) => setField("interval_unit", event.target.value)} disabled={!form.enabled}><option value="minutes">minutes</option><option value="hours">hours</option></select></label>
              </div>
              <div className="setting-row setting-row-borderless">
                <div><strong>Auto-push to GitHub</strong><span>Publish the workbook and validation report.</span></div>
                <Switch checked={Boolean(form.auto_push)} onCheckedChange={(checked) => setField("auto_push", checked)} aria-label="Enable automatic GitHub publishing" />
              </div>
              <Button type="button" variant="secondary" className="save-button" onClick={saveSchedule} loading={saving} disabled={saving || !formDirty}>Save automation settings</Button>
              <div className="next-run"><CalendarBlank size={16} /><span><small>Next scheduled run</small><strong>{form.enabled ? formatDate(runtime.next_run_at) : "Scheduler paused"}</strong></span></div>
            </LayerCard>

            <LayerCard className={`panel quality-panel quality-${qualityStatus}`}>
              <div className="quality-heading"><div><Kicker>QUALITY GATE · 3 / 3</Kicker><h2>Data confidence</h2></div><span className="quality-icon"><ShieldCheck size={20} weight="bold" /></span></div>
              <div className="quality-score"><strong>{validation.pass ?? "—"}</strong><span>{qualityLabel}</span></div>
              <div className="quality-list">
                <div><span><i className="quality-dot local" />Local integrity</span><strong>{validation.fail ? `${validation.fail} failed` : validation.pass ? "Passed" : "Not available"}</strong></div>
                <div><span><i className="quality-dot external" />External comparisons</span><strong>{externalStatus}</strong></div>
              </div>
              {validationUrl && <a className="text-link" href={validationUrl} target="_blank" rel="noreferrer">Open validation report <ArrowUpRight size={14} /></a>}
            </LayerCard>
          </div>
        </section>

        <section className="secondary-grid">
          <LayerCard className="panel artifact-panel">
            <div className="panel-header artifact-header"><div className="panel-heading-copy"><Kicker>LATEST PUBLISHED WORKBOOK</Kicker><h2>Excel download</h2></div>{selected?.workbook?.exists ? <Badge variant="success">Available</Badge> : <Badge variant="warning">Not generated</Badge>}</div>
            <div className="artifact-main">
              <div className="file-icon"><FileXls size={23} weight="bold" /></div>
              <div className="artifact-copy"><strong>{selected?.workbook?.name || "Workbook will appear after the first run"}</strong><span>Generated {formatDate(selected?.generated_at_utc)} · validated before publication.</span></div>
              {downloadUrl && selected?.workbook?.exists ? <a className="download-link" href={downloadUrl} target="_blank" rel="noreferrer">Open Excel <DownloadSimple size={16} /></a> : <span className="download-disabled">Waiting</span>}
            </div>
            <div className="artifact-footer"><span><small>Scope</small><strong>{selected?.label} · full-time moneyline</strong></span><span><small>Validation</small><strong>{validation.fail ? `${validation.fail} failed` : validation.pass ? `${validation.pass} checks passed` : "Not available"}</strong></span><span><small>Publication</small><strong>{data?.project?.branch || "—"}</strong></span></div>
          </LayerCard>

          <LayerCard className="panel activity-panel">
            <PanelHeader kicker="RECENT ACTIVITY" title="Latest run" icon={Pulse} />
            {lastRunForSelected ? (
              <div className="activity-item">
                <div className={`activity-status ${lastRunForSelected.status}`}><span>{lastRunForSelected.status === "success" ? <CheckCircle size={19} /> : lastRunForSelected.status === "failed" ? <WarningCircle size={19} /> : <ArrowClockwise className="spin" size={19} />}</span></div>
                <div className="activity-copy"><div className="activity-title-row"><strong>{lastRunForSelected.status === "success" ? `${selected.label} refresh complete` : `${selected.label} refresh ${lastRunForSelected.status}`}</strong><Badge variant={badgeVariant(lastRunForSelected.status)}>{lastRunForSelected.status}</Badge></div><span>{formatDate(lastRunForSelected.finished_at_utc || lastRunForSelected.started_at_utc)} · {formatDuration(lastRunForSelected.duration_seconds)}</span>{lastRunForSelected.push?.pushed && <span><GithubLogo size={14} /> Published commit {String(lastRunForSelected.push.commit || "").slice(0, 7)}</span>}{lastRunForSelected.error && <span className="activity-error">{lastRunForSelected.error}</span>}</div>
              </div>
            ) : <div className="empty-state"><Pulse size={24} /><strong>No runs for this dataset yet</strong><span>Start an update to see the pipeline result here.</span></div>}
            <div className="activity-footer"><span><small>Controller branch</small><strong>{data?.project?.branch || "—"}</strong></span><span><small>Refresh cadence</small><strong>{form.enabled ? `Every ${form.interval_value} ${form.interval_unit}` : "Manual"}</strong></span></div>
          </LayerCard>
        </section>

        <section className="workflow-strip">
          <div className="workflow-intro"><span className="workflow-icon"><SlidersHorizontal size={19} weight="bold" /></span><div><Kicker>WHAT HAPPENS NEXT</Kicker><h2>One update, six hand-offs</h2><p>Every step leaves a local artifact so the result can be inspected and reproduced.</p></div></div>
          <div className="workflow-steps"><span><b>01</b>API snapshot</span><span><b>02</b>Parquet trades</span><span><b>03</b>DuckDB ledger</span><span><b>04</b>Excel + GitHub</span></div>
        </section>
      </main>

      <footer className="footer"><span>Local-first ETL · Parquet + DuckDB</span><span>Cloudflare Kumo UI · Public HTTPS control panel</span></footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
