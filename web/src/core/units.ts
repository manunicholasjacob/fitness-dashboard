/** Unit conversion. Everything is stored metric; display converts at the edge. */

export const LB_PER_KG = 2.2046226218
export const KM_PER_MILE = 1.609344
export const CM_PER_INCH = 2.54

export const kgToLb = (kg: number) => kg * LB_PER_KG
export const lbToKg = (lb: number) => lb / LB_PER_KG
export const cmToIn = (cm: number) => cm / CM_PER_INCH
export const inToCm = (inches: number) => inches * CM_PER_INCH
export const metersToMiles = (m: number) => m / 1000 / KM_PER_MILE
export const metersToKm = (m: number) => m / 1000

export type UnitSystem = 'imperial' | 'metric'

export function formatWeight(kg: number | null, units: UnitSystem, digits = 1): string {
  if (kg === null || !Number.isFinite(kg)) return '--'
  return units === 'imperial'
    ? `${kgToLb(kg).toFixed(digits)} lb`
    : `${kg.toFixed(digits)} kg`
}

export function formatLength(cm: number | null, units: UnitSystem, digits = 1): string {
  if (cm === null || !Number.isFinite(cm)) return '--'
  return units === 'imperial'
    ? `${cmToIn(cm).toFixed(digits)} in`
    : `${cm.toFixed(digits)} cm`
}

export function formatDistance(meters: number | null, units: UnitSystem, digits = 2): string {
  if (meters === null || !Number.isFinite(meters)) return '--'
  return units === 'imperial'
    ? `${metersToMiles(meters).toFixed(digits)} mi`
    : `${metersToKm(meters).toFixed(digits)} km`
}

/** Pace as mm:ss per mile or per km. Returns '--' for zero/absent speed. */
export function formatPace(speedMps: number | null, units: UnitSystem): string {
  if (!speedMps || speedMps <= 0) return '--'
  const secondsPerUnit = units === 'imperial'
    ? 1 / speedMps * 1000 * KM_PER_MILE
    : 1 / speedMps * 1000
  const mins = Math.floor(secondsPerUnit / 60)
  const secs = Math.round(secondsPerUnit % 60)
  const [m, s] = secs === 60 ? [mins + 1, 0] : [mins, secs]
  return `${m}:${String(s).padStart(2, '0')}/${units === 'imperial' ? 'mi' : 'km'}`
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Thousands-separated integer, for calories and steps. */
export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '--'
  return Math.round(n).toLocaleString('en-US')
}

/** Signed integer, used wherever a deficit could be a surplus. */
export function formatSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '--'
  const rounded = Math.round(n)
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`
}
