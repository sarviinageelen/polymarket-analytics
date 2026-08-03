import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarBlank,
  ChartLine,
  Check,
  CheckCircle,
  Clipboard,
  Clock,
  CloudArrowUp,
  Copy,
  Database,
  DownloadSimple,
  FileCsv,
  FileText,
  FileXls,
  Funnel,
  GithubLogo,
  Info,
  Lightning,
  MagnifyingGlass,
  Play,
  Pulse,
  ShieldCheck,
  SlidersHorizontal,
  Stop,
  Timer,
  TrendUp,
  Trophy,
  UserCircle,
  WarningCircle,
  X,
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

const TABS = [
  { id: "updates", label: "Data updates", icon: CloudArrowUp },
  { id: "team", label: "Best traders by team", icon: Trophy },
  { id: "game", label: "Best traders by game", icon: ChartLine },
  { id: "trader", label: "Trader trends", icon: UserCircle },
  { id: "game-trends", label: "Game trends", icon: TrendUp },
  { id: "odds", label: "Odds & results", icon: ChartLine },
  { id: "runs", label: "Run history", icon: Clock },
];

const PIPELINE_STEPS = [
  ["Refresh event metadata", "Gamma event list"],
  ["Fetch and persist trades", "Parquet bronze layer"],
  ["Rebuild local DuckDB", "Silver analytical layer"],
  ["Recalculate bettor analysis", "Wallet/game ledgers"],
  ["Export Excel workbook", "Downloadable report"],
  ["Validate the refreshed snapshot", "Local or external checks"],
  ["Commit and push updated artifacts", "GitHub publication"],
];

