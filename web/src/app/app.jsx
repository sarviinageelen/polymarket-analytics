import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { LoadingState } from "@/components/shared/states"
import { GamesPage } from "@/pages/games-page"
import { OddsPage } from "@/pages/odds-page"
import { OverviewPage } from "@/pages/overview-page"
import { RefreshPage } from "@/pages/refresh-page"
import { RunsPage } from "@/pages/runs-page"
import { WalletsPage } from "@/pages/wallets-page"
import { request } from "@/lib/api"
import { FALLBACK_CONFIG, FALLBACK_SPORTS, normalizeView } from "@/lib/constants"

function readRoute() {
  const params = new URLSearchParams(window.location.search)
  const legacyView = params.get("view") || "overview"
  return {
    view: normalizeView(legacyView),
    sport: params.get("sport") || FALLBACK_CONFIG.sport,
    conditionId: params.get("condition_id") || "",
    walletDimension: legacyView === "game" ? "game" : "team",
  }
}

const INITIAL_ROUTE = readRoute()

export function App() {
  const [view, setView] = useState(INITIAL_ROUTE.view)
  const [sport, setSport] = useState(INITIAL_ROUTE.sport)
  const [conditionId, setConditionId] = useState(INITIAL_ROUTE.conditionId)
  const [walletDimension, setWalletDimension] = useState(INITIAL_ROUTE.walletDimension)
  const [data, setData] = useState(null)
  const [form, setForm] = useState(FALLBACK_CONFIG)
  const [formDirty, setFormDirty] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [statusRefreshing, setStatusRefreshing] = useState(false)
  const [controllerReachable, setControllerReachable] = useState(null)
  const [starting, setStarting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const formInitialized = useRef(false)
  const dirtyRef = useRef(false)
  const sportRef = useRef(sport)

  useEffect(() => { dirtyRef.current = formDirty }, [formDirty])
  useEffect(() => { sportRef.current = sport }, [sport])

  const loadStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatusRefreshing(true)
    try {
      const response = await request("/api/status")
      setData(response)
      setControllerReachable(true)
      setError("")

      if (!formInitialized.current || !dirtyRef.current) {
        setForm({ ...FALLBACK_CONFIG, ...(response.config || {}) })
        formInitialized.current = true
      }

      const availableSports = response.sports || []
      if (availableSports.length && !availableSports.some((item) => item.id === sportRef.current)) {
        const fallbackSport = response.config?.sport || availableSports[0].id
        setSport(fallbackSport)
        sportRef.current = fallbackSport
      }
      return response
    } catch (cause) {
      setControllerReachable(false)
      setError(cause.message || "Could not reach the analytics controller.")
      return null
    } finally {
      setInitialLoading(false)
      if (!silent) setStatusRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const delay = data?.runtime?.running ? 3000 : 15000
    const timer = window.setInterval(() => loadStatus({ silent: true }), delay)
    return () => window.clearInterval(timer)
  }, [data?.runtime?.running, loadStatus])

  useEffect(() => {
    function handlePopState() {
      const route = readRoute()
      setView(route.view)
      setSport(route.sport)
      setConditionId(route.conditionId)
      setWalletDimension(route.walletDimension)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  function writeRoute(nextView, nextSport, extras = {}, replace = false) {
    const params = new URLSearchParams()
    params.set("view", nextView)
    params.set("sport", nextSport)

    if (Object.prototype.hasOwnProperty.call(extras, "condition_id")) {
      if (extras.condition_id) params.set("condition_id", extras.condition_id)
      else params.delete("condition_id")
    }

    const nextUrl = `${window.location.pathname}?${params.toString()}`
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl)
  }

  function navigate(nextView, extras = {}) {
    const normalized = normalizeView(nextView)
    setView(normalized)
    if (extras.condition_id !== undefined) setConditionId(extras.condition_id || "")
    if (extras.dimension) setWalletDimension(extras.dimension)
    writeRoute(normalized, sport, extras)
    window.requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }))
  }

  function changeSport(nextSport) {
    setSport(nextSport)
    setConditionId("")
    writeRoute(view, nextSport, { condition_id: "" })
  }

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFormDirty(true)
  }

  async function runNow() {
    setStarting(true)
    setError("")
    setNotice("")
    try {
      const response = await request("/api/run", {
        method: "POST",
        body: JSON.stringify({ sport, full_validation: Boolean(form.full_validation) }),
      })
      setNotice(`Refresh started${response.run_id ? ` · run ${response.run_id}` : ""}.`)
      await loadStatus({ silent: true })
    } catch (cause) {
      setError(cause.message || "Could not start the refresh.")
    } finally {
      setStarting(false)
    }
  }

  async function saveSchedule() {
    const intervalValue = Number(form.interval_value)
    if (!Number.isFinite(intervalValue) || intervalValue < 1) {
      setError("The refresh interval must be at least 1.")
      return
    }

    setSaving(true)
    setError("")
    setNotice("")
    try {
      const payload = { ...form, interval_value: intervalValue }
      const response = await request("/api/config", { method: "POST", body: JSON.stringify(payload) })
      setForm({ ...FALLBACK_CONFIG, ...(response.config || payload) })
      setFormDirty(false)
      setNotice(payload.enabled ? "Refresh schedule saved." : "Automatic refreshes paused.")
      await loadStatus({ silent: true })
    } catch (cause) {
      setError(cause.message || "Could not save the refresh schedule.")
    } finally {
      setSaving(false)
    }
  }

  const sports = data?.sports?.length ? data.sports : FALLBACK_SPORTS
  const selected = useMemo(
    () => sports.find((item) => item.id === sport) || sports[0] || FALLBACK_SPORTS[0],
    [sport, sports],
  )
  const runtime = data?.runtime || { running: false, history: [], last_run: null }
  const controllerOnline = controllerReachable === true && Boolean(data?.controller?.online)

  function renderPage() {
    if (view === "refresh") {
      return <RefreshPage data={data} selected={selected} form={form} setField={setField} runtime={runtime} runNow={runNow} starting={starting} saveSchedule={saveSchedule} saving={saving} formDirty={formDirty} />
    }
    if (view === "wallets") return <WalletsPage key={`${sport}-${walletDimension}`} sport={sport} initialDimension={walletDimension} />
    if (view === "games") return <GamesPage key={`${sport}-${conditionId}`} sport={sport} initialConditionId={conditionId} />
    if (view === "odds") return <OddsPage key={sport} sport={sport} />
    if (view === "runs") return <RunsPage data={data} onRefresh={() => loadStatus()} />
    return <OverviewPage key={sport} data={data} selected={selected} onNavigate={navigate} />
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "13rem", "--sidebar-width-icon": "3rem" }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <AppSidebar
        view={view}
        onNavigate={navigate}
        repository={data?.project?.repository}
        controllerStatus={controllerReachable === null ? "connecting" : controllerOnline ? "online" : "offline"}
        controllerLabel={controllerReachable === null ? "Connecting" : controllerOnline ? "Controller online" : "Controller offline"}
      />
      <SidebarInset className="min-w-0 overflow-hidden">
        <AppHeader
          view={view}
          sport={sport}
          sports={sports}
          onSportChange={changeSport}
          snapshot={selected}
          onRefreshStatus={() => loadStatus()}
          statusRefreshing={statusRefreshing}
        />
        <div id="main-content" tabIndex="-1" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 outline-none sm:px-5 md:py-6 lg:px-7 lg:py-7">
          <div className="mb-4 space-y-2" aria-live="polite">
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Something needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                <Button variant="ghost" size="icon-sm" className="absolute top-1.5 right-1.5" onClick={() => setError("")} aria-label="Dismiss error"><X /></Button>
              </Alert>
            )}
            {notice && (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                <CheckCircle2 />
                <AlertTitle>Done</AlertTitle>
                <AlertDescription>{notice}</AlertDescription>
                <Button variant="ghost" size="icon-sm" className="absolute top-1.5 right-1.5" onClick={() => setNotice("")} aria-label="Dismiss message"><X /></Button>
              </Alert>
            )}
          </div>
          {initialLoading && !data ? <LoadingState label="Loading analytics…" /> : renderPage()}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
