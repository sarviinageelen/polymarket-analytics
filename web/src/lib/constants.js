import {
  Activity,
  ChartNoAxesCombined,
  DatabaseZap,
  LayoutDashboard,
  RefreshCw,
  Trophy,
} from "lucide-react"

export const DEFAULT_SPORT = "wnba_2026"

export const FALLBACK_SCHEDULE = {
  interval_value: 6,
  interval_unit: "hours",
  enabled: false,
  auto_push: true,
  full_validation: false,
}

export const FALLBACK_CONFIG = {
  push_branch: "main",
  schedules: {
    wnba_2026: { ...FALLBACK_SCHEDULE },
    wnba_2025: { ...FALLBACK_SCHEDULE },
    nfl_2025: { ...FALLBACK_SCHEDULE },
    nba_2025: { ...FALLBACK_SCHEDULE },
    mlb_2025: { ...FALLBACK_SCHEDULE },
    mlb_2026: { ...FALLBACK_SCHEDULE },
    nhl_2025: { ...FALLBACK_SCHEDULE },
    ncaaf_2025: { ...FALLBACK_SCHEDULE },
    ncaab_2025: { ...FALLBACK_SCHEDULE },
  },
}

export const FALLBACK_SPORTS = [
  { id: "wnba_2026", label: "WNBA 2026" },
  { id: "wnba_2025", label: "WNBA 2025" },
  { id: "nfl_2025", label: "NFL 2025" },
  { id: "nba_2025", label: "NBA 2025" },
  { id: "mlb_2025", label: "MLB 2025" },
  { id: "mlb_2026", label: "MLB 2026" },
  { id: "nhl_2025", label: "NHL 2025" },
  { id: "ncaaf_2025", label: "NCAAF 2025" },
  { id: "ncaab_2025", label: "NCAAB 2025" },
]

export const NAVIGATION = [
  {
    label: "Operations",
    items: [
      { id: "refresh", label: "Refresh data", icon: RefreshCw },
      { id: "runs", label: "Run history", icon: DatabaseZap },
    ],
  },
  {
    label: "Analyze",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "wallets", label: "Wallets", icon: Trophy },
      { id: "games", label: "Games", icon: Activity },
      { id: "odds", label: "Odds & results", icon: ChartNoAxesCombined },
    ],
  },
]

export const VALID_VIEWS = new Set(NAVIGATION.flatMap((group) => group.items.map((item) => item.id)))

export const PIPELINE_STEPS = [
  ["Refresh event metadata", "Market and event metadata"],
  ["Fetch and persist trades", "Local Parquet trade snapshot"],
  ["Rebuild local DuckDB", "Analytical database"],
  ["Recalculate bettor analysis", "Wallet and game ledgers"],
  ["Export Excel workbook", "Downloadable analysis"],
  ["Validate the refreshed snapshot", "Integrity and comparison checks"],
  ["Commit and push updated artifacts", "GitHub publication"],
]

export function normalizeView(value) {
  const aliases = {
    updates: "refresh",
    team: "wallets",
    game: "wallets",
    trader: "wallets",
    "game-trends": "games",
  }
  const normalized = aliases[value] || value
  return VALID_VIEWS.has(normalized) ? normalized : "overview"
}

export function viewLabel(view) {
  return NAVIGATION.flatMap((group) => group.items).find((item) => item.id === view)?.label || "Overview"
}
