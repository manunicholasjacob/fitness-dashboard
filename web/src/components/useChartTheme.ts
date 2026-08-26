import { useEffect, useState } from 'react'

/**
 * Reads chart colours out of the CSS custom properties at runtime.
 *
 * Recharts needs literal colour strings, so it cannot consume `var(--x)`
 * directly. Rather than duplicate the palette in JavaScript and let the two
 * drift apart, this resolves the same tokens the stylesheet defines and
 * re-resolves them when the system appearance changes.
 */

const TOKENS = {
  positive: '--color-chart-positive',
  negative: '--color-chart-negative',
  intake: '--color-chart-intake',
  secondary: '--color-chart-secondary',
  tertiary: '--color-chart-tertiary',
  raw: '--color-chart-raw',
  grid: '--color-chart-grid',
  axis: '--color-chart-axis',
  tooltipBg: '--color-chart-tooltip-bg',
  edge: '--color-edge',
  text: '--color-text',
  muted: '--color-muted',
  warn: '--color-warn',
} as const

export type ChartTheme = Record<keyof typeof TOKENS, string>

// Dark-mode values, used for the first paint and for non-browser environments.
const FALLBACK: ChartTheme = {
  positive: '#38e07b',
  negative: '#f2545b',
  intake: '#f5a524',
  secondary: '#8fb0ee',
  tertiary: '#b39ddb',
  raw: '#4d5c7d',
  grid: '#1e2740',
  axis: '#79839b',
  tooltipBg: '#121828',
  edge: '#1e2740',
  text: '#e8eefc',
  muted: '#95a4c0',
  warn: '#f5a524',
}

function resolve(): ChartTheme {
  if (typeof window === 'undefined') return FALLBACK
  const styles = getComputedStyle(document.documentElement)
  const out = {} as ChartTheme
  for (const [key, token] of Object.entries(TOKENS) as [keyof ChartTheme, string][]) {
    out[key] = styles.getPropertyValue(token).trim() || FALLBACK[key]
  }
  return out
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK)

  useEffect(() => {
    setTheme(resolve())

    // Follow the system appearance without an in-app toggle.
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setTheme(resolve())
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return theme
}
