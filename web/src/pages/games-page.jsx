import { useEffect, useMemo, useState } from "react"
import { Activity, BarChart3, ChevronDown, CircleDollarSign, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SelectField } from "@/components/shared/fields"
import { MetricCard } from "@/components/shared/metric-card"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states"
import { StatusBadge } from "@/components/shared/status-badge"
import { buildQuery, formatMoney, formatNumber, formatPercent, formatShortDate, request } from "@/lib/api"
import { cn } from "@/lib/utils"

function GameActivityChart({ timeline, teamA, teamB }) {
  const width = 900
  const height = 350
  const margin = { left: 48, right: 24, top: 22, bottom: 48 }
  const priceBottom = 225
  const volumeTop = 250
  const volumeBottom = height - margin.bottom
  const plotWidth = width - margin.left - margin.right
  const maxVolume = Math.max(1, ...timeline.map((row) => Number(row.volume || 0)))
  const x = (index) => margin.left + (timeline.length <= 1 ? 0 : (index / (timeline.length - 1)) * plotWidth)
  const yPrice = (value) => margin.top + (1 - Number(value || 0)) * (priceBottom - margin.top)
  const yVolume = (value) => volumeBottom - (Number(value || 0) / maxVolume) * (volumeBottom - volumeTop)
  const lineSegments = (key) => {
    const segments = []
    let current = []
    timeline.forEach((row, index) => {
      if (row[key] == null) {
        if (current.length) segments.push(current)
        current = []
        return
      }
      current.push(`${x(index)},${yPrice(row[key])}`)
    })
    if (current.length) segments.push(current)
    return segments
  }
  const ticks = [0, 25, 50, 75, 100]
  const labelIndexes = [...new Set([0, Math.floor((timeline.length - 1) / 2), timeline.length - 1])].filter((value) => value >= 0)

  return (
    <figure aria-label={`Price and trading activity over time for ${teamA} versus ${teamB}`}>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-blue-600" />{teamA}</span>
        <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-zinc-700 dark:bg-zinc-300" />{teamB}</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-3 rounded-sm bg-zinc-200 dark:bg-zinc-700" />Trading volume</span>
      </div>
      <div className="overflow-x-auto" role="region" aria-label="Game activity chart; scroll horizontally to see the full chart" tabIndex="0">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[720px]" role="img">
          <title>Market prices and trading volume over time</title>
          <desc>Blue and dark lines show the average prices for each team. Gray bars show trade volume for each observed hour.</desc>
          <rect x={margin.left} y={margin.top} width={plotWidth} height={priceBottom - margin.top} rx="8" fill="var(--muted)" opacity=".35" />
          {ticks.map((tick) => {
            const y = yPrice(tick / 100)
            return <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke="var(--border)" /><text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{tick}%</text></g>
          })}
          {timeline.map((row, index) => {
            const barWidth = Math.max(3, plotWidth / Math.max(1, timeline.length) - 3)
            return <rect key={row.hour} x={x(index) - barWidth / 2} y={yVolume(row.volume)} width={barWidth} height={volumeBottom - yVolume(row.volume)} rx="2" fill="var(--border)" />
          })}
          {lineSegments("average_price_a").map((points, index) => <polyline key={`team-a-${index}`} points={points.join(" ")} fill="none" stroke="var(--chart-1)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
          {lineSegments("average_price_b").map((points, index) => <polyline key={`team-b-${index}`} points={points.join(" ")} fill="none" stroke="var(--chart-2)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
          {timeline.map((row, index) => <g key={`${row.hour}-points`}>
            {row.average_price_a != null && <circle cx={x(index)} cy={yPrice(row.average_price_a)} r="3" fill="var(--chart-1)"><title>{`${row.hour}: ${teamA} ${formatPercent(Number(row.average_price_a) * 100)} · volume ${formatMoney(row.volume)}`}</title></circle>}
            {row.average_price_b != null && <circle cx={x(index)} cy={yPrice(row.average_price_b)} r="3" fill="var(--chart-2)"><title>{`${row.hour}: ${teamB} ${formatPercent(Number(row.average_price_b) * 100)} · volume ${formatMoney(row.volume)}`}</title></circle>}
          </g>)}
          {labelIndexes.map((index) => <text key={index} x={x(index)} y={height - 16} textAnchor={index === 0 ? "start" : index === timeline.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted-foreground)">{new Date(timeline[index]?.hour).toLocaleDateString([], { month: "short", day: "numeric" })}</text>)}
          <text x={margin.left} y={volumeTop - 8} fontSize="11" fontWeight="600" fill="var(--muted-foreground)">Hourly volume</text>
        </svg>
      </div>
      <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">Prices use observed trade averages for each hour. Gaps mean no qualifying price was recorded for that team during the interval.</figcaption>
    </figure>
  )
}

function PositionDistribution({ counts, teamA, teamB }) {
  const entries = [
    ["Team A", teamA, "bg-blue-600"],
    ["Team B", teamB, "bg-zinc-700 dark:bg-zinc-300"],
    ["Hedged", "Hedged", "bg-amber-500"],
    ["Flat", "Flat", "bg-zinc-300 dark:bg-zinc-600"],
  ]
  const total = entries.reduce((sum, [key]) => sum + Number(counts?.[key] || 0), 0)
  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {entries.map(([key, , color]) => {
          const value = Number(counts?.[key] || 0)
          return value ? <span key={key} className={color} style={{ width: `${(value / total) * 100}%` }} /> : null
        })}
      </div>
      <div className="grid gap-2">
        {entries.map(([key, label, color]) => {
          const value = Number(counts?.[key] || 0)
          return <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2.5"><span className="flex min-w-0 items-center gap-2"><i className={cn("size-2 shrink-0 rounded-full", color)} /><span className="text-sm leading-5">{label}</span></span><span className="text-right text-sm font-medium tabular-nums">{formatNumber(value)} <small className="block font-normal text-muted-foreground">{total ? formatPercent(value / total * 100, 1) : "—"}</small></span></div>
        })}
      </div>
    </div>
  )
}

export function GamesPage({ sport, initialConditionId = "" }) {
  const [catalog, setCatalog] = useState(null)
  const [conditionId, setConditionId] = useState(initialConditionId)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tableOpen, setTableOpen] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    request(buildQuery("/api/analytics/catalog", { sport })).then(async (response) => {
      if (cancelled) return
      setCatalog(response)
      const validInitial = initialConditionId && response.games.some((game) => game.condition_id === initialConditionId)
      if (validInitial) {
        setConditionId(initialConditionId)
        return
      }
      const today = new Date().toISOString().slice(0, 10)
      const pastGames = response.games.filter((game) => game.event_date <= today)
      const candidates = pastGames.filter((game) => game.resolution_type === "resolved").slice(0, 8)
      let selectedId = candidates[0]?.condition_id || pastGames[0]?.condition_id || response.games[0]?.condition_id || ""
      for (const game of candidates) {
        try {
          const detail = await request(buildQuery("/api/analytics/game-trends", { sport, condition_id: game.condition_id }))
          if (Number(detail.tracked_wallets || 0) > 0 || detail.timeline?.length) {
            selectedId = game.condition_id
            break
          }
        } catch {
          // Continue to the next recent game and surface errors only for the final selection.
        }
      }
      if (!cancelled) setConditionId(selectedId)
    }).catch((cause) => {
      if (!cancelled) setError(cause.message || "Could not load the game catalog.")
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [sport, initialConditionId, retryKey])

  useEffect(() => {
    if (!conditionId) return
    let cancelled = false
    setLoading(true)
    setError("")
    request(buildQuery("/api/analytics/game-trends", { sport, condition_id: conditionId })).then((response) => {
      if (!cancelled) setAnalysis(response)
    }).catch((cause) => {
      if (!cancelled) setError(cause.message || "Could not load this game.")
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [sport, conditionId, retryKey])

  const timeline = analysis?.timeline || []
  const totals = useMemo(() => timeline.reduce((current, row) => ({
    trades: current.trades + Number(row.trades || 0),
    volume: current.volume + Number(row.volume || 0),
  }), { trades: 0, volume: 0 }), [timeline])
  const game = analysis?.game || {}

  return (
    <div className="space-y-6">
      <PageHeader title="Game activity" description="Follow market prices, trade volume, and wallet positions through a selected game." meta={game.market_status && <StatusBadge status={game.market_status === "resolved" ? "success" : game.market_status === "open" ? "running" : "neutral"}>{game.market_status}</StatusBadge>} />

      <Card size="sm">
        <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <SelectField label="Game" value={conditionId} onValueChange={setConditionId} options={(catalog?.games || []).map((item) => ({ value: item.condition_id, label: `${item.title} · ${formatShortDate(item.event_date)}` }))} />
          {game.event_date && <p className="pb-2 text-xs text-muted-foreground">{formatShortDate(game.event_date)}</p>}
        </CardContent>
      </Card>

      {loading && <Card><CardContent><LoadingState /></CardContent></Card>}
      {error && <Card><CardContent><ErrorState description={error} onRetry={() => setRetryKey((current) => current + 1)} /></CardContent></Card>}
      {!loading && !error && analysis && Number(analysis.tracked_wallets || 0) === 0 && !timeline.length && <Card><CardContent><EmptyState title="No wallet activity yet" description="This game is available in the market catalog, but no qualifying trades have been recorded. Choose a completed or active game." /></CardContent></Card>}

      {!loading && !error && analysis && (Number(analysis.tracked_wallets || 0) > 0 || timeline.length > 0) && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Tracked wallets" value={formatNumber(analysis.tracked_wallets)} detail="Wallets with an observed position" icon={UsersRound} />
          <MetricCard label="Recorded trades" value={formatNumber(totals.trades)} detail={`${formatNumber(timeline.length)} active hourly intervals`} icon={Activity} />
          <MetricCard label="Trading volume" value={formatMoney(totals.volume)} detail="Across the displayed timeline" icon={CircleDollarSign} />
          <MetricCard label={game.team_b || "Leading side"} value={formatPercent(Number(game.current_price_b || 0) * 100)} detail="Current observed market price" icon={BarChart3} tone="info" />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
          <Card>
            <CardHeader><CardTitle>Price and trading activity</CardTitle><CardDescription>Observed team prices and volume share the same time axis.</CardDescription></CardHeader>
            <CardContent><GameActivityChart timeline={timeline} teamA={game.team_a} teamB={game.team_b} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Current wallet positions</CardTitle><CardDescription>Net exposure at the latest local snapshot.</CardDescription></CardHeader>
            <CardContent><PositionDistribution counts={analysis.selection_counts || {}} teamA={game.team_a} teamB={game.team_b} /><p className="mt-5 text-xs leading-5 text-muted-foreground">{analysis.methodology}</p></CardContent>
          </Card>
        </div>

        <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3"><div><CardTitle>Hourly evidence</CardTitle><CardDescription>Exact observations behind the chart.</CardDescription></div><CollapsibleTrigger asChild><Button variant="outline" className="h-9">{tableOpen ? "Hide table" : "Show table"}<ChevronDown className={cn("transition-transform", tableOpen && "rotate-180")} /></Button></CollapsibleTrigger></div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="px-0">
                <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead className="pl-5">Time</TableHead><TableHead>Trades</TableHead><TableHead>Wallets</TableHead><TableHead>Volume</TableHead><TableHead>{game.team_a}</TableHead><TableHead>{game.team_b}</TableHead></TableRow></TableHeader><TableBody>{timeline.map((row) => <TableRow key={row.hour}><TableCell className="pl-5">{new Date(row.hour).toLocaleString()}</TableCell><TableCell>{formatNumber(row.trades)}</TableCell><TableCell>{formatNumber(row.wallets)}</TableCell><TableCell>{formatMoney(row.volume)}</TableCell><TableCell>{row.average_price_a == null ? "—" : formatPercent(Number(row.average_price_a) * 100)}</TableCell><TableCell>{row.average_price_b == null ? "—" : formatPercent(Number(row.average_price_b) * 100)}</TableCell></TableRow>)}</TableBody></Table></div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </>}
    </div>
  )
}
