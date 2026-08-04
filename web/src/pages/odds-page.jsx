import { useEffect, useState } from "react"
import { ArrowUpRight, CheckCircle2, ChevronDown, Download, Home, Scale, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SelectField } from "@/components/shared/fields"
import { MetricCard } from "@/components/shared/metric-card"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states"
import { StatusBadge } from "@/components/shared/status-badge"
import { apiUrl, buildQuery, formatDelta, formatNumber, formatPercent, formatShortDate, request } from "@/lib/api"
import { cn } from "@/lib/utils"

function wilsonInterval(wins, total, z = 1.96) {
  if (!total) return [0, 0]
  const p = wins / total
  const z2 = z * z
  const denominator = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / denominator
  const spread = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator
  return [Math.max(0, (center - spread) * 100), Math.min(100, (center + spread) * 100)]
}

function CalibrationChart({ bands, summary }) {
  const width = 760
  const height = 410
  const plot = { left: 58, right: 28, top: 28, bottom: 62 }
  const chartBands = bands.map((row) => ({
    ...row,
    interval: wilsonInterval(Number(row.wins || 0), Number(row.games || 0)),
  }))
  const values = chartBands.flatMap((row) => [
    Number(row.avg_implied_pct),
    Number(row.win_rate_pct),
    Number(row.interval[0]),
    Number(row.interval[1]),
  ]).filter(Number.isFinite)
  const minimum = values.length ? Math.min(...values) : 40
  const maximum = values.length ? Math.max(...values) : 100
  const domainMin = Math.max(0, Math.floor((minimum - 5) / 10) * 10)
  const domainMax = Math.min(100, Math.max(domainMin + 20, Math.ceil((maximum + 5) / 10) * 10))
  const plotWidth = width - plot.left - plot.right
  const plotHeight = height - plot.top - plot.bottom
  const scaleX = (value) => plot.left + ((Number(value) - domainMin) / (domainMax - domainMin)) * plotWidth
  const scaleY = (value) => plot.top + (1 - ((Number(value) - domainMin) / (domainMax - domainMin))) * plotHeight
  const ticks = []
  for (let tick = domainMin; tick <= domainMax; tick += 10) ticks.push(tick)
  const overallDelta = Number(summary.favorite_win_rate_pct || 0) - Number(summary.avg_favorite_implied_pct || 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Observed win rate versus market price</CardTitle>
        <CardDescription>Each dot is a favorite-price band; whiskers show the 95% Wilson interval for the observed result.</CardDescription>
        <CardAction><StatusBadge status={Math.abs(overallDelta) <= 3 ? "success" : "warning"}>{formatDelta(overallDelta)} overall</StatusBadge></CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-blue-600" />Observed result</span><span className="inline-flex items-center gap-2"><i className="h-px w-4 border-t border-dashed border-zinc-700" />Perfect calibration</span><span className="inline-flex items-center gap-2"><i className="h-3 w-px bg-blue-400" />95% interval</span></div>
        <div className="overflow-x-auto" role="region" aria-label="Calibration chart; scroll horizontally to see the full chart" tabIndex="0">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[680px]" role="img" aria-labelledby="calibration-chart-title calibration-chart-desc">
            <title id="calibration-chart-title">Favorite market price compared with observed win rate</title>
            <desc id="calibration-chart-desc">Dots compare average market price and observed favorite win rate for each price band. Vertical lines show 95 percent Wilson intervals. The diagonal line is perfect calibration.</desc>
            <rect x={plot.left} y={plot.top} width={plotWidth} height={plotHeight} rx="8" fill="var(--muted)" opacity=".32" />
            {ticks.map((tick) => <g key={tick}><line x1={plot.left} x2={width - plot.right} y1={scaleY(tick)} y2={scaleY(tick)} stroke="var(--border)" /><line x1={scaleX(tick)} x2={scaleX(tick)} y1={plot.top} y2={height - plot.bottom} stroke="var(--border)" strokeDasharray="2 5" /><text x={plot.left - 10} y={scaleY(tick) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{tick}%</text><text x={scaleX(tick)} y={height - plot.bottom + 22} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{tick}%</text></g>)}
            <line x1={scaleX(domainMin)} y1={scaleY(domainMin)} x2={scaleX(domainMax)} y2={scaleY(domainMax)} stroke="#3f3f46" strokeWidth="1.5" strokeDasharray="5 5" />
            {chartBands.map((row) => {
              const [low, high] = row.interval
              const cx = scaleX(row.avg_implied_pct)
              const cy = scaleY(row.win_rate_pct)
              return <g key={row.band}>
                <line x1={cx} x2={cx} y1={scaleY(high)} y2={scaleY(low)} stroke="#60a5fa" strokeWidth="2" />
                <line x1={cx - 5} x2={cx + 5} y1={scaleY(high)} y2={scaleY(high)} stroke="#60a5fa" strokeWidth="2" />
                <line x1={cx - 5} x2={cx + 5} y1={scaleY(low)} y2={scaleY(low)} stroke="#60a5fa" strokeWidth="2" />
                <circle cx={cx} cy={cy} r="7" fill="#2563eb" stroke="white" strokeWidth="2"><title>{`${row.band}: ${formatPercent(row.win_rate_pct)} actual vs ${formatPercent(row.avg_implied_pct)} average price; 95% interval ${formatPercent(low)} to ${formatPercent(high)}; n=${row.games}`}</title></circle>
                <text x={Math.min(width - plot.right - 4, cx + 10)} y={Math.max(plot.top + 12, cy - 10)} fontSize="11" fontWeight="600" fill="var(--foreground)">{row.band.replace("%", "")}</text>
              </g>
            })}
            <text x={plot.left + plotWidth / 2} y={height - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--muted-foreground)">Average pre-match market price</text>
            <text transform={`rotate(-90 14 ${plot.top + plotHeight / 2})`} x="14" y={plot.top + plotHeight / 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--muted-foreground)">Observed favorite win rate</text>
          </svg>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Intervals make small samples visible. A band crossing the diagonal may be consistent with normal sampling variation even when its point estimate appears above or below the market price.</p>
      </CardContent>
    </Card>
  )
}

function comparisonGroups(games) {
  const definitions = [
    { key: "favorite", label: "Favorites", priceKey: "favorite_implied_pct", resultKey: "favorite_result", partition: "Market role" },
    { key: "underdog", label: "Underdogs", priceKey: "underdog_price", resultKey: "underdog_result", decimal: true, partition: "Market role" },
    { key: "home", label: "Home teams", priceKey: "home_implied_pct", resultKey: "home_result", venue: true, partition: "Venue" },
    { key: "away", label: "Away teams", priceKey: "away_implied_pct", resultKey: "away_result", venue: true, partition: "Venue" },
  ]
  return definitions.map((definition) => {
    const rows = games.map((game) => {
      if (definition.venue && game.home_away_status !== "available") return null
      const result = game[definition.resultKey]
      const rawPrice = game[definition.priceKey]
      if (rawPrice == null || !["win", "loss"].includes(result)) return null
      return { win: result === "win" ? 1 : 0, price: Number(rawPrice) * (definition.decimal ? 100 : 1) }
    }).filter(Boolean)
    const wins = rows.reduce((sum, row) => sum + row.win, 0)
    return { ...definition, games: rows.length, actual: rows.length ? wins / rows.length * 100 : null, price: rows.length ? rows.reduce((sum, row) => sum + row.price, 0) / rows.length : null }
  })
}

function OutcomeComparison({ games }) {
  const groups = comparisonGroups(games)
  return (
    <Card>
      <CardHeader><CardTitle>Outcome comparison</CardTitle><CardDescription>Actual win rates compared with the average price for two separate partitions.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
        {["Market role", "Venue"].map((partition) => <div key={partition}><p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{partition}</p><div className="space-y-4">{groups.filter((row) => row.partition === partition).map((row) => <div key={row.key}>
          <div className="mb-1.5 flex items-end justify-between gap-3"><span><span className="block text-sm font-medium">{row.label}</span><span className="text-[11px] text-muted-foreground">n={formatNumber(row.games)}</span></span><span className="text-right"><span className="block text-sm font-medium tabular-nums">{formatPercent(row.actual)}</span><span className="text-[11px] text-muted-foreground">price {formatPercent(row.price)}</span></span></div>
          <div className="relative h-2 overflow-visible rounded-full bg-muted"><span className="absolute inset-y-0 left-0 rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, row.actual || 0))}%` }} /><span className="absolute -top-1 h-4 w-0.5 bg-zinc-800" style={{ left: `${Math.max(0, Math.min(100, row.price || 0))}%` }} /></div>
        </div>)}</div></div>)}
      </CardContent>
    </Card>
  )
}

export function OddsPage({ sport }) {
  const [catalog, setCatalog] = useState(null)
  const [team, setTeam] = useState("")
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [catalogError, setCatalogError] = useState("")
  const [retryKey, setRetryKey] = useState(0)
  const [bandsOpen, setBandsOpen] = useState(false)
  const [teamsOpen, setTeamsOpen] = useState(false)
  const [gamesOpen, setGamesOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCatalogError("")
    request(buildQuery("/api/analytics/catalog", { sport })).then((response) => { if (!cancelled) setCatalog(response) }).catch((cause) => { if (!cancelled) setCatalogError(cause.message || "Could not load the team list.") })
    return () => { cancelled = true }
  }, [sport, retryKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    request(buildQuery("/api/analytics/odds-performance", { sport, team })).then((response) => {
      if (!cancelled) setAnalysis(response)
    }).catch((cause) => {
      if (!cancelled) setError(cause.message || "Could not load the odds comparison.")
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [sport, team, retryKey])

  const summary = analysis?.summary || {}
  const bands = analysis?.bands || []
  const games = analysis?.games || []
  const teamRows = analysis?.team_rows || []
  const hasData = Number(summary.favorite_games || 0) > 0
  const delta = Number(summary.favorite_win_rate_pct || 0) - Number(summary.avg_favorite_implied_pct || 0)
  const conclusion = Math.abs(delta) <= 1 ? "Favorite pricing was almost exact overall" : delta > 0 ? "Favorites won more often than their average price" : "Favorites won less often than their average price"
  const exportPath = buildQuery("/api/analytics/odds-performance", { sport, team, export: 1 })

  return (
    <div className="space-y-6">
      <PageHeader title="Odds & results" description="Compare stored pre-match market prices with resolved game outcomes." actions={<Button asChild variant="outline" className="h-9"><a href={apiUrl(exportPath)}>Export CSV <Download /></a></Button>} />

      <Card size="sm">
        <CardContent className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
          <SelectField label="Games involving team" value={team || "all"} onValueChange={(value) => setTeam(value === "all" ? "" : value)} options={[{ value: "all", label: "All teams" }, ...(catalog?.teams || []).map((item) => ({ value: item, label: item }))]} />
          <Button variant="ghost" className="h-10" onClick={() => setTeam("")} disabled={!team}>Reset filter</Button>
        </CardContent>
      </Card>

      {catalogError && <Card><CardContent><ErrorState compact title="Team filter unavailable" description={catalogError} onRetry={() => setRetryKey((current) => current + 1)} /></CardContent></Card>}
      {loading && <Card><CardContent><LoadingState /></CardContent></Card>}
      {error && <Card><CardContent><ErrorState description={error} onRetry={() => setRetryKey((current) => current + 1)} /></CardContent></Card>}
      {!loading && !error && analysis && !hasData && <Card><CardContent><EmptyState title="Not enough resolved games" description="This selection has no resolved games with both a pre-match market price and a recorded outcome." /></CardContent></Card>}
      {!loading && !error && analysis && hasData && <>
        <Card className="border-blue-200 bg-blue-50/50 ring-blue-200">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-medium tracking-wide text-blue-700 uppercase">Overall finding</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{conclusion}</h2><p className="mt-1 text-sm text-muted-foreground">{formatPercent(summary.favorite_win_rate_pct)} actual versus {formatPercent(summary.avg_favorite_implied_pct)} average price · {formatDelta(delta)} · n={formatNumber(summary.favorite_games)}</p></div>
            <Scale className="size-8 shrink-0 text-blue-700" />
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Games analysed" value={formatNumber(summary.selected_games)} detail="Resolved, non-tie games with prices" icon={CheckCircle2} tone="positive" />
          <MetricCard label="Favorite win rate" value={formatPercent(summary.favorite_win_rate_pct)} comparison={formatDelta(delta)} detail={`Average price ${formatPercent(summary.avg_favorite_implied_pct)}`} icon={Trophy} tone="info" />
          <MetricCard label="Venue coverage" value={formatPercent(summary.home_away_coverage_pct)} detail={`${formatNumber(summary.home_away_games)} games mapped`} icon={Home} />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]"><CalibrationChart bands={bands} summary={summary} /><OutcomeComparison games={games} /></div>

        <div className="space-y-3">
          <Collapsible open={bandsOpen} onOpenChange={setBandsOpen}><Card><CardHeader className="border-b"><div className="flex items-center justify-between gap-4"><div><CardTitle>Price-band evidence</CardTitle><CardDescription>Exact counts and point estimates behind the calibration chart.</CardDescription></div><CollapsibleTrigger asChild><Button variant="outline" className="h-9">{bandsOpen ? "Hide" : "Show"}<ChevronDown className={cn("transition-transform", bandsOpen && "rotate-180")} /></Button></CollapsibleTrigger></div></CardHeader><CollapsibleContent><CardContent className="px-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-5">Price band</TableHead><TableHead>Games</TableHead><TableHead>Record</TableHead><TableHead>Actual</TableHead><TableHead>Avg price</TableHead><TableHead>Difference</TableHead></TableRow></TableHeader><TableBody>{bands.map((row) => <TableRow key={row.band}><TableCell className="pl-5 font-medium">{row.band}</TableCell><TableCell>{formatNumber(row.games)}</TableCell><TableCell>{row.wins}–{row.losses}</TableCell><TableCell>{formatPercent(row.win_rate_pct)}</TableCell><TableCell>{formatPercent(row.avg_implied_pct)}</TableCell><TableCell className={Number(row.calibration_delta_pct) >= 0 ? "text-emerald-700" : "text-red-700"}>{formatDelta(row.calibration_delta_pct)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></CollapsibleContent></Card></Collapsible>

          <Collapsible open={teamsOpen} onOpenChange={setTeamsOpen}><Card><CardHeader className="border-b"><div className="flex items-center justify-between gap-4"><div><CardTitle>Team evidence</CardTitle><CardDescription>Role and venue splits for each matching team.</CardDescription></div><CollapsibleTrigger asChild><Button variant="outline" className="h-9">{teamsOpen ? "Hide" : "Show"}<ChevronDown className={cn("transition-transform", teamsOpen && "rotate-180")} /></Button></CollapsibleTrigger></div></CardHeader><CollapsibleContent><CardContent className="px-0"><div className="overflow-x-auto"><Table className="min-w-[860px]"><TableHeader><TableRow><TableHead className="pl-5">Team</TableHead><TableHead>Games</TableHead><TableHead>Record</TableHead><TableHead>Win rate</TableHead><TableHead>Avg price</TableHead><TableHead>Difference</TableHead><TableHead>Favorite</TableHead><TableHead>Underdog</TableHead></TableRow></TableHeader><TableBody>{teamRows.map((row) => <TableRow key={row.team}><TableCell className="pl-5 font-medium">{row.team}</TableCell><TableCell>{formatNumber(row.games)}</TableCell><TableCell>{row.wins}–{row.losses}</TableCell><TableCell>{formatPercent(row.win_rate_pct)}</TableCell><TableCell>{formatPercent(row.avg_implied_pct)}</TableCell><TableCell className={Number(row.calibration_delta_pct) >= 0 ? "text-emerald-700" : "text-red-700"}>{formatDelta(row.calibration_delta_pct)}</TableCell><TableCell>{row.favorite?.games ? `${row.favorite.wins}–${row.favorite.losses}` : "—"}</TableCell><TableCell>{row.underdog?.games ? `${row.underdog.wins}–${row.underdog.losses}` : "—"}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></CollapsibleContent></Card></Collapsible>

          <Collapsible open={gamesOpen} onOpenChange={setGamesOpen}><Card><CardHeader className="border-b"><div className="flex items-center justify-between gap-4"><div><CardTitle>Game-level audit</CardTitle><CardDescription>Source-backed rows behind the aggregate rates.</CardDescription></div><CollapsibleTrigger asChild><Button variant="outline" className="h-9">{gamesOpen ? "Hide" : "Show"}<ChevronDown className={cn("transition-transform", gamesOpen && "rotate-180")} /></Button></CollapsibleTrigger></div></CardHeader><CollapsibleContent><CardContent className="px-0"><div className="overflow-x-auto"><Table className="min-w-[820px]"><TableHeader><TableRow><TableHead className="pl-5">Date</TableHead><TableHead>Game</TableHead><TableHead>Favorite</TableHead><TableHead>Price</TableHead><TableHead>Winner</TableHead><TableHead>Result</TableHead></TableRow></TableHeader><TableBody>{games.map((game) => <TableRow key={game.condition_id}><TableCell className="pl-5">{formatShortDate(game.event_date)}</TableCell><TableCell className="font-medium">{game.title}</TableCell><TableCell>{game.favorite_team || "—"}</TableCell><TableCell>{formatPercent(game.favorite_implied_pct)}</TableCell><TableCell>{game.winner || "—"}</TableCell><TableCell><StatusBadge status={game.favorite_result === "win" ? "success" : game.favorite_result === "loss" ? "failed" : "neutral"}>{game.favorite_result || "No price"}</StatusBadge></TableCell></TableRow>)}</TableBody></Table></div></CardContent></CollapsibleContent></Card></Collapsible>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">{analysis.methodology?.calibration} <a className="inline-flex items-center gap-1 font-medium text-foreground hover:underline" href={apiUrl(buildQuery("/api/analytics/odds-performance", { sport, team }))} target="_blank" rel="noreferrer">Open raw response <ArrowUpRight className="size-3" /></a></p>
      </>}
    </div>
  )
}