const VALID_VIEWS = new Set(TABS.map((tab) => tab.id));

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
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toFixed(2)}%`;
}

function formatDelta(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)} pp`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatDateOnly(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const value = Number(seconds);
  if (value < 60) return `${Math.round(value)} sec`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function queryNumber(params, key, fallback) {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function badgeVariant(status) {
  if (status === "success" || status === "online" || status === "completed") return "success";
  if (status === "failed" || status === "offline") return "error";
  if (status === "running" || status === "queued") return "info";
  return "warning";
}

function buildQuery(path, values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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
      <div className="metric-icon"><Icon size={20} weight="regular" /></div>
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
          {Icon && <span className="panel-title-icon"><Icon size={18} weight="regular" /></span>}
          <Kicker>{kicker}</Kicker>
        </div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Alert({ type = "error", children, onDismiss }) {
  return (
    <div className={`alert alert-${type}`} role={type === "error" ? "alert" : "status"}>
      {type === "error" ? <WarningCircle size={20} /> : <CheckCircle size={20} />}
      <div className="alert-content">{children}</div>
      {onDismiss && <button type="button" className="icon-button alert-dismiss" onClick={onDismiss} aria-label="Dismiss message"><X size={16} /></button>}
    </div>
  );
}

function PipelineSteps({ runtime }) {
  const activeIndex = PIPELINE_STEPS.findIndex(([name]) => name === runtime?.current_step);
  const isRunning = Boolean(runtime?.running);
  const isComplete = !isRunning && runtime?.last_run?.status === "success";
  const completedNames = new Set((runtime?.last_run?.steps || []).filter((step) => step.status === "success").map((step) => step.name));

  return (
    <div className="pipeline-list" aria-label="Refresh pipeline progress">
      {PIPELINE_STEPS.map(([name, detail], index) => {
        const active = isRunning && index === activeIndex;
        const complete = isComplete || completedNames.has(name) || (isRunning && activeIndex > -1 && index < activeIndex);
        const skipped = !isRunning && runtime?.last_run?.status === "success" && !completedNames.has(name) && name === "Commit and push updated artifacts";
        return (
          <div className={`pipeline-step ${active ? "is-active" : ""} ${complete ? "is-complete" : ""} ${skipped ? "is-skipped" : ""}`} key={name}>
            <span className="pipeline-marker">
              {active ? <ArrowClockwise className="spin" size={15} /> : complete ? <Check size={15} /> : skipped ? <span className="pipeline-dash">—</span> : <span />}
            </span>
            <span className="pipeline-copy"><strong>{name}</strong><small>{detail}</small></span>
          </div>
        );
      })}
    </div>
  );
}

function ModeOption({ active, icon: Icon, title, description, badge, onClick }) {
  return (
    <button type="button" className={`mode-option ${active ? "is-selected" : ""}`} aria-pressed={active} onClick={onClick}>
      <span className="mode-option-icon"><Icon size={19} weight="regular" /></span>
      <span className="mode-option-copy">
        <span className="mode-option-title">{title}{badge && <Badge variant={active ? "success" : "neutral"}>{badge}</Badge>}</span>
        <span className="mode-option-description">{description}</span>
      </span>
      <span className="mode-radio" aria-hidden="true"><span /></span>
    </button>
  );
}

function DataUpdatesView({
  data,
  selected,
  sports,
  form,
  setField,
  runtime,
  validation,
  counts,
  runNow,
  starting,
  saveSchedule,
  saving,
  formDirty,
  validationUrl,
}) {
  const lastRun = runtime.last_run?.sport === selected?.id ? runtime.last_run : null;
  const qualityStatus = validation.fail > 0 ? "failed" : validation.not_run > 0 ? "partial" : validation.pass > 0 ? "passed" : "unknown";
  const qualityLabel = qualityStatus === "failed" ? "Needs attention" : qualityStatus === "partial" ? "Partially checked" : qualityStatus === "passed" ? "All checks passed" : "No report yet";
  const totalChecks = Number(validation.pass || 0) + Number(validation.warning || 0) + Number(validation.fail || 0) + Number(validation.not_run || 0);
  const externalStatus = validation.not_run > 0 ? "Not fully run" : validation.fail > 0 ? "Failed" : validation.pass > 0 ? "Passed" : "Not available";

  return (
    <>
      <section className="page-heading">
        <div>
          <Kicker>Data operations</Kicker>
          <h1>Update sports data</h1>
          <p className="page-lede">Choose a dataset, run the refresh, verify the result, and download the latest workbook.</p>
        </div>
        <div className="last-check-card">
          <span className="last-check-icon"><Pulse size={20} weight="regular" /></span>
          <span><small>Controller check</small><strong>{formatDate(data?.controller?.now_utc)}</strong></span>
        </div>
      </section>

      <section className="dataset-bar" aria-label="Active dataset">
        <div className="dataset-bar-title"><span className="dataset-bar-icon"><Database size={19} weight="regular" /></span><span><small>Active dataset</small><strong>{selected?.label || "—"}</strong></span></div>
        <span className="dataset-scope">Full-time moneyline</span>
        <div className="dataset-meta"><span><small>Snapshot</small><strong>{formatDate(selected?.generated_at_utc)}</strong></span><span><small>Branch</small><strong>{data?.project?.branch || "—"}</strong></span></div>
      </section>

      <section className="metrics-grid" aria-label="Dataset overview">
        <MetricCard label="Markets" value={formatNumber(counts.markets)} detail={`${formatNumber(counts.resolved_markets)} resolved`} icon={Database} tone="orange" />
        <MetricCard label="Canonical trades" value={formatNumber(counts.trade_rows)} detail="Deduplicated analytical rows" icon={CloudArrowUp} tone="blue" />
        <MetricCard label="Wallets" value={formatNumber(counts.bettors)} detail="Wallets with trades" icon={ChartLine} tone="violet" />
        <MetricCard label="Candidates" value={formatNumber(counts.candidates_5games_70pct)} detail="5+ games · 70% profit rate" icon={CheckCircle} tone="green" />
      </section>

      <section className="primary-grid">
        <LayerCard className="panel update-panel">
          <PanelHeader kicker="Update" title="Run a data update" description="The refresh saves local API data, rebuilds the analysis, and checks the generated workbook." icon={Lightning}>
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
              <ModeOption active={!form.full_validation} icon={Timer} title="Local checks" description="Fast checks across the local files and database." badge="Routine" onClick={() => !runtime.running && setField("full_validation", false)} />
              <ModeOption active={Boolean(form.full_validation)} icon={ShieldCheck} title="Full external checks" description="Adds Gamma, CLOB, ESPN, and Polygon comparisons." badge="Before publish" onClick={() => !runtime.running && setField("full_validation", true)} />
            </div>
            <div className="info-callout"><Info size={17} /><span><strong>Both modes fetch the same trades.</strong> Full checks add a slower review after the refresh.</span></div>
          </div>

          <div className="update-action-row">
            <Button type="button" variant="primary" size="lg" onClick={runNow} loading={starting || runtime.running} disabled={starting || runtime.running}><ArrowClockwise size={18} /> Update {selected?.label || "dataset"}</Button>
            <span className="action-helper"><ArrowClockwise size={15} /> Settled markets use the local cache; open markets refresh.</span>
          </div>

          <div className="pipeline-heading">
            <div><Kicker>Refresh progress</Kicker><h3>{runtime.running ? runtime.current_step || "Starting refresh…" : lastRun?.status === "success" ? "Ready for the next update" : lastRun?.status === "failed" ? "The last update needs attention" : "No update has run yet"}</h3></div>
            <span className={`pipeline-state ${runtime.running ? "running" : lastRun?.status === "success" ? "success" : lastRun?.status === "failed" ? "failed" : ""}`}>{runtime.running ? "In progress" : lastRun?.status === "success" ? "Complete" : lastRun?.status === "failed" ? "Needs attention" : "Idle"}</span>
          </div>
          <PipelineSteps runtime={{ ...runtime, last_run: lastRun }} />
        </LayerCard>

        <div className="side-stack">
          <LayerCard className="panel schedule-panel">
            <PanelHeader kicker="Automation" title="Schedule refreshes" description="Scheduled runs require this server to stay online." icon={Clock} />
            <div className="setting-row"><div><strong>Automatic refreshes</strong><span>Run the selected dataset on a cadence.</span></div><Switch checked={Boolean(form.enabled)} onCheckedChange={(checked) => setField("enabled", checked)} aria-label="Enable automatic refreshes" /></div>
            <div className="schedule-fields"><Input label="Run every" type="number" min="1" max="10080" value={form.interval_value} onChange={(event) => setField("interval_value", event.target.value)} disabled={!form.enabled} /><label className="field-block unit-field"><span className="field-label">Unit</span><select className="native-select" value={form.interval_unit} onChange={(event) => setField("interval_unit", event.target.value)} disabled={!form.enabled}><option value="minutes">minutes</option><option value="hours">hours</option></select></label></div>
            <div className="setting-row setting-row-borderless"><div><strong>Auto-push to GitHub</strong><span>Publish the workbook and validation report.</span></div><Switch checked={Boolean(form.auto_push)} onCheckedChange={(checked) => setField("auto_push", checked)} aria-label="Enable automatic GitHub publishing" /></div>
            <Button type="button" variant="secondary" className="save-button" onClick={saveSchedule} loading={saving} disabled={saving || !formDirty}>Save settings</Button>
            <div className="next-run"><CalendarBlank size={17} /><span><small>Next scheduled run</small><strong>{form.enabled ? formatDate(runtime.next_run_at) : "Scheduler paused"}</strong></span></div>
          </LayerCard>

          <LayerCard className={`panel quality-panel quality-${qualityStatus}`}>
            <div className="quality-heading"><div><Kicker>Validation</Kicker><h2>Data confidence</h2></div><span className="quality-icon"><ShieldCheck size={21} /></span></div>
            <div className="quality-score"><strong>{totalChecks ? `${validation.pass || 0} / ${totalChecks}` : "—"}</strong><span>{qualityLabel}</span></div>
            <div className="quality-list"><div><span><i className="quality-dot local" />Local integrity</span><strong>{validation.fail ? `${validation.fail} failed` : validation.pass ? "Passed" : "Not available"}</strong></div><div><span><i className="quality-dot external" />External comparisons</span><strong>{externalStatus}</strong></div></div>
            {validationUrl && <a className="text-link" href={validationUrl} target="_blank" rel="noreferrer">Open validation report <ArrowUpRight size={15} /></a>}
          </LayerCard>
        </div>
      </section>

      <section className="secondary-grid">
        <LayerCard className="panel artifact-panel">
          <div className="panel-header artifact-header"><div className="panel-heading-copy"><Kicker>Latest workbook</Kicker><h2>Excel download</h2></div>{selected?.workbook?.exists ? <Badge variant="success">Available</Badge> : <Badge variant="warning">Not generated</Badge>}</div>
          <div className="artifact-main"><div className="file-icon"><FileXls size={24} /></div><div className="artifact-copy"><strong>{selected?.workbook?.name || "Workbook will appear after the first run"}</strong><span>Generated {formatDate(selected?.generated_at_utc)} · checked before publication.</span></div>{selected?.workbook?.download_url && selected?.workbook?.exists ? <a className="download-link" href={selected.workbook.download_url} target="_blank" rel="noreferrer">Open Excel <DownloadSimple size={17} /></a> : <span className="download-disabled">Waiting</span>}</div>
          <div className="artifact-footer"><span><small>Scope</small><strong>{selected?.label} · full-time moneyline</strong></span><span><small>Validation</small><strong>{validation.fail ? `${validation.fail} failed` : validation.pass ? `${validation.pass} checks passed` : "Not available"}</strong></span><span><small>Publication branch</small><strong>{data?.project?.branch || "—"}</strong></span></div>
        </LayerCard>
        <LatestRunCard run={runtime.last_run?.sport === selected?.id ? runtime.last_run : null} selected={selected} data={data} />
      </section>
    </>
  );
}

function LatestRunCard({ run, selected, data }) {
  return (
    <LayerCard className="panel activity-panel">
      <PanelHeader kicker="Recent activity" title="Latest run" icon={Pulse} />
      {run ? <div className="activity-item"><div className={`activity-status ${run.status}`}><span>{run.status === "success" ? <CheckCircle size={20} /> : run.status === "failed" ? <WarningCircle size={20} /> : <ArrowClockwise className="spin" size={20} />}</span></div><div className="activity-copy"><div className="activity-title-row"><strong>{run.status === "success" ? `${selected?.label} refresh complete` : `${selected?.label} refresh ${run.status}`}</strong><StatusBadge status={run.status}>{run.status}</StatusBadge></div><span>{formatDate(run.finished_at_utc || run.started_at_utc)} · {formatDuration(run.duration_seconds)}</span>{run.push?.pushed && <span><GithubLogo size={15} /> Published commit {String(run.push.commit || "").slice(0, 7)}</span>}{run.error && <span className="activity-error">{run.error}</span>}</div></div> : <div className="empty-state"><Pulse size={25} /><strong>No runs for this dataset yet</strong><span>Start an update to see the result here.</span></div>}
      <div className="activity-footer"><span><small>Controller branch</small><strong>{data?.project?.branch || "—"}</strong></span><span><small>Refresh cadence</small><strong>{data?.config?.enabled ? `Every ${data.config.interval_value} ${data.config.interval_unit}` : "Manual"}</strong></span></div>
    </LayerCard>
  );
}

function AnalyticsToolbar({ dimension, filters, setFilters, catalog, onReset, onOpenFilters }) {
  const games = catalog?.games || [];
  const teams = catalog?.teams || [];
  const exportPath = buildQuery("/api/analytics/leaderboard", { ...filters, dimension, export: 1 });
  return (
    <LayerCard className="panel analytics-toolbar">
      <div className="toolbar-top"><div><Kicker>Filters</Kicker><h2>{dimension === "team" ? "Choose a team" : "Choose a game"}</h2></div><div className="toolbar-actions"><a className="button-link secondary" href={apiUrl(exportPath)}><FileCsv size={17} /> Export CSV</a><Button type="button" variant="secondary" onClick={onReset}><ArrowClockwise size={16} /> Reset filters</Button></div></div>
      <div className="filter-grid">
        <label className="field-block"><span className="field-label">Dataset</span><select className="native-select" value={filters.sport} onChange={(event) => setFilters((current) => ({ ...current, sport: event.target.value, team: "", condition_id: "", page: 1 }))}><option value="wnba_2026">WNBA 2026</option><option value="nfl_2025">NFL 2025</option></select></label>
        {dimension === "team" ? <label className="field-block"><span className="field-label">Team</span><select className="native-select" value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value, page: 1 }))}>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select></label> : <label className="field-block"><span className="field-label">Game</span><select className="native-select" value={filters.condition_id} onChange={(event) => setFilters((current) => ({ ...current, condition_id: event.target.value, page: 1 }))}>{games.map((game) => <option key={game.condition_id} value={game.condition_id}>{game.title} · {formatDateOnly(game.event_date)}</option>)}</select></label>}
        <label className="field-block"><span className="field-label">Sample period</span><select className="native-select" value={filters.sample} onChange={(event) => setFilters((current) => ({ ...current, sample: event.target.value, page: 1 }))}><option value="season">Full season</option><option value="last5">Last 5 resolved picks</option><option value="last10">Last 10 resolved picks</option><option value="last20">Last 20 resolved picks</option><option value="custom">Custom date range</option></select></label>
        <label className="field-block"><span className="field-label">Minimum resolved picks</span><input className="native-input" type="number" min="1" max="10000" value={filters.min_picks} onChange={(event) => setFilters((current) => ({ ...current, min_picks: event.target.value, page: 1 }))} /></label>
        <label className="field-block search-field"><span className="field-label">Search trader</span><span className="input-with-icon"><MagnifyingGlass size={17} /><input className="native-input" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))} placeholder="Name or wallet" /></span></label>
      </div>
      {filters.sample === "custom" && <div className="date-filter-row"><label className="field-block"><span className="field-label">From</span><input className="native-input" type="date" value={filters.start_date || ""} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value, page: 1 }))} /></label><label className="field-block"><span className="field-label">To</span><input className="native-input" type="date" value={filters.end_date || ""} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value, page: 1 }))} /></label></div>}
      <div className="filter-footer"><label className="checkbox-label"><input type="checkbox" checked={Boolean(filters.include_no_pick)} onChange={(event) => setFilters((current) => ({ ...current, include_no_pick: event.target.checked, page: 1 }))} /> Include traders without a qualifying pick on the selected game</label><span className="filter-result"><Funnel size={16} /> {catalog?.summary?.games ? `${formatNumber(catalog.summary.games)} games in snapshot` : "Loading dataset"}</span></div>
      <details className="methodology"><summary>How this table works</summary><div className="methodology-copy"><p><strong>Pick:</strong> one wallet × moneyline game ledger. <strong>Resolved pick:</strong> only a closed, one-winner market with a non-flat result.</p><p><strong>Accuracy:</strong> profitable resolved ledgers divided by non-flat resolved ledgers. This is descriptive profitability, not directional pick accuracy.</p><p><strong>Confidence score:</strong> 95% Wilson lower bound, so a small 1–0 sample does not automatically outrank a larger verified sample.</p><p><strong>ROI/P&amp;L:</strong> realized P&amp;L divided by settled BUY cost. Unresolved, cancelled, voided, and tie markets are excluded from ranking percentages.</p></div></details>
    </LayerCard>
  );
}

