import { createContext, useContext, useEffect, useMemo, useState } from "react"

const ThemeContext = createContext(null)

function savedTheme(storageKey, fallback) {
  try {
    return window.localStorage.getItem(storageKey) || fallback
  } catch {
    return fallback
  }
}

function resolvedTheme(theme) {
  if (theme !== "system") return theme
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children, defaultTheme = "system", storageKey = "polymarket-analytics-theme" }) {
  const [theme, setThemeState] = useState(() => savedTheme(storageKey, defaultTheme))

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    function applyTheme() {
      const resolved = resolvedTheme(theme)
      root.classList.toggle("dark", resolved === "dark")
      root.style.colorScheme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        resolved === "dark" ? "#171717" : "#ffffff",
      )
    }

    applyTheme()
    if (theme !== "system") return undefined
    media.addEventListener("change", applyTheme)
    return () => media.removeEventListener("change", applyTheme)
  }, [theme])

  const value = useMemo(() => ({
    theme,
    setTheme(nextTheme) {
      setThemeState(nextTheme)
      try {
        window.localStorage.setItem(storageKey, nextTheme)
      } catch {
        // The selected theme still applies for this session when storage is unavailable.
      }
    },
  }), [storageKey, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within ThemeProvider")
  return context
}
