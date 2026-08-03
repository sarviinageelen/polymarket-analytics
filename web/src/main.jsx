import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Pulse,
  ArrowClockwise,
  CheckCircle,
  Clock,
  CloudArrowUp,
  Database,
  DownloadSimple,
  GithubLogo,
  PlayCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { Badge, Button, Input, LayerCard, Switch, Text } from "@cloudflare/kumo";
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

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
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

function Metric({ label, value, detail, icon: Icon, tone = "neutral" }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon"><Icon size={18} weight="bold" /></div>
      <div className="metric-copy">
        <Text variant="secondary" size="sm">{label}</Text>
        <Text variant="heading3" as="p">{value}</Text>
        {detail && <Text variant="secondary" size="xs">{detail}</Text>}
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, children }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <Text variant="secondary" size="xs" className="eyebrow">{eyebrow}</Text>}
        <Text variant="heading2" as="h2">{title}</Text>
      </div>
      {children}
    </div>
  );
}

function PipelineSteps({ runtime }) {
  const steps = [
    ["Refresh event metadata", "Gamma event list"],
    ["Fetch and persist trades", "Parquet bronze layer"],
    ["Rebuild local DuckDB", "Silver analytical layer"],
    ["Recalculate bettor analysis", "Wallet/game ledgers"],
    ["Export Excel workbook", "Downloadable report"],
    ["Validate the refreshed snapshot", "Local + optional external checks"],
    ["Commit and push updated artifacts", "GitHub publication"],
  ];
  const active = runtime?.current_step;
  const last = runtime?.last_run;
  const isRunning = runtime?.running;
  return (
    <div className="pipeline-list">
      {steps.map(([name, detail]) => {
        const isActive = isRunning && active === name;
        const isComplete = !isRunning && last?.status === "success";
        return (
          <div className={`pipeline-step ${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}`} key={name}>
            <span className="pipeline-dot">
              {isActive ? <ArrowClockwise className="spin" size={15} /> : isComplete ? <CheckCircle size={15} /> : <span />}
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

  const selected = useMemo(
    () => data?.sports?.find((sport) => sport.id === form.sport) || data?.sports?.[0],
    [data, form.sport],
  );
  const runtime = data?.runtime || {};
  const lastRun = runtime.last_run;

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
      const refreshed = await request("/api/status");
      setData(refreshed);
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
      setNotice(`${selected?.label || "Refresh"} started. This page will update as each step completes.`);
      setError("");
      const refreshed = await request("/api/status");
      setData(refreshed);
      if (response.run_id) setNotice(`${selected?.label || "Refresh"} started · run ${response.run_id}.`);
    } catch (cause) {
      setError(cause.message || "Could not start the refresh.");
    } finally {
      setStarting(false);
    }
  }

  const controllerStatus = error ? "offline" : runtime.running ? "running" : "online";
  const validation = selected?.validation || {};
  const counts = selected?.counts || {};
  const downloadUrl = selected?.workbook?.download_url;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span /></div>
          <div><strong>Polymarket Analytics</strong><small>Data control panel</small></div>
        </div>
        <div className="topbar-meta">
          {data?.project?.repository && <span className="repo-label"><GithubLogo size={16} /> {data.project.repository}</span>}
          <Badge variant={badgeVariant(controllerStatus)} appearance="dot">
            {controllerStatus === "offline" ? "Controller offline" : controllerStatus === "running" ? "Refresh running" : "Controller online"}
          </Badge>
        </div>
      </header>

      <main className="page-wrap">
        <section className="hero-row">
          <div>
            <Text variant="secondary" size="sm" className="eyebrow">CACHE-FIRST OPERATIONS</Text>
            <Text variant="heading1" as="h1">Refresh the sports data, then get the workbook.</Text>
            <Text variant="secondary" size="lg" className="hero-copy">
              Choose a dataset, run the full local pipeline, schedule future refreshes, and publish the latest Excel artifact to GitHub.
            </Text>
          </div>
          <div className="hero-status">
            <div className="status-orb"><Pulse size={24} weight="bold" /></div>
            <div><Text variant="secondary" size="xs">LAST CONTROLLER CHECK</Text><Text bold>{formatDate(data?.controller?.now_utc)}</Text></div>
          </div>
        </section>

        {error && <div className="alert alert-error"><WarningCircle size={19} /><span>{error}</span></div>}
        {notice && <div className="alert alert-success"><CheckCircle size={19} /><span>{notice}</span></div>}

        <section className="metrics-grid" aria-label="Selected dataset metrics">
          <Metric label="Selected dataset" value={selected?.label || "—"} detail="Full-time moneyline scope" icon={Database} tone="orange" />
          <Metric label="Markets" value={formatNumber(counts.markets)} detail={`${formatNumber(counts.resolved_markets)} resolved`} icon={Pulse} />
          <Metric label="Trade rows" value={formatNumber(counts.trade_rows)} detail={`${formatNumber(counts.bettors)} wallets`} icon={CloudArrowUp} />
          <Metric label="Candidates" value={formatNumber(counts.candidates_5games_70pct)} detail="5+ games / 70% win rate" icon={CheckCircle} tone="green" />
        </section>

        <section className="content-grid">
          <LayerCard className="panel panel-main">
            <SectionHeading eyebrow="MANUAL REFRESH" title="Run a data update">
              {runtime.running && <Badge variant="info" appearance="dot">Working now</Badge>}
            </SectionHeading>
            <div className="form-grid">
              <label className="native-field field-wide">
                <span>Dataset</span>
                <select value={form.sport} onChange={(event) => setField("sport", event.target.value)} disabled={runtime.running}>
                  {(data?.sports || [{ id: "wnba_2026", label: "WNBA 2026" }, { id: "nfl_2025", label: "NFL 2025" }]).map((sport) => (
                    <option key={sport.id} value={sport.id}>{sport.label}</option>
                  ))}
                </select>
                <small>Only full-game moneyline markets are collected.</small>
              </label>
              <label className="native-field">
                <span>Validation mode</span>
                <select value={form.full_validation ? "full" : "local"} onChange={(event) => setField("full_validation", event.target.value === "full")} disabled={runtime.running}>
                  <option value="local">Local checks (fast)</option>
                  <option value="full">Full external checks</option>
                </select>
                <small>External mode also spot-checks Gamma, CLOB, ESPN, and Polygon.</small>
              </label>
            </div>
            <div className="action-row">
              <Button variant="primary" size="lg" onClick={runNow} loading={starting || runtime.running} disabled={starting || runtime.running}>
                <PlayCircle size={19} weight="bold" /> Update now
              </Button>
              <Text variant="secondary" size="sm">The existing cache is reused for settled markets; open markets are refreshed.</Text>
            </div>
            <div className="subsection-heading"><Text variant="heading3" as="h3">Pipeline progress</Text><Text variant="secondary" size="sm">{runtime.running ? runtime.current_step || "Starting…" : lastRun?.status === "success" ? "Ready" : "Waiting for a run"}</Text></div>
            <PipelineSteps runtime={runtime} />
          </LayerCard>

          <LayerCard className="panel panel-side">
            <SectionHeading eyebrow="AUTOMATION" title="Schedule refreshes">
              <Clock size={22} className="section-icon" />
            </SectionHeading>
            <div className="switch-row">
              <div><Text bold>Scheduler</Text><Text variant="secondary" size="sm">Runs while the controller process is online.</Text></div>
              <Switch checked={Boolean(form.enabled)} onClick={() => setField("enabled", !form.enabled)} aria-label="Enable scheduler" />
            </div>
            <div className="schedule-fields">
              <Input label="Repeat every" type="number" min="1" max="10080" value={form.interval_value} onChange={(event) => setField("interval_value", event.target.value)} disabled={!form.enabled} />
              <label className="native-field unit-field"><span>Unit</span><select value={form.interval_unit} onChange={(event) => setField("interval_unit", event.target.value)} disabled={!form.enabled}><option value="minutes">minutes</option><option value="hours">hours</option></select></label>
            </div>
            <div className="switch-row compact">
              <div><Text bold>Auto-push to GitHub</Text><Text variant="secondary" size="sm">Commit the report, validation JSON, and workbook.</Text></div>
              <Switch checked={Boolean(form.auto_push)} onClick={() => setField("auto_push", !form.auto_push)} aria-label="Enable auto-push" />
            </div>
            <Button variant="secondary" className="save-button" onClick={saveSchedule} loading={saving} disabled={saving || !formDirty}>
              Save schedule
            </Button>
            <div className="next-run-box"><Text variant="secondary" size="xs">NEXT RUN</Text><Text bold>{form.enabled ? formatDate(runtime.next_run_at) : "Scheduler paused"}</Text></div>
          </LayerCard>
        </section>

        <section className="content-grid lower-grid">
          <LayerCard className="panel download-panel">
            <SectionHeading eyebrow="LATEST ARTIFACT" title="Excel download">
              {selected?.workbook?.exists ? <Badge variant="success">Available</Badge> : <Badge variant="warning">Not generated</Badge>}
            </SectionHeading>
            <div className="download-card">
              <div className="file-icon"><DownloadSimple size={23} weight="bold" /></div>
              <div className="file-copy"><Text bold>{selected?.workbook?.name || "Workbook will appear after the first run"}</Text><Text variant="secondary" size="sm">The public link points to the configured GitHub branch.</Text></div>
              {downloadUrl && selected?.workbook?.exists ? <a className="download-link" href={downloadUrl} target="_blank" rel="noreferrer">Open Excel <DownloadSimple size={17} /></a> : <span className="download-disabled">Waiting</span>}
            </div>
            <div className="artifact-meta"><span><strong>Last generated</strong>{formatDate(selected?.generated_at_utc)}</span><span><strong>Validation</strong>{validation.fail ? `${validation.fail} failed` : `${validation.pass} passed`}</span></div>
          </LayerCard>

          <LayerCard className="panel activity-panel">
            <SectionHeading eyebrow="RUN HISTORY" title="Latest activity" />
            {lastRun ? (
              <div className="activity-item">
                <div className={`activity-status ${lastRun.status}`}><span>{lastRun.status === "success" ? <CheckCircle size={19} /> : lastRun.status === "failed" ? <WarningCircle size={19} /> : <ArrowClockwise className="spin" size={19} />}</span></div>
                <div className="activity-copy"><div><Text bold>{lastRun.status === "success" ? `${lastRun.sport === "wnba_2026" ? "WNBA" : "NFL"} refresh complete` : `${lastRun.sport} refresh ${lastRun.status}`}</Text><Badge variant={badgeVariant(lastRun.status)}>{lastRun.status}</Badge></div><Text variant="secondary" size="sm">{formatDate(lastRun.finished_at_utc || lastRun.started_at_utc)} · {formatDuration(lastRun.duration_seconds)}</Text>{lastRun.push?.pushed && <Text variant="secondary" size="sm"><GithubLogo size={14} /> Pushed commit {String(lastRun.push.commit || "").slice(0, 7)}</Text>}{lastRun.error && <Text variant="error" size="sm">{lastRun.error}</Text>}</div>
              </div>
            ) : (
              <div className="empty-state"><Pulse size={26} /><Text bold>No refreshes in this controller session</Text><Text variant="secondary" size="sm">Run an update to see timing, validation, and GitHub publication details here.</Text></div>
            )}
            <div className="activity-footer"><Text variant="secondary" size="xs">Controller branch</Text><Text variant="mono-secondary" size="sm">{data?.project?.branch || "—"}</Text></div>
          </LayerCard>
        </section>

        <section className="how-it-works">
          <div className="how-heading"><Text variant="heading3" as="h2">How the update works</Text><Text variant="secondary" size="sm">A simple six-step loop with local files at every important stage.</Text></div>
          <div className="how-grid">
            <div><span>01</span><strong>API snapshot</strong><small>Gamma metadata is cached locally.</small></div>
            <div><span>02</span><strong>Parquet bronze</strong><small>Trades are stored as columnar files.</small></div>
            <div><span>03</span><strong>DuckDB silver</strong><small>Wallet/game ledgers are rebuilt locally.</small></div>
            <div><span>04</span><strong>Excel + report</strong><small>Analysis is exported for review.</small></div>
            <div><span>05</span><strong>Validation</strong><small>Counts and accounting are checked.</small></div>
            <div><span>06</span><strong>GitHub link</strong><small>The published workbook URL stays visible.</small></div>
          </div>
        </section>
      </main>

      <footer className="footer"><span>Local admin panel · binds to localhost by default</span><span>Cloudflare Kumo UI · Parquet + DuckDB ETL</span></footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
