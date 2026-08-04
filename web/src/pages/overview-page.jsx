import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleGauge,
  Database,
  RefreshCw,
  Trophy,
  WalletCards,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { MetricCard } from "@/components/shared/metric-card"
import { BalancedCardGrid } from "@/components/shared/balanced-card-grid"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states"
import { StatusBadge } from "@/components/shared/status-badge"
import { buildQuery, formatDate, formatDelta, formatNumber, formatPercent, formatShortDate, request } from "@/lib/api"

function CalibrationSummary({ summary }) {
  const games = Number(summary?.favorite_games || 0)
  if (!games) {
    return (
      <Card className="h-full min-h-72">
        <CardHeader><CardTitle>Market calibration</CardTitle><CardDescription>Did pre-match favorite prices match the results?</CardDescription></CardHeader>
        <CardContent><EmptyState compact title="Not enough resolved games" description="Calibration appears after resolved games have both a pre-match price and a recorded outcome." /></CardContent>
      </Card>
    )
  }
  const actual = Number(summary?.favorite_win_rate_pct || 0)
  const price = Number(summary?.avg_favorite_implied_pct || 0)
  const delta = actual - price

  return (
    <Card className="h-full min-h-72">
      <CardHeader>
        <CardTitle>Market calibration</CardTitle>
        <CardDescription>Did pre-match favorite prices match the results?</CardDescription>
        <CardAction><StatusBadge status={Math.abs(delta) <= 3 ? "success" : "warning"}>{Math.abs(delta) <= 3 ? "Close overall" : "Review"}</StatusBadge></CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-7">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatPercent(actual)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Favorite win rate across {formatNumber(games)} resolved games</p>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Observed wins</span><span className="tabular-nums">{formatPercent(actual)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, actual))}%` }} /></div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Average market price</span><span className="tabular-nums">{formatPercent(price)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-zinc-500 dark:bg-zinc-400" style={{ width: `${Math.max(0, Math.min(100, price))}%` }} /></div>
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <span className="font-medium">Overall difference: {formatDelta(delta)}</span>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">A small overall difference does not mean every price band is equally reliable.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function RecentGames({ games, onOpenGame }) {
  const recent = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10)
    return games.filter((game) => game.event_date <= now && game.resolution_type === "resolved").slice(0, 6)
  }, [games])

  return (
    <Card className="h-full min-h-72">
      <CardHeader>
        <CardTitle>Recent games</CardTitle>
        <CardDescription>Open a completed game to inspect wallet activity.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {recent.map((game) => (
            <button
              key={game.condition_id}
              type="button"
              onClick={() => onOpenGame(game.condition_id)}
              className="group flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium group-hover:underline group-hover:underline-offset-4">{game.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{formatShortDate(game.event_date)}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
          {!recent.length && <p className="py-10 text-center text-sm text-muted-foreground">No completed games are available yet.</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function OverviewPage({ data, selected, onNavigate }) {
  const [analysis, setAnalysis] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    Promise.all([
      request(buildQuery("/api/analytics/odds-performance", { sport: selected?.id })),
      request(buildQuery("/api/analytics/catalog", { sport: selected?.id })),
    ]).then(([odds, nextCatalog]) => {
      if (cancelled) return
      setAnalysis(odds)
      setCatalog(nextCatalog)
    }).catch((cause) => {
      if (!cancelled) setError(cause.message || "Could not load the overview.")
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [selected?.id, selected?.generated_at_utc, retryKey])

  const counts = selected?.counts || {}
  const validation = selected?.validation || {}
  const totalChecks = Number(validation.pass || 0) + Number(validation.warning || 0) + Number(validation.fail || 0) + Number(validation.not_run || 0)
  const healthStatus = Number(validation.fail || 0) > 0 ? "failed" : Number(validation.warning || 0) > 0 || Number(validation.not_run || 0) > 0 ? "partial" : "success"

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${selected?.label || "Sports"} overview`}
        description="A concise view of data freshness, wallet coverage, recent games, and market calibration."
        meta={<StatusBadge status={healthStatus}>{Number(validation.pass || 0)} of {totalChecks || "—"} checks passed</StatusBadge>}
        actions={<Button className="h-9" onClick={() => onNavigate("refresh")}><RefreshCw /> Refresh data</Button>}
      />

      <BalancedCardGrid className="gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Resolved markets" value={formatNumber(counts.resolved_markets)} detail={`${formatNumber(counts.markets)} total markets`} icon={CheckCircle2} tone="positive" />
        <MetricCard label="Trade rows" value={formatNumber(counts.trade_rows)} detail="Deduplicated analytical trades" icon={Database} />
        <MetricCard label="Tracked wallets" value={formatNumber(counts.bettors)} detail="Wallets with recorded trades" icon={WalletCards} />
        <MetricCard label="Qualified wallets" value={formatNumber(counts.candidates_5games_70pct)} detail="5+ games · 70%+ profitable ledgers" icon={Trophy} tone="info" />
      </BalancedCardGrid>

      {loading && <Card><CardContent><LoadingState /></CardContent></Card>}
      {error && <Card><CardContent><ErrorState description={error} onRetry={() => setRetryKey((current) => current + 1)} /></CardContent></Card>}
      {!loading && !error && analysis && (
        <BalancedCardGrid className="xl:grid-cols-[1.15fr_.85fr]">
          <CalibrationSummary summary={analysis.summary || {}} />
          <RecentGames games={catalog?.games || []} onOpenGame={(conditionId) => onNavigate("games", { condition_id: conditionId })} />
        </BalancedCardGrid>
      )}

      <Card size="sm">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><CircleGauge className="size-4" /></div>
            <div>
              <p className="text-sm font-medium">Data current as of {formatDate(selected?.generated_at_utc)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Local snapshots remain available even when external comparisons are not run.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-9" onClick={() => onNavigate("runs")}>View run history</Button>
            <Button variant="ghost" className="h-9" onClick={() => onNavigate("odds")}><ChartNoAxesCombined /> Explore odds</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