function SortButton({ label, column, filters, setFilters }) {
  const active = filters.sort === column;
  const nextDirection = active && filters.direction === "desc" ? "asc" : "desc";
  return <button type="button" className="sort-button" aria-sort={active ? filters.direction : "none"} onClick={() => setFilters((current) => ({ ...current, sort: column, direction: nextDirection, page: 1 }))}>{label}{active && (filters.direction === "desc" ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}</button>;
}

function TraderCell({ row, onOpenTrader, onCopy }) {
  return <div className="trader-cell"><div className="trader-avatar"><UserCircle size={21} /></div><div className="trader-copy"><button type="button" className="trader-name" onClick={() => onOpenTrader(row.full_wallet)}>{row.display_name || row.wallet_short}</button><span>{row.wallet_short}</span></div><a className="profile-link" href={`https://polymarket.com/profile/${row.full_wallet}`} target="_blank" rel="noreferrer" title="Open Polymarket profile" aria-label={`Open ${row.display_name || row.wallet_short} Polymarket profile`}><ArrowUpRight size={15} /></a><button type="button" className="icon-button" onClick={() => onCopy(row.full_wallet)} title="Copy wallet address" aria-label="Copy wallet address"><Copy size={15} /></button></div>;
}

function AccuracyMeter({ value, sample }) {
  const width = Math.max(0, Math.min(100, Number(value || 0)));
  return <div className="accuracy-cell"><div className="meter"><span style={{ width: `${width}%` }} /></div><span>{formatPercent(value)} <small>(n={formatNumber(sample)})</small></span></div>;
}

function LeaderboardTable({ result, dimension, filters, setFilters, onOpenTrader, onCopy, loading, error, onRetry }) {
  if (loading) return <div className="table-state"><div className="table-skeleton" /><div className="table-skeleton" /><div className="table-skeleton" /><div className="table-skeleton" /></div>;
  if (error) return <div className="table-state table-error"><WarningCircle size={26} /><strong>Could not load this table</strong><span>{error}</span><Button type="button" variant="secondary" onClick={onRetry}><ArrowClockwise size={16} /> Try again</Button></div>;
  if (!result?.rows?.length) return <div className="table-state"><Clipboard size={27} /><strong>No qualifying traders found</strong><span>Lower the minimum sample or reset the filters to explore the available data.</span></div>;
  const target = result.target_game;
  return <>
    <div className="table-summary"><div><Kicker>{dimension === "team" ? "Team leaderboard" : "Game leaderboard"}</Kicker><h2>{dimension === "team" ? `Traders involving ${filters.team}` : target?.title || "Selected game"}</h2><p>{result.total ? `${formatNumber(result.total)} traders match the current filters.` : "No matching traders."}</p></div><div className="table-summary-meta"><span><small>Ranking</small><strong>Wilson lower bound</strong></span><span><small>Market</small><strong>Moneyline</strong></span></div></div>
    <div className="table-scroll"><table className="analytics-table"><caption className="sr-only">{dimension === "team" ? "Best traders by team" : "Best traders by game"}</caption><thead><tr><th>Rank</th><th>Trader</th><th><SortButton label="Record" column="wins" filters={filters} setFilters={setFilters} /></th><th><SortButton label="Picks" column="picks" filters={filters} setFilters={setFilters} /></th>{dimension === "game" && <><th>{target?.team_a || "Team A"}</th><th>{target?.team_b || "Team B"}</th><th>Combined accuracy</th></>}<th><SortButton label="Accuracy" column="raw_accuracy" filters={filters} setFilters={setFilters} /></th><th><SortButton label="Confidence score" column="confidence_score" filters={filters} setFilters={setFilters} /></th><th><SortButton label="ROI" column="roi" filters={filters} setFilters={setFilters} /></th><th>Avg entry price</th>{dimension === "game" && <th>Game P&amp;L</th>}<th>Current pick</th><th>Streak</th></tr></thead><tbody>{result.rows.map((row, index) => <tr key={row.wallet}><td className="rank-cell">{(result.page - 1) * result.page_size + index + 1}</td><td><TraderCell row={row} onOpenTrader={onOpenTrader} onCopy={onCopy} /></td><td><span className="record-cell">{row.record}</span></td><td>{formatNumber(row.picks)}</td>{dimension === "game" && <><td><AccuracyMeter value={row.team_a_accuracy_pct} sample={row.team_a_picks} /></td><td><AccuracyMeter value={row.team_b_accuracy_pct} sample={row.team_b_picks} /></td><td><AccuracyMeter value={row.combined_accuracy_pct} sample={Number(row.team_a_picks || 0) + Number(row.team_b_picks || 0)} /></td></>}<td><AccuracyMeter value={row.raw_accuracy_pct} sample={row.picks} /></td><td><AccuracyMeter value={row.confidence_score_pct} sample={row.picks} /></td><td>{formatPercent(row.roi_pct)}</td><td>{formatPercent(row.avg_entry_price == null ? null : Number(row.avg_entry_price) * 100)}</td>{dimension === "game" && <td>{formatMoney(row.target_pnl)}</td>}<td>{row.current_pick ? <span className="pick-chip">{row.current_pick}</span> : <span className="muted">No current pick</span>}</td><td><span className={Number(row.current_streak) < 0 ? "streak-loss" : "streak-win"}>{row.current_streak ? `${Math.abs(row.current_streak)} ${row.current_streak > 0 ? "W" : "L"}` : "—"}</span></td></tr>)}</tbody></table></div>
    <Pagination result={result} filters={filters} setFilters={setFilters} />
  </>;
}

function Pagination({ result, filters, setFilters }) {
  if (!result || !result.total) return null;
  return <div className="pagination"><span>Showing {formatNumber((result.page - 1) * result.page_size + 1)}–{formatNumber(Math.min(result.page * result.page_size, result.total))} of {formatNumber(result.total)}</span><div className="pagination-actions"><label>Rows <select value={filters.page_size} onChange={(event) => setFilters((current) => ({ ...current, page_size: event.target.value, page: 1 }))}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label><Button type="button" variant="secondary" disabled={result.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, Number(current.page) - 1) }))}>Previous</Button><span>Page {result.page} of {result.pages}</span><Button type="button" variant="secondary" disabled={result.page >= result.pages} onClick={() => setFilters((current) => ({ ...current, page: Number(current.page) + 1 }))}>Next</Button></div></div>;
}

function AnalyticsView({ dimension, filters, setFilters, catalog, result, loading, error, onRetry, onOpenTrader, onCopy }) {
  const title = dimension === "team" ? "Best traders by team" : "Best traders by game";
  const description = dimension === "team" ? "Compare traders who have resolved moneyline ledgers involving a selected team." : "Compare traders around one Polymarket matchup, including team-specific samples and current positions.";
  function reset() {
    setFilters((current) => ({ ...current, team: catalog?.teams?.[0] || "", condition_id: catalog?.games?.[0]?.condition_id || "", sample: "season", min_picks: 5, include_no_pick: false, search: "", sort: "confidence_score", direction: "desc", page: 1, start_date: "", end_date: "" }));
  }
  return <><section className="page-heading compact-heading"><div><Kicker>Descriptive analytics</Kicker><h1>{title}</h1><p className="page-lede">{description}</p></div><div className="last-check-card"><span className="last-check-icon"><Database size={20} /></span><span><small>Data snapshot</small><strong>{formatDate(catalog?.generated_at_utc || result?.target_game?.event_date)}</strong></span></div></section><AnalyticsToolbar dimension={dimension} filters={filters} setFilters={setFilters} catalog={catalog} onReset={reset} /><LayerCard className="panel table-panel"><LeaderboardTable result={result} dimension={dimension} filters={filters} setFilters={setFilters} onOpenTrader={onOpenTrader} onCopy={onCopy} loading={loading} error={error} onRetry={onRetry} /></LayerCard></>;
}

