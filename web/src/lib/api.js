const API_BASE = (window.__POLYMARKET_API__ || "").replace(/\/$/, "")

export function apiUrl(path) {
  return `${API_BASE}${path}`
}

export async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body
}

export function buildQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined && value !== false) {
      query.set(key, String(value))
    }
  })
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export function buildRawUrl(repository, branch, path) {
  if (!repository || !branch || !path) return null
  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/")
  return `https://raw.githubusercontent.com/${repository}/${encodedBranch}/${path}`
}

export function formatNumber(value, options = {}) {
  if (value === null || value === undefined || value === "") return "—"
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, ...options }).format(Number(value))
}

export function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—"
  return `${Number(value).toFixed(digits)}%`
}

export function formatDelta(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—"
  const number = Number(value)
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)} pp`
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export function formatDate(value, options = {}) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
  })
}

export function formatShortDate(value) {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—"
  const value = Number(seconds)
  if (value < 60) return `${Math.round(value)} sec`
  const minutes = Math.floor(value / 60)
  const remainder = Math.round(value % 60)
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
}

export function shortWallet(wallet) {
  if (!wallet) return "—"
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
}
