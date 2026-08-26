/**
 * Trend maths.
 *
 * Body weight is a noisy signal: water, sodium, glycogen and gut contents swing
 * it by a kilo or more day to day. Every weight number the UI reacts to goes
 * through a rolling average or a fitted slope first, never a raw reading.
 */

export interface Point {
  date: string
  value: number
}

/**
 * Trailing rolling mean. Emits a value only once `window` points exist, so the
 * early days of a series are not smoothed against a near-empty sample.
 */
export function rollingAverage(points: Point[], window: number): (Point & { average: number | null })[] {
  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((p, i) => {
    if (i + 1 < window) return { ...p, average: null }
    const slice = sorted.slice(i + 1 - window, i + 1)
    return { ...p, average: slice.reduce((s, x) => s + x.value, 0) / slice.length }
  })
}

export interface LinearFit {
  /** Units per day. */
  slope: number
  intercept: number
  /** Coefficient of determination; low values mean the trend is not meaningful. */
  r2: number
  n: number
}

/** Ordinary least squares against days-since-first-point. */
export function linearFit(points: Point[]): LinearFit | null {
  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date))
  const n = sorted.length
  if (n < 2) return null

  const t0 = Date.parse(sorted[0].date)
  const xs = sorted.map((p) => (Date.parse(p.date) - t0) / 86_400_000)
  const ys = sorted.map((p) => p.value)

  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n

  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
  }
  if (sxx === 0) return null

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX

  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (slope * xs[i] + intercept)) ** 2
    ssTot += (ys[i] - meanY) ** 2
  }

  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n }
}

/**
 * Change between the mean of the first and last `window` points.
 *
 * Preferred over "latest minus earliest" because it is far less sensitive to a
 * single bad reading at either end of the range.
 */
export function trendChange(points: Point[], window = 7): number | null {
  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 2) return null
  const w = Math.min(window, Math.floor(sorted.length / 2)) || 1
  const head = sorted.slice(0, w)
  const tail = sorted.slice(-w)
  const mean = (arr: Point[]) => arr.reduce((s, p) => s + p.value, 0) / arr.length
  return mean(tail) - mean(head)
}

/** Most recent smoothed value, falling back to the last raw point. */
export function latestSmoothed(points: Point[], window = 7): number | null {
  if (points.length === 0) return null
  const rolled = rollingAverage(points, Math.min(window, points.length))
  const last = rolled[rolled.length - 1]
  return last.average ?? last.value
}