function TraderTrendsView({ sport, wallet, setWallet, trader, loading, error, onLoad, onCopy }) {
  return <><section className="page-heading compact-heading"><div><Kicker>Descriptive analytics</Kicker><h1>Trader trends</h1><p className="page-lede">Inspect a trader’s resolved performance over time. The view is descriptive and uses the local ledger snapshot.</p></div><div className="last-check-card"><span className="last-check-icon"><UserCircle size={20} /></span><span><small>Dataset</small><strong>{sport === "nfl_2025" ? "NFL 2025" : "WNBA 2026"}</strong></span></div></section><LayerCard className="panel trader-lookup"><div className="lookup-heading"><div><Kicker>Trader lookup</Kicker><h2>Enter a wallet address</h2></div><span className="lookup-note">Polymarket profile addresses are public identifiers.</span></div><div className="lookup-row"><input className="native-input" value={wallet} onChange={(event) => setWallet(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onLoad()} placeholder="0x…" aria-label="Trader wallet address" /><Button type="button" variant="primary" onClick={onLoad} loading={loading} disabled={!wallet.trim()}>View trader</Button>{wallet && <a className="button-link secondary" href={`https://polymarket.com/profile/${wallet}`} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /> Open profile</a>}</div></LayerCard>{error && <Alert>{error}</Alert>}{trader && <TraderDetail trader={trader} onCopy={onCopy} />}{!trader && !loading && !error && <div className="empty-state large-empty"><UserCircle size={32} /><strong>Select a trader from a leaderboard or enter a wallet address.</strong><span>Wallet aliases and addresses are shown together so the source is always clear.</span></div>}</>;
}

function TraderDetail({ trader, onCopy }) {
  const trend = trader.trend || [];
  return <><section className="metrics-grid detail-metrics"><MetricCard label="Resolved picks" value={formatNumber(trader.resolved_picks)} detail={trader.record || "No record"} icon={CheckCircle} tone="green" /><MetricCard label="Raw accuracy" value={formatPercent(trader.raw_accuracy_pct)} detail="Profitable resolved ledgers" icon={ChartLine} tone="blue" /><MetricCard label="Realized P&amp;L" value={formatMoney(trader.total_pnl)} detail="Settled snapshot" icon={TrendUp} tone="violet" /><MetricCard label="ROI" value={formatPercent(trader.roi_pct)} detail="P&amp;L / settled BUY cost" icon={Trophy} tone="orange" /></section><LayerCard className="panel detail-panel"><div className="detail-heading"><div><Kicker>Trader profile</Kicker><h2>{trader.display_name}</h2><span className="wallet-line">{trader.wallet} <button type="button" className="icon-button" onClick={() => onCopy(trader.wallet)} aria-label="Copy wallet address"><Copy size={16} /></button></span></div><a className="button-link secondary" href={`https://polymarket.com/profile/${trader.wallet}`} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /> Polymarket profile</a></div>{trend.length > 0 && <div className="trend-strip">{trend.slice(-12).map((point) => <div className="trend-point" key={`${point.event_date}-${point.condition_id}`} title={`${point.event_date}: ${point.result || "unresolved"}`}><span className={point.result === "win" ? "positive" : point.result === "loss" ? "negative" : "neutral"} style={{ height: `${Math.max(8, Math.min(100, Math.abs(Number(point.cumulative_pnl || 0)) / Math.max(1, Math.abs(Number(trader.total_pnl || 0))) * 100))}%` }} /></div>)}</div>}<div className="table-scroll"><table className="analytics-table compact-table"><thead><tr><th>Date</th><th>Game</th><th>Result</th><th>P&amp;L</th><th>Buy cost</th><th>Trades</th></tr></thead><tbody>{(trader.recent_picks || []).map((row) => <tr key={row.condition_id}><td>{formatDateOnly(row.event_date)}</td><td>{row.title}</td><td><span className={`result-chip ${row.result}`}>{row.result || "unresolved"}</span></td><td>{formatMoney(row.pnl)}</td><td>{formatMoney(row.buy_cost)}</td><td>{formatNumber(row.trade_count)}</td></tr>)}</tbody></table></div><div className="breakdown-grid"><div><h3>By team picked</h3>{(trader.by_team || []).length ? (trader.by_team || []).slice(0, 8).map((item) => <div className="breakdown-row" key={item.label}><span>{item.label}</span><strong>{formatPercent(item.accuracy_pct)}</strong><small>{item.picks} picks · {formatMoney(item.pnl)}</small></div>) : <p className="muted">No single-sided picks in the recent rows.</p>}</div><div><h3>By market type</h3>{(trader.by_market_type || []).map((item) => <div className="breakdown-row" key={item.label}><span>{item.label}</span><strong>{formatPercent(item.accuracy_pct)}</strong><small>{item.picks} picks · {formatMoney(item.pnl)}</small></div>)}</div></div><p className="method-note">{trader.methodology}</p></LayerCard></>;
}

function GameTrendsView({ filters, setFilters, catalog, gameTrend, loading, error, onRetry }) {
  const games = catalog?.games || [];
  const game = gameTrend?.game;
  const counts = gameTrend?.selection_counts || {};
  const total = Number(gameTrend?.tracked_wallets || 0);
  return <><section className="page-heading compact-heading"><div><Kicker>Descriptive analytics</Kicker><h1>Game trends</h1><p className="page-lede">See how tracked wallets are positioned and how trading activity changed through the selected game.</p></div><div className="last-check-card"><span className="last-check-icon"><TrendUp size={20} /></span><span><small>Selection sample</small><strong>{formatNumber(total)} wallets</strong></span></div></section><LayerCard className="panel game-selector"><div className="filter-grid"><label className="field-block"><span className="field-label">Dataset</span><select className="native-select" value={filters.sport} onChange={(event) => setFilters((current) => ({ ...current, sport: event.target.value, condition_id: "" }))}><option value="wnba_2026">WNBA 2026</option><option value="nfl_2025">NFL 2025</option></select></label><label className="field-block game-selector-wide"><span className="field-label">Game</span><select className="native-select" value={filters.condition_id} onChange={(event) => setFilters((current) => ({ ...current, condition_id: event.target.value }))}>{games.map((item) => <option key={item.condition_id} value={item.condition_id}>{item.title} · {formatDateOnly(item.event_date)}</option>)}</select></label></div></LayerCard>{loading && <div className="table-state"><div className="table-skeleton" /><div className="table-skeleton" /></div>}{error && <Alert>{error}<button type="button" className="retry-inline" onClick={onRetry}>Try again</button></Alert>}{game && !loading && <><section className="metrics-grid detail-metrics"><MetricCard label="Tracked wallets" value={formatNumber(total)} detail="Wallets with trades in this game" icon={UserCircle} tone="blue" /><MetricCard label={game.team_a} value={`${formatNumber(counts["Team A"])} wallets`} detail={`${formatPercent(total ? counts["Team A"] / total * 100 : null)} of sample`} icon={ChartLine} tone="green" /><MetricCard label={game.team_b} value={`${formatNumber(counts["Team B"])} wallets`} detail={`${formatPercent(total ? counts["Team B"] / total * 100 : null)} of sample`} icon={ChartLine} tone="orange" /><MetricCard label="Hedged" value={`${formatNumber(counts.Hedged || 0)} wallets`} detail="Positive net exposure to both sides" icon={ShieldCheck} tone="violet" /></section><LayerCard className="panel trend-panel"><div className="table-summary"><div><Kicker>Game snapshot</Kicker><h2>{game.title}</h2><p>{formatDateOnly(game.event_date)} · {game.market_status} · {game.resolution_type}</p></div><div className="table-summary-meta"><span><small>Winner</small><strong>{game.winner || "Not resolved"}</strong></span><span><small>Prices</small><strong>{formatPercent(Number(game.current_price_a || 0) * 100)} / {formatPercent(Number(game.current_price_b || 0) * 100)}</strong></span></div></div><div className="selection-bars">{["Team A", "Team B", "Hedged", "Flat"].map((key) => <div className="selection-bar-row" key={key}><span>{key === "Team A" ? game.team_a : key === "Team B" ? game.team_b : key}</span><div className="meter"><span style={{ width: `${total ? counts[key] / total * 100 : 0}%` }} /></div><strong>{formatNumber(counts[key] || 0)} <small>(n={formatNumber(total)})</small></strong></div>)}</div><div className="table-scroll"><table className="analytics-table compact-table"><thead><tr><th>Time</th><th>Trades</th><th>Wallets</th><th>Volume</th><th>Average price</th><th>Team A price</th><th>Team B price</th></tr></thead><tbody>{(gameTrend.timeline || []).map((row) => <tr key={row.hour}><td>{formatDate(row.hour)}</td><td>{formatNumber(row.trades)}</td><td>{formatNumber(row.wallets)}</td><td>{formatMoney(row.volume)}</td><td>{formatPercent(Number(row.average_price || 0) * 100)}</td><td>{formatPercent(Number(row.average_price_a || 0) * 100)}</td><td>{formatPercent(Number(row.average_price_b || 0) * 100)}</td></tr>)}</tbody></table></div><p className="method-note">{gameTrend.methodology}</p></LayerCard></>}</>;
}

function CalibrationChart({ bands, summary }) {
  const [hoveredBand, setHoveredBand] = useState("");
  const delta = summary.favorite_win_rate_pct == null || summary.avg_favorite_implied_pct == null ? null : Number(summary.favorite_win_rate_pct) - Number(summary.avg_favorite_implied_pct);
  const plot = { width: 700, height: 360, left: 62, right: 24, top: 22, bottom: 58 };
  const plotWidth = plot.width - plot.left - plot.right;
  const plotHeight = plot.height - plot.top - plot.bottom;
  const ticks = [50, 60, 70, 80, 90, 100];
  const points = bands.filter((row) => Number(row.games) > 0 && row.avg_implied_pct != null && row.win_rate_pct != null).map((row) => ({
    ...row,
    x: plot.left + ((Number(row.avg_implied_pct) - 50) / 50) * plotWidth,
    y: plot.top + (1 - ((Number(row.win_rate_pct) - 50) / 50)) * plotHeight,
  }));
  const hovered = points.find((point) => point.band === hoveredBand) || null;
  const xTick = (value) => plot.left + ((value - 50) / 50) * plotWidth;
  const yTick = (value) => plot.top + (1 - ((value - 50) / 50)) * plotHeight;
  return <LayerCard className="panel calibration-panel">
    <div className="panel-header calibration-header"><div className="panel-heading-copy"><Kicker>Primary visual</Kicker><h2>Observed win rate vs market price</h2><p>Each dot is a favorite price band. Dots on the diagonal are calibrated: a 70% price translated into roughly 70% actual wins.</p></div><div className="calibration-takeaway"><small>All analysed games</small><strong>{formatPercent(summary.favorite_win_rate_pct)} actual</strong><span>vs {formatPercent(summary.avg_favorite_implied_pct)} price · {formatDelta(delta)}</span></div></div>
    <figure className="calibration-chart" aria-label="Calibration plot comparing observed favorite win rate with average pre-match market price">
      <div className="chart-legend"><span><i className="legend-swatch actual-dot" />Observed favorite wins</span><span><i className="legend-swatch reference-line" />Perfect calibration</span></div>
      <div className="calibration-plot-wrap">
        <svg className="calibration-plot" viewBox={`0 0 ${plot.width} ${plot.height}`} role="img" aria-labelledby="calibration-title calibration-description">
          <title id="calibration-title">Observed win rate versus market price</title>
          <desc id="calibration-description">The horizontal axis is the average favorite market price and the vertical axis is the observed favorite win rate. The diagonal line represents perfect calibration.</desc>
          <rect className="chart-surface" x={plot.left} y={plot.top} width={plotWidth} height={plotHeight} rx="8" />
          {ticks.map((tick) => <g key={tick}><line className="chart-gridline" x1={plot.left} x2={plot.left + plotWidth} y1={yTick(tick)} y2={yTick(tick)} /><line className="chart-gridline vertical" x1={xTick(tick)} x2={xTick(tick)} y1={plot.top} y2={plot.top + plotHeight} /><text className="chart-tick" x={plot.left - 10} y={yTick(tick) + 4} textAnchor="end">{tick}%</text><text className="chart-tick" x={xTick(tick)} y={plot.top + plotHeight + 22} textAnchor="middle">{tick}%</text></g>)}
          <line className="calibration-reference" x1={xTick(50)} y1={yTick(50)} x2={xTick(100)} y2={yTick(100)} />
          <text className="calibration-reference-label" x={xTick(82)} y={yTick(82) - 9}>Perfect calibration</text>
          {points.map((point) => <g className={`calibration-point ${hoveredBand === point.band ? "is-hovered" : ""}`} key={point.band} role="button" tabIndex="0" onMouseEnter={() => setHoveredBand(point.band)} onMouseLeave={() => setHoveredBand("")} onFocus={() => setHoveredBand(point.band)} onBlur={() => setHoveredBand("")} onKeyDown={(event) => { if (event.key === "Escape") setHoveredBand(""); }}>
            <circle className="calibration-point-hit" cx={point.x} cy={point.y} r="15" />
            <circle className="calibration-point-dot" cx={point.x} cy={point.y} r={Number(point.games) >= 25 ? 9 : 7} />
            <text className="calibration-point-label" x={Math.min(plot.left + plotWidth - 4, point.x + 11)} y={Math.max(plot.top + 13, point.y - 11)}>{point.band.replace("%", "")}</text>
            <title>{`${point.band}: ${formatPercent(point.win_rate_pct)} actual vs ${formatPercent(point.avg_implied_pct)} price, n=${formatNumber(point.games)}`}</title>
          </g>)}
          <text className="chart-axis-label" x={plot.left + plotWidth / 2} y={plot.height - 9} textAnchor="middle">Average pre-match market price</text>
          <text className="chart-axis-label" transform={`rotate(-90 15 ${plot.top + plotHeight / 2})`} x="15" y={plot.top + plotHeight / 2} textAnchor="middle">Observed favorite win rate</text>
        </svg>
      </div>
      <div className="calibration-hover-readout" aria-live="polite">{hovered ? <><strong>{hovered.band}</strong><span>{formatPercent(hovered.win_rate_pct)} actual wins vs {formatPercent(hovered.avg_implied_pct)} price · {formatDelta(hovered.calibration_delta_pct)} · n={formatNumber(hovered.games)}</span></> : <span>Hover or focus a dot to see the exact band values.</span>}</div>
      <figcaption>Blue dots show what happened; the diagonal is the market’s “right on target” line. A dot below the line means the market was more confident than the results justified.</figcaption>
    </figure>
  </LayerCard>;
}

function summarizeOddsGroups(games) {
  const definitions = [
    { key: "favorite", label: "Favorites", priceKey: "favorite_implied_pct", resultKey: "favorite_result" },
    { key: "underdog", label: "Underdogs", priceKey: "underdog_price", resultKey: "underdog_result", priceIsDecimal: true },
    { key: "home", label: "Home teams", priceKey: "home_implied_pct", resultKey: "home_result", requiresVenuePair: true },
    { key: "away", label: "Away teams", priceKey: "away_implied_pct", resultKey: "away_result", requiresVenuePair: true },
  ];
  return definitions.map((definition) => {
    const observations = games.map((game) => {
      const rawPrice = game[definition.priceKey];
      const result = game[definition.resultKey];
      if (definition.requiresVenuePair && game.home_away_status !== "available") return null;
      if (rawPrice == null || !["win", "loss"].includes(result)) return null;
      const price = definition.priceIsDecimal ? Number(rawPrice) * 100 : Number(rawPrice);
      return Number.isFinite(price) ? { price, won: result === "win" } : null;
    }).filter(Boolean);
    const wins = observations.filter((row) => row.won).length;
    return {
      ...definition,
      games: observations.length,
      wins,
      actual: observations.length ? wins / observations.length * 100 : null,
      price: observations.length ? observations.reduce((total, row) => total + row.price, 0) / observations.length : null,
    };
  });
}

function ComparisonChart({ games }) {
  const rows = summarizeOddsGroups(games);
  return <LayerCard className="panel comparison-panel">
    <div className="panel-header"><div className="panel-heading-copy"><Kicker>Outcome split</Kicker><h2>Actual wins vs average price</h2><p>Blue is the observed win rate. The vertical marker is the average pre-match price for the same group.</p></div></div>
    <figure className="comparison-chart" aria-label="Observed win rate compared with average pre-match price for favorites, underdogs, home teams, and away teams">
      <div className="chart-legend"><span><i className="legend-swatch actual" />Actual win rate</span><span><i className="legend-swatch price-marker" />Average price</span></div>
      <div className="comparison-axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
      <div className="comparison-rows">{rows.map((row) => <div className="comparison-row" key={row.key}><div className="comparison-row-label"><strong>{row.label}</strong><small>n={formatNumber(row.games)}</small></div><div className="comparison-track"><span className="comparison-fill" style={{ width: `${Math.max(0, Math.min(100, Number(row.actual || 0)))}%` }} />{row.price != null && <span className="comparison-marker" style={{ left: `${Math.max(0, Math.min(100, row.price))}%` }} aria-hidden="true" />}</div><div className="comparison-values"><strong>{formatPercent(row.actual)}</strong><span>{row.price == null ? "—" : `price ${formatPercent(row.price)}`}</span></div></div>)}</div>
      <figcaption>Comparisons use the same resolved, priced games selected by the current filters. Home and away appear only when the cached event snapshot identifies the venue.</figcaption>
    </figure>
  </LayerCard>;
}

function OddsPerformanceView({ filters, setFilters, oddsFilters, setOddsFilters, catalog, analysis, loading, error, onRetry }) {
  const summary = analysis?.summary || {};
  const teams = catalog?.teams || [];
  const teamRows = analysis?.team_rows || [];
  const bands = analysis?.bands || [];
  const games = analysis?.games || [];
  const exportPath = buildQuery("/api/analytics/odds-performance", { sport: filters.sport, team: oddsFilters.team, role: oddsFilters.role, export: 1 });
  const segmentLabel = (segment) => {
    if (!segment || !segment.games) return "—";
    return `${segment.wins}-${segment.losses} · ${formatPercent(segment.win_rate_pct)}`;
  };
  return <>
    <section className="page-heading compact-heading">
      <div><Kicker>Market calibration</Kicker><h1>Pre-match odds and results</h1><p className="page-lede">Compare each team’s stored pre-match market price with what happened, split by favorite, underdog, and—when the event snapshot provides it—home or away.</p></div>
      <div className="last-check-card"><span className="last-check-icon"><ChartLine size={20} /></span><span><small>Data snapshot</small><strong>{formatNumber(summary.selected_games)} games analysed</strong></span></div>
    </section>
    <LayerCard className="panel odds-toolbar">
      <div className="toolbar-top"><div><Kicker>Filters</Kicker><h2>Choose a dataset and lens</h2></div><div className="toolbar-actions"><a className="button-link secondary" href={apiUrl(exportPath)}><FileCsv size={17} /> Export CSV</a><Button type="button" variant="secondary" onClick={() => setOddsFilters({ team: "", role: "all" })}><ArrowClockwise size={16} /> Reset filters</Button></div></div>
      <div className="filter-grid odds-filter-grid">
        <label className="field-block"><span className="field-label">Dataset</span><select className="native-select" value={filters.sport} onChange={(event) => setFilters((current) => ({ ...current, sport: event.target.value }))}><option value="wnba_2026">WNBA 2026</option><option value="nfl_2025">NFL 2025</option></select></label>
        <label className="field-block"><span className="field-label">Team</span><select className="native-select" value={oddsFilters.team} onChange={(event) => setOddsFilters((current) => ({ ...current, team: event.target.value }))}><option value="">All teams</option>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select></label>
        <label className="field-block"><span className="field-label">View</span><select className="native-select" value={oddsFilters.role} onChange={(event) => setOddsFilters((current) => ({ ...current, role: event.target.value }))}><option value="all">All team roles</option><option value="favorite">Favorites only</option><option value="underdog">Underdogs only</option><option value="home">Home teams only</option><option value="away">Away teams only</option></select></label>
      </div>
      <div className="info-callout odds-callout"><Info size={17} /><span><strong>How to read this:</strong> the price is a Polymarket trade-price proxy captured before kickoff. It is not a sportsbook line, and a positive calibration delta means the team won more often than its average observed price implied.</span></div>
    </LayerCard>
    {error && <Alert>{error}<button type="button" className="retry-inline" onClick={onRetry}>Try again</button></Alert>}
    {loading && <div className="table-state"><div className="table-skeleton" /><div className="table-skeleton" /><div className="table-skeleton" /></div>}
    {!loading && analysis && <>
      {Number(summary.games_missing_prematch_prices || 0) > 0 && <div className="info-callout odds-warning"><WarningCircle size={17} /><span>{formatNumber(summary.games_missing_prematch_prices)} resolved market{Number(summary.games_missing_prematch_prices) === 1 ? "" : "s"} did not have two pre-match prices and {summary.tie_markets ? "ties are excluded from win-rate calculations." : "were excluded from win-rate calculations."}</span></div>}
      <section className="metrics-grid odds-metrics"><MetricCard label="Games analysed" value={formatNumber(summary.selected_games)} detail="Resolved, non-tie games with prices" icon={CheckCircle} tone="green" /><MetricCard label="Favorite win rate" value={formatPercent(summary.favorite_win_rate_pct)} detail={`n=${formatNumber(summary.favorite_games)}`} icon={Trophy} tone="blue" /><MetricCard label="Average favorite price" value={formatPercent(summary.avg_favorite_implied_pct)} detail="Before cached kickoff" icon={ChartLine} tone="violet" /><MetricCard label="Home / away coverage" value={formatPercent(summary.home_away_coverage_pct)} detail={`${formatNumber(summary.home_away_games)} games mapped`} icon={ShieldCheck} tone="orange" /></section>
      <section className="odds-visual-grid"><CalibrationChart bands={bands} summary={summary} /><ComparisonChart games={games} /></section>
      <section className="odds-grid">
        <LayerCard className="panel odds-band-panel"><div className="panel-header"><div className="panel-heading-copy"><Kicker>Exact values</Kicker><h2>Favorite price bands</h2><p>Use this table when you need the precise counts behind the chart.</p></div></div><div className="table-scroll"><table className="analytics-table compact-table odds-band-table"><thead><tr><th>Price band</th><th>Games</th><th>Favorite wins</th><th>Actual rate</th><th>Avg price</th><th>Delta</th></tr></thead><tbody>{bands.map((row) => <tr key={row.band}><td><strong>{row.band}</strong></td><td>{formatNumber(row.games)}</td><td>{formatNumber(row.wins)}–{formatNumber(row.losses)}</td><td>{formatPercent(row.win_rate_pct)}</td><td>{formatPercent(row.avg_implied_pct)}</td><td className={Number(row.calibration_delta_pct) >= 0 ? "delta-positive" : "delta-negative"}>{formatDelta(row.calibration_delta_pct)}</td></tr>)}</tbody></table></div></LayerCard>
        <LayerCard className="panel odds-method-panel"><div className="panel-header"><div className="panel-heading-copy"><Kicker>Method and coverage</Kicker><h2>What is in the comparison</h2></div></div><dl className="odds-method-list"><div><dt>Markets in snapshot</dt><dd>{formatNumber(summary.markets_total)}</dd></div><div><dt>Resolved markets</dt><dd>{formatNumber(summary.resolved_markets)}</dd></div><div><dt>Pre-match prices</dt><dd>{formatNumber(summary.games_with_prematch_prices)}</dd></div><div><dt>Venue metadata</dt><dd>{formatPercent(summary.home_away_coverage_pct)}</dd></div></dl><p className="method-note">{analysis.methodology?.calibration}</p></LayerCard>
      </section>
        <LayerCard className="panel odds-team-panel"><div className="table-summary"><div><Kicker>Team performance</Kicker><h2>{oddsFilters.team ? `${oddsFilters.team} by role` : "Teams by role"}</h2><p>Record, observed price, and actual-minus-price delta. Home/away rows are only shown when cached event metadata identifies the venue.</p></div><div className="table-summary-meta"><span><small>Role filter</small><strong>{oddsFilters.role === "all" ? "All roles" : oddsFilters.role}</strong></span><span><small>Teams</small><strong>{formatNumber(teamRows.length)}</strong></span></div></div><div className="table-scroll"><table className="analytics-table odds-team-table"><caption className="sr-only">Team pre-match odds and results</caption><thead><tr><th>Team</th><th>Games</th><th>Record</th><th>Win rate</th><th>Avg price</th><th>Delta</th><th>Favorite</th><th>Underdog</th><th>Home</th><th>Away</th></tr></thead><tbody>{teamRows.map((row) => <tr key={row.team}><td><strong>{row.team}</strong></td><td>{formatNumber(row.games)}</td><td>{row.wins}–{row.losses}</td><td>{formatPercent(row.win_rate_pct)}</td><td>{formatPercent(row.avg_implied_pct)}</td><td className={Number(row.calibration_delta_pct) >= 0 ? "delta-positive" : "delta-negative"}>{formatDelta(row.calibration_delta_pct)}</td><td>{segmentLabel(row.favorite)}</td><td>{segmentLabel(row.underdog)}</td><td>{segmentLabel(row.home)}</td><td>{segmentLabel(row.away)}</td></tr>)}</tbody></table></div>{!teamRows.length && <div className="empty-state"><ChartLine size={27} /><strong>No team rows match this lens.</strong><span>Try all roles or clear the team filter.</span></div>}</LayerCard>
      <LayerCard className="panel odds-games-panel"><div className="table-summary"><div><Kicker>Game-level audit</Kicker><h2>Pre-match price and result</h2><p>Use this table to inspect the source-backed rows behind the aggregate rates.</p></div><div className="table-summary-meta"><span><small>Rows</small><strong>{formatNumber(games.length)}</strong></span></div></div><div className="table-scroll"><table className="analytics-table odds-game-table"><thead><tr><th>Date</th><th>Matchup</th><th>Favorite</th><th>Price</th><th>Winner</th><th>Favorite result</th><th>Home</th><th>Away</th></tr></thead><tbody>{games.map((game) => <tr key={game.condition_id}><td>{formatDateOnly(game.event_date)}</td><td>{game.title}</td><td>{game.favorite_team || "—"}</td><td>{formatPercent(game.favorite_implied_pct)}</td><td>{game.winner || (game.resolution === "tie" ? "Tie" : "—")}</td><td><span className={`result-chip ${game.favorite_result || "unresolved"}`}>{game.favorite_result || "No price"}</span></td><td>{game.home_team || "Unknown"}</td><td>{game.away_team || "Unknown"}</td></tr>)}</tbody></table></div></LayerCard>
      <details className="methodology odds-methodology"><summary>Full methodology</summary><div className="methodology-copy"><p>{analysis.methodology?.pre_match_price}</p><p>{analysis.methodology?.favorite}</p><p>{analysis.methodology?.home_away}</p><p>{analysis.methodology?.calibration}</p></div></details>
    </>}
  </>;
}

function RunHistoryView({ data, selectedRunId, setSelectedRunId, runDetail, setRunDetail, onRefresh, onCopy }) {
  const [level, setLevel] = useState("");
  const [step, setStep] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const runs = data?.runtime?.history || [];
  const active = data?.runtime?.running ? data.runtime.last_run : null;
  useEffect(() => {
    if (!selectedRunId) return undefined;
    let cancelled = false;
    request(buildQuery(`/api/runs/${selectedRunId}`, { level, step, search })).then((response) => { if (!cancelled) setRunDetail(response.run); }).catch((cause) => { if (!cancelled) setActionError(cause.message); });
    return () => { cancelled = true; };
  }, [selectedRunId, level, step, search, setRunDetail]);
  async function runAction(path) {
    setActionError("");
    try { await request(path, { method: "POST", body: "{}" }); await onRefresh(); } catch (cause) { setActionError(cause.message); }
  }
  const steps = runDetail?.steps || [];
  const visibleLogs = runDetail?.logs || [];
  const allLogText = visibleLogs.map((event) => `${event.timestamp_utc || ""} [${event.level || "info"}] ${event.step || ""} ${event.message || ""}`).join("\n");
  return <><section className="page-heading compact-heading"><div><Kicker>Operations</Kicker><h1>Run history</h1><p className="page-lede">Inspect refresh outcomes, step timing, validation output, and publication details.</p></div><Button type="button" variant="secondary" onClick={onRefresh}><ArrowClockwise size={17} /> Refresh history</Button></section>{active && <div className="active-run-banner"><div className="active-run-icon"><ArrowClockwise className="spin" size={20} /></div><div><strong>{active.sport} refresh is running</strong><span>{active.current_step || data.runtime.current_step || "Starting"} · started {formatDate(active.started_at_utc)}</span></div><Button type="button" variant="secondary" onClick={() => runAction(`/api/runs/${active.id}/cancel`)}><Stop size={16} /> Cancel at safe step</Button></div>}{actionError && <Alert>{actionError}</Alert>}<LayerCard className="panel runs-panel"><div className="table-scroll"><table className="analytics-table runs-table"><thead><tr><th>Run ID</th><th>Dataset</th><th>Status</th><th>Trigger</th><th>Started</th><th>Duration</th><th>Validation</th><th>Publication</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className={selectedRunId === run.id ? "selected-row" : ""} onClick={() => setSelectedRunId(run.id)}><td><button type="button" className="run-link">{run.id}</button></td><td>{run.sport}</td><td><StatusBadge status={run.status}>{run.status}</StatusBadge></td><td>{run.trigger || "manual"}</td><td>{formatDate(run.started_at_utc)}</td><td>{formatDuration(run.duration_seconds)}</td><td>{run.metrics?.validation_score || run.validation_score || (run.status === "success" ? "Passed" : "—")}</td><td>{run.push?.pushed ? <span className="published"><Check size={15} /> Pushed</span> : "Not pushed"}</td></tr>)}</tbody></table></div>{!runs.length && <div className="empty-state large-empty"><FileText size={31} /><strong>No completed runs yet.</strong><span>Start a data update to create the first run record.</span></div>}</LayerCard>{runDetail && <LayerCard className="panel run-detail-panel"><div className="detail-heading"><div><Kicker>Run detail</Kicker><h2>{runDetail.id}</h2><p>{runDetail.sport} · {runDetail.status} · {formatDate(runDetail.started_at_utc)}</p></div><div className="detail-heading-actions"><StatusBadge status={runDetail.status}>{runDetail.status}</StatusBadge>{runDetail.status !== "running" && <Button type="button" variant="secondary" onClick={() => runAction(`/api/runs/${runDetail.id}/retry`)}><Play size={16} /> Retry</Button>}</div></div><div className="run-detail-grid"><div><h3>Pipeline steps</h3><div className="run-steps">{steps.map((item) => <div className="run-step" key={item.name}><span className={`step-dot ${item.status}`} /> <span><strong>{item.name}</strong><small>{item.status} · {formatDuration(item.duration_seconds)}</small></span></div>)}</div></div><div><h3>Run metrics</h3><div className="run-metrics"><span><small>Full checks</small><strong>{runDetail.full_validation ? "Yes" : "No"}</strong></span><span><small>Duration</small><strong>{formatDuration(runDetail.duration_seconds)}</strong></span><span><small>Validation</small><strong>{runDetail.metrics?.validation_score || "—"}</strong></span><span><small>Commit</small><strong>{runDetail.push?.commit ? String(runDetail.push.commit).slice(0, 7) : "—"}</strong></span><span><small>Download</small><strong>{runDetail.download_url ? "Available" : "—"}</strong></span></div></div></div><div className="log-toolbar"><div><h3>Structured logs</h3><p>{visibleLogs.length} visible entries</p></div><div className="log-controls"><input className="native-input" placeholder="Search logs" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search logs" /><select className="native-select" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Filter logs by level"><option value="">All levels</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option></select><select className="native-select" value={step} onChange={(event) => setStep(event.target.value)} aria-label="Filter logs by pipeline step"><option value="">All steps</option>{steps.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></div></div><div className="log-actions"><button type="button" className="button-link secondary" onClick={() => onCopy(allLogText)}><Copy size={16} /> Copy visible logs</button><a className="button-link secondary" href={apiUrl(buildQuery(`/api/runs/${runDetail.id}/logs`, { ...{ level, step, search }, format: "json" }))}><DownloadSimple size={16} /> Download JSON</a><a className="button-link secondary" href={apiUrl(buildQuery(`/api/runs/${runDetail.id}/logs`, { ...{ level, step, search }, format: "text" }))}><DownloadSimple size={16} /> Download text</a></div><div className="log-viewer">{visibleLogs.map((event, index) => <div className={`log-line log-${event.level || "info"}`} key={`${event.timestamp_utc}-${index}`}><time>{formatDate(event.timestamp_utc)}</time><span className="log-level">{event.level || "info"}</span><span className="log-step">{event.step || "—"}</span><code>{event.message}</code></div>)}</div></LayerCard>}</>;
}

