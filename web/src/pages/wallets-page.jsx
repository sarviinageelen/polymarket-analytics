import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Field, SelectField } from "@/components/shared/fields"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states"
import {
  apiUrl,
  buildQuery,
  formatMoney,
  formatNumber,
  formatPercent,
  formatShortDate,
  request,
  shortWallet,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const DEFAULT_FILTERS = {
  sample: "season",
  min_picks: 5,
  search: "",
  include_no_pick: false,
  sort: "confidence_score",
  direction: "desc",
  page: 1,
  page_size: 25,
}

function RateCell({ value, sample, confidence = false }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  const number = Number(value)
  return (
    <div className="min-w-32">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs"><span className="font-medium tabular-nums">{formatPercent(number)}</span><span className="text-[11px] text-muted-foreground">n={formatNumber(sample)}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", confidence ? "bg-blue-600 dark:bg-blue-500" : "bg-zinc-500 dark:bg-zinc-400")} style={{ width: `${Math.max(0, Math.min(100, number))}%` }} /></div>
    </div>
  )
}

function SortHead({ label, column, filters, setFilters, className }) {
  const active = filters.sort === column
  const direction = active ? filters.direction : null
  const ariaSort = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"
  return (
    <TableHead aria-sort={ariaSort} className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground"
        onClick={() => setFilters((current) => ({ ...current, sort: column, direction: active && current.direction === "desc" ? "asc" : "desc", page: 1 }))}
      >
        {label}{active && (direction === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </TableHead>
  )
}

function WalletMobileList({ result, onSelect }) {
  return (
    <div className="divide-y md:hidden">
      {result.rows.map((row, index) => {
        const rank = (result.page - 1) * result.page_size + index + 1
        return (
          <button
            key={row.wallet}
            type="button"
            className="w-full p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => onSelect(row.full_wallet)}
            aria-label={`Open ${row.display_name || row.wallet_short}, rank ${rank}`}
          >
            <span className="flex items-start gap-3">
              <span className="w-6 pt-1 text-xs tabular-nums text-muted-foreground">{rank}</span>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><UserRound className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-blue-700 dark:text-blue-400">{row.display_name || row.wallet_short}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{row.wallet_short}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{row.record}</span>
            </span>
            <span className="mt-3 grid grid-cols-3 gap-2 pl-12 text-xs">
              <span><span className="block text-muted-foreground">Confidence</span><span className="mt-0.5 block font-medium tabular-nums">{formatPercent(row.confidence_score_pct)}</span></span>
              <span><span className="block text-muted-foreground">Pre-match profit</span><span className="mt-0.5 block font-medium tabular-nums">{formatPercent(row.raw_accuracy_pct)}</span></span>
              <span><span className="block text-muted-foreground">ROI</span><span className={cn("mt-0.5 block font-medium tabular-nums", Number(row.roi_pct) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{formatPercent(row.roi_pct)}</span></span>
            </span>
            {row.current_pick && <span className="mt-3 ml-12 inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">{row.current_pick}</span>}
          </button>
        )
      })}
    </div>
  )
}

function TraderSheet({ sport, wallet, open, onOpenChange }) {
  const [trader, setTrader] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || !wallet) return
    let cancelled = false
    setLoading(true)
    setError("")
    request(buildQuery("/api/analytics/trader", { sport, wallet })).then((response) => {
      if (!cancelled) setTrader(response)
    }).catch((cause) => {
      if (!cancelled) setError(cause.message || "Could not load this wallet.")
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, sport, wallet])

  async function copyAddress() {
    if (wallet) await navigator.clipboard.writeText(wallet).catch(() => {})
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-5 text-left">
          <SheetTitle>{trader?.display_name || shortWallet(wallet)}</SheetTitle>
          <SheetDescription className="flex items-center gap-2"><span className="font-mono text-xs">{shortWallet(wallet)}</span><button type="button" onClick={copyAddress} aria-label="Copy wallet address"><Copy className="size-3.5" /></button></SheetDescription>
        </SheetHeader>
        <div className="p-5">
          {loading && <LoadingState />}
          {error && <ErrorState description={error} />}
          {!loading && !error && trader && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Resolved pre-match ledgers</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(trader.resolved_picks)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Pre-match profitable rate</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatPercent(trader.raw_accuracy_pct)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Pre-match P&amp;L</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(trader.total_pnl)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Pre-match ROI</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatPercent(trader.roi_pct)}</p></div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium">Recent pre-match ledgers</h3><Button asChild variant="outline" className="h-8"><a href={`https://polymarket.com/profile/${wallet}`} target="_blank" rel="noreferrer">Profile <ExternalLink /></a></Button></div>
                <div className="divide-y rounded-xl border">
                  {(trader.recent_picks || []).slice(0, 10).map((row) => (
                    <div key={row.condition_id} className="grid grid-cols-[1fr_auto] gap-3 p-3 text-sm">
                      <div className="min-w-0"><p className="truncate font-medium">{row.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatShortDate(row.event_date)} · {row.result || "unresolved"}</p></div>
                      <span className={cn("font-medium tabular-nums", Number(row.pnl) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{formatMoney(row.pnl)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {trader.methodology && <p className="text-xs leading-5 text-muted-foreground">{trader.methodology}</p>}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function WalletsPage({ sport, initialDimension = "team" }) {
  const [dimension, setDimension] = useState(initialDimension)
  const [catalog, setCatalog] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [team, setTeam] = useState("")
  const [conditionId, setConditionId] = useState("")
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    request(buildQuery("/api/analytics/catalog", { sport })).then((response) => {
      if (cancelled) return
      setCatalog(response)
      setTeam(response.teams?.[0] || "")
      const defaultGame = response.games?.find((game) => game.resolution_type === "resolved") || response.games?.[0]
      setConditionId(defaultGame?.condition_id || "")
      setFilters(DEFAULT_FILTERS)
    }).catch((cause) => {
      if (!cancelled) setError(cause.message || "Could not load the dataset catalog.")
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [sport])

  useEffect(() => {
    if (!catalog || (dimension === "team" && !team) || (dimension === "game" && !conditionId)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError("")
      request(buildQuery("/api/analytics/leaderboard", {
        sport,
        dimension,
        team: dimension === "team" ? team : undefined,
        condition_id: dimension === "game" ? conditionId : undefined,
        ...filters,
      })).then((response) => {
        if (!cancelled) setResult(response)
      }).catch((cause) => {
        if (!cancelled) setError(cause.message || "Could not load the wallet rankings.")
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [sport, dimension, team, conditionId, filters, catalog])

  const games = catalog?.games || []
  const teams = catalog?.teams || []
  const target = result?.target || {}
  const title = dimension === "team" ? `Wallets involving ${target.team || team || "a team"}` : target.title || "Wallets by game"
  const exportPath = buildQuery("/api/analytics/leaderboard", {
    sport,
    dimension,
    team: dimension === "team" ? team : undefined,
    condition_id: dimension === "game" ? conditionId : undefined,
    ...filters,
    export: 1,
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Wallet rankings" description="Compare positions established before kickoff while accounting for sample size." actions={<Button asChild variant="outline" className="h-9"><a href={apiUrl(exportPath)}>Export CSV <Download /></a></Button>} />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle>Choose a comparison</CardTitle><CardDescription>Start with the ranking lens, then narrow the sample only when needed.</CardDescription></div>
            <div className="inline-flex w-fit rounded-lg bg-muted p-0.5" aria-label="Ranking lens">
              {[{ value: "team", label: "By team" }, { value: "game", label: "By game" }].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", dimension === item.value ? "bg-background text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground")}
                  aria-pressed={dimension === item.value}
                  onClick={() => { setDimension(item.value); setFilters((current) => ({ ...current, page: 1 })) }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1.6fr)_minmax(180px,1fr)]">
            {dimension === "team" ? (
              <SelectField label="Team" value={team} onValueChange={(value) => { setTeam(value); setFilters((current) => ({ ...current, page: 1 })) }} options={teams} />
            ) : (
              <SelectField label="Game" value={conditionId} onValueChange={(value) => { setConditionId(value); setFilters((current) => ({ ...current, page: 1 })) }} options={games.map((game) => ({ value: game.condition_id, label: `${game.title} · ${formatShortDate(game.event_date)}` }))} />
            )}
            <Field label="Search wallet" htmlFor="wallet-search">
              <div className="relative"><Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" /><Input id="wallet-search" className="h-10 pl-9" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))} placeholder="Name or wallet address" /></div>
            </Field>
            <SelectField label="Sample period" value={filters.sample} onValueChange={(value) => setFilters((current) => ({ ...current, sample: value, page: 1 }))} options={[{ value: "season", label: "Full season" }, { value: "last5", label: "Last 5 resolved" }, { value: "last10", label: "Last 10 resolved" }, { value: "last20", label: "Last 20 resolved" }]} />
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <CollapsibleTrigger asChild><Button variant="ghost" className="h-8 px-2"><SlidersHorizontal /> More filters <ChevronDown className={cn("transition-transform", advancedOpen && "rotate-180")} /></Button></CollapsibleTrigger>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Filter className="size-3.5" />{formatNumber(result?.total)} matching wallets</span>
            </div>
            <CollapsibleContent className="pt-3">
              <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[180px_1fr] sm:items-end">
                <Field label="Minimum resolved pre-match ledgers" htmlFor="minimum-resolved-ledgers"><Input id="minimum-resolved-ledgers" className="h-10" type="number" min="1" max="10000" value={filters.min_picks} onChange={(event) => setFilters((current) => ({ ...current, min_picks: event.target.value, page: 1 }))} /></Field>
                {dimension === "game" && <div className="flex h-10 items-center gap-2"><Checkbox id="include-no-pick" checked={Boolean(filters.include_no_pick)} onCheckedChange={(checked) => setFilters((current) => ({ ...current, include_no_pick: Boolean(checked), page: 1 }))} /><Label htmlFor="include-no-pick" className="text-xs font-normal text-muted-foreground">Include wallets without a qualifying position on this game</Label></div>}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{formatNumber(result?.total)} wallets match the current filters. Rankings use the 95% Wilson lower bound.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading && <LoadingState />}
          {error && <ErrorState description={error} onRetry={() => setFilters((current) => ({ ...current }))} />}
          {!loading && !error && result && result.rows?.length > 0 && (
            <>
              <WalletMobileList result={result} onSelect={setSelectedWallet} />
              <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[980px]">
                <TableHeader><TableRow>
                  <TableHead className="w-14 pl-5">Rank</TableHead>
                  <TableHead>Wallet</TableHead>
                  <SortHead label="Record" column="wins" filters={filters} setFilters={setFilters} />
                  <SortHead label="Resolved" column="picks" filters={filters} setFilters={setFilters} />
                  <SortHead label="Confidence" column="confidence_score" filters={filters} setFilters={setFilters} />
                  <SortHead label="Pre-match profitable" column="raw_accuracy" filters={filters} setFilters={setFilters} />
                  <SortHead label="ROI" column="roi" filters={filters} setFilters={setFilters} />
                  <TableHead>Pre-match position</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {result.rows.map((row, index) => (
                    <TableRow key={row.wallet}>
                      <TableCell className="pl-5 text-muted-foreground">{(result.page - 1) * result.page_size + index + 1}</TableCell>
                      <TableCell>
                        <button type="button" className="group flex min-w-44 items-center gap-2 text-left" onClick={() => setSelectedWallet(row.full_wallet)}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><UserRound className="size-4" /></span>
                          <span className="min-w-0"><span className="block max-w-40 truncate text-sm font-medium text-blue-700 group-hover:underline group-hover:underline-offset-4 dark:text-blue-400">{row.display_name || row.wallet_short}</span><span className="block font-mono text-[11px] text-muted-foreground">{row.wallet_short}</span></span>
                        </button>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">{row.record}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(row.picks)}</TableCell>
                      <TableCell><RateCell value={row.confidence_score_pct} sample={row.picks} confidence /></TableCell>
                      <TableCell><RateCell value={row.raw_accuracy_pct} sample={row.picks} /></TableCell>
                      <TableCell className={cn("font-medium tabular-nums", Number(row.roi_pct) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{formatPercent(row.roi_pct)}</TableCell>
                      <TableCell>{row.current_pick ? <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">{row.current_pick}</span> : <span className="text-xs text-muted-foreground">No current position</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </>
          )}
          {!loading && !error && result && !result.rows?.length && <EmptyState title="No wallets match these filters" description="Try reducing the minimum sample or clearing the wallet search." />}
        </CardContent>
        {result?.rows?.length > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {formatNumber((result.page - 1) * result.page_size + 1)}–{formatNumber(Math.min(result.page * result.page_size, result.total))} of {formatNumber(result.total)}</span>
            <Pagination className="mx-0 w-auto justify-start sm:justify-end"><PaginationContent>
              <PaginationItem><Button variant="outline" className="h-8" disabled={result.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, Number(current.page) - 1) }))}>Previous</Button></PaginationItem>
              <PaginationItem><span className="px-2 tabular-nums">Page {result.page} of {result.pages}</span></PaginationItem>
              <PaginationItem><Button variant="outline" className="h-8" disabled={result.page >= result.pages} onClick={() => setFilters((current) => ({ ...current, page: Number(current.page) + 1 }))}>Next</Button></PaginationItem>
            </PaginationContent></Pagination>
          </div>
        )}
      </Card>

      <TraderSheet sport={sport} wallet={selectedWallet} open={Boolean(selectedWallet)} onOpenChange={(open) => { if (!open) setSelectedWallet("") }} />
    </div>
  )
}