function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialView = initialParams.get("view");
  const initialSport = FALLBACK_SPORTS.some((sport) => sport.id === initialParams.get("sport")) ? initialParams.get("sport") : FALLBACK_CONFIG.sport;
  const [view, setView] = useState(VALID_VIEWS.has(initialView) ? initialView : "updates");
  const [data, setData] = useState(null);
  const [form, setForm] = useState(FALLBACK_CONFIG);
  const [formDirty, setFormDirty] = useState(false);
  const [filters, setFilters] = useState({ sport: initialSport, team: initialParams.get("team") || "", condition_id: initialParams.get("condition_id") || "", sample: initialParams.get("sample") || "season", min_picks: queryNumber(initialParams, "min_picks", 5), include_no_pick: ["1", "true"].includes(initialParams.get("include_no_pick")), search: initialParams.get("search") || "", sort: initialParams.get("sort") || "confidence_score", direction: initialParams.get("direction") || "desc", page: queryNumber(initialParams, "page", 1), page_size: queryNumber(initialParams, "page_size", 25), start_date: initialParams.get("start_date") || "", end_date: initialParams.get("end_date") || "" });
  const [oddsFilters, setOddsFilters] = useState({ team: initialParams.get("odds_team") || "", role: initialParams.get("odds_role") || "all" });
  const [catalog, setCatalog] = useState(null);
  const [result, setResult] = useState(null);
  const [gameTrend, setGameTrend] = useState(null);
  const [oddsAnalysis, setOddsAnalysis] = useState(null);
  const [trader, setTrader] = useState(null);
  const [traderWallet, setTraderWallet] = useState(initialParams.get("wallet") || "");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await request("/api/status");
        if (cancelled) return;
        setData(response);
        setError("");
        if (!formDirty && response.config) {
          setForm(response.config);
          setFilters((current) => ({ ...current, sport: response.config.sport }));
        }
      } catch (cause) {
        if (!cancelled) setError(cause.message || "The local controller is unavailable.");
      }
    }
    load();
    const timer = window.setInterval(load, data?.runtime?.running ? 3000 : 12000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [data?.runtime?.running, formDirty]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    if (view === "team" || view === "game") Object.entries(filters).forEach(([key, value]) => { if (value !== "" && value !== false && value !== undefined) params.set(key, value); });
    if (view === "odds") { params.set("sport", filters.sport); if (oddsFilters.team) params.set("odds_team", oddsFilters.team); else params.delete("odds_team"); params.set("odds_role", oddsFilters.role); }
    if (view === "trader" && traderWallet) params.set("wallet", traderWallet);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [view, filters, oddsFilters, traderWallet]);

  const sports = data?.sports?.length ? data.sports : FALLBACK_SPORTS;
  const selected = useMemo(() => sports.find((sport) => sport.id === form.sport) || sports[0], [sports, form.sport]);
  const runtime = data?.runtime || {};
  const validation = selected?.validation || {};
  const counts = selected?.counts || {};
  const validationUrl = buildRawUrl(data?.project?.repository, data?.project?.branch, `reports/${selected?.id}_validation.json`);
  const analyticsView = view === "team" || view === "game";
  const catalogView = analyticsView || view === "game-trends" || view === "odds";

  useEffect(() => {
    if (!catalogView) return undefined;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    request(`/api/analytics/catalog?sport=${encodeURIComponent(filters.sport)}`).then((response) => {
      if (cancelled) return;
      setCatalog(response);
      setFilters((current) => ({ ...current, team: current.team && response.teams.includes(current.team) ? current.team : response.teams[0] || "", condition_id: current.condition_id && response.games.some((game) => game.condition_id === current.condition_id) ? current.condition_id : response.games[0]?.condition_id || "" }));
      setOddsFilters((current) => ({ ...current, team: current.team && response.teams.includes(current.team) ? current.team : "" }));
    }).catch((cause) => { if (!cancelled) setAnalyticsError(cause.message || "Could not load the dataset catalog."); }).finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [catalogView, view, filters.sport]);

  useEffect(() => {
    if (!analyticsView || !catalog || (view === "team" && !catalog.teams?.includes(filters.team)) || (view === "game" && !catalog.games?.some((game) => game.condition_id === filters.condition_id))) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAnalyticsLoading(true);
      setAnalyticsError("");
      request(buildQuery("/api/analytics/leaderboard", { ...filters, dimension: view })).then((response) => { if (!cancelled) setResult(response); }).catch((cause) => { if (!cancelled) setAnalyticsError(cause.message || "Could not load the leaderboard."); }).finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [analyticsView, view, filters, catalog]);

  useEffect(() => {
    if (view !== "game-trends" || !filters.condition_id) return undefined;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    request(buildQuery("/api/analytics/game-trends", { sport: filters.sport, condition_id: filters.condition_id })).then((response) => { if (!cancelled) setGameTrend(response); }).catch((cause) => { if (!cancelled) setAnalyticsError(cause.message || "Could not load game trends."); }).finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [view, filters.sport, filters.condition_id]);

  useEffect(() => {
    if (view !== "odds") return undefined;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    request(buildQuery("/api/analytics/odds-performance", { sport: filters.sport, team: oddsFilters.team, role: oddsFilters.role })).then((response) => { if (!cancelled) setOddsAnalysis(response); }).catch((cause) => { if (!cancelled) setAnalyticsError(cause.message || "Could not load the odds comparison."); }).finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [view, filters.sport, oddsFilters.team, oddsFilters.role]);

  function setField(name, value) { setForm((current) => ({ ...current, [name]: value })); setFormDirty(true); setNotice(""); }
  function openView(nextView) { setView(nextView); setAnalyticsError(""); if (nextView !== "trader") setTrader(null); }
  async function saveSchedule() { setSaving(true); try { const response = await request("/api/config", { method: "POST", body: JSON.stringify(form) }); setForm(response.config); setFormDirty(false); setNotice(response.config.enabled ? "Schedule saved." : "Schedule paused."); setData(await request("/api/status")); } catch (cause) { setError(cause.message || "Could not save settings."); } finally { setSaving(false); } }
  async function runNow() { setStarting(true); try { const response = await request("/api/run", { method: "POST", body: JSON.stringify({ sport: form.sport, full_validation: form.full_validation }) }); setNotice(`${selected?.label || "Refresh"} started${response.run_id ? ` · run ${response.run_id}` : ""}.`); setError(""); setData(await request("/api/status")); } catch (cause) { setError(cause.message || "Could not start the refresh."); } finally { setStarting(false); } }
  async function refreshStatus() { try { setData(await request("/api/status")); } catch (cause) { setError(cause.message); } }
  async function copyText(value) { try { await navigator.clipboard.writeText(value); setNotice("Copied to clipboard."); } catch { setNotice(value); } }
  function openTrader(wallet) { setTraderWallet(wallet); setView("trader"); setAnalyticsLoading(true); setAnalyticsError(""); request(buildQuery("/api/analytics/trader", { sport: filters.sport, wallet })).then((response) => setTrader(response)).catch((cause) => setAnalyticsError(cause.message)).finally(() => setAnalyticsLoading(false)); }
  function loadTrader() { if (!traderWallet.trim()) return; setTrader(null); setAnalyticsLoading(true); setAnalyticsError(""); request(buildQuery("/api/analytics/trader", { sport: filters.sport, wallet: traderWallet.trim() })).then((response) => setTrader(response)).catch((cause) => setAnalyticsError(cause.message)).finally(() => setAnalyticsLoading(false)); }

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><button type="button" className="brand-lockup" onClick={() => openView("updates")}><div className="brand-mark"><span /></div><span><strong>Polymarket Analytics</strong><small>Data updates</small></span></button><div className="topbar-actions">{data?.project?.repository && <a className="repo-link" href={`https://github.com/${data.project.repository}`} target="_blank" rel="noreferrer"><GithubLogo size={16} /><span>{data.project.repository}</span><ArrowUpRight size={14} /></a>}<StatusBadge status={error ? "offline" : runtime.running ? "running" : "online"}>{error ? "Controller offline" : runtime.running ? "Refresh running" : "Controller online"}</StatusBadge></div></div></header>
    <nav className="tabbar" aria-label="Analytics views"><div className="tabbar-inner">{TABS.map((tab) => <button type="button" key={tab.id} className={`tab-button ${view === tab.id ? "is-active" : ""}`} onClick={() => openView(tab.id)} aria-current={view === tab.id ? "page" : undefined}><tab.icon size={17} />{tab.label}</button>)}</div></nav>
    <main className="page-wrap">
      {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
      {notice && <Alert type="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {view === "updates" && <DataUpdatesView data={data} selected={selected} sports={sports} form={form} setField={setField} runtime={runtime} validation={validation} counts={counts} runNow={runNow} starting={starting} saveSchedule={saveSchedule} saving={saving} formDirty={formDirty} validationUrl={validationUrl} />}
      {analyticsView && <AnalyticsView dimension={view} filters={filters} setFilters={setFilters} catalog={catalog} result={result} loading={analyticsLoading} error={analyticsError} onRetry={() => setFilters((current) => ({ ...current }))} onOpenTrader={openTrader} onCopy={copyText} />}
      {view === "trader" && <TraderTrendsView sport={filters.sport} wallet={traderWallet} setWallet={setTraderWallet} trader={trader} loading={analyticsLoading} error={analyticsError} onLoad={loadTrader} onCopy={copyText} />}
      {view === "game-trends" && <GameTrendsView filters={filters} setFilters={setFilters} catalog={catalog} gameTrend={gameTrend} loading={analyticsLoading} error={analyticsError} onRetry={() => setFilters((current) => ({ ...current }))} />}
      {view === "odds" && <OddsPerformanceView filters={filters} setFilters={setFilters} oddsFilters={oddsFilters} setOddsFilters={setOddsFilters} catalog={catalog} analysis={oddsAnalysis} loading={analyticsLoading} error={analyticsError} onRetry={() => setOddsFilters((current) => ({ ...current }))} />}
      {view === "runs" && <RunHistoryView data={data} selectedRunId={selectedRunId} setSelectedRunId={setSelectedRunId} runDetail={runDetail} setRunDetail={setRunDetail} onRefresh={refreshStatus} onCopy={copyText} />}
      {view === "updates" && <section className="workflow-strip"><div className="workflow-intro"><span className="workflow-icon"><SlidersHorizontal size={20} /></span><div><Kicker>Refresh workflow</Kicker><h2>Every step leaves a local artifact</h2><p>API data, Parquet, DuckDB, analysis, validation, and the published workbook stay traceable.</p></div></div><div className="workflow-steps"><span><b>01</b>API snapshot</span><span><b>02</b>Parquet trades</span><span><b>03</b>DuckDB ledger</span><span><b>04</b>Excel + GitHub</span></div></section>}
    </main>
    <footer className="footer"><span>Local-first ETL · Parquet + DuckDB</span><span>Cloudflare Kumo UI · Public HTTPS control panel</span></footer>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
