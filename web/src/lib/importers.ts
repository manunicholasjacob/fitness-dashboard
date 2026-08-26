/**
 * CSV importers for Garmin and MyFitnessPal exports.
 *
 * Both services change their export column names periodically, so these match
 * headers by fuzzy alias rather than exact position, and report what they
 * skipped instead of silently dropping rows.
 */

import type { BulkDailyRow } from './api'

export interface ImportResult {
  rows: BulkDailyRow[]
  warnings: string[]
}

/** Minimal RFC-4180 parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const stripped = text.replace(/^﻿/, '') // drop a UTF-8 BOM from Excel exports

  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i]

    if (inQuotes) {
      if (c === '"') {
        if (stripped[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && stripped[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }

  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Find the first column whose normalised header matches any alias. */
function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader)
  for (const alias of aliases) {
    const target = normalizeHeader(alias)
    const exact = normalized.indexOf(target)
    if (exact !== -1) return exact
  }
  for (const alias of aliases) {
    const target = normalizeHeader(alias)
    const partial = normalized.findIndex((h) => h.includes(target))
    if (partial !== -1) return partial
  }
  return -1
}

/** Parse a number, tolerating thousands separators, units and stray symbols. */
function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Normalise a date cell to yyyy-mm-dd, or null if it is not a date. */
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  // Accept US-style m/d/yyyy, which is what both exports use by default.
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (usMatch) {
    const [, m, d, y] = usMatch
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  }
  return null
}

// --- Garmin ------------------------------------------------------------------

export function parseGarminCsv(text: string): ImportResult {
  const table = parseCsv(text)
  const warnings: string[] = []
  if (table.length < 2) return { rows: [], warnings: ['File has no data rows.'] }

  const headers = table[0]
  const col = {
    date: findColumn(headers, ['date', 'day', 'activity date', 'timestamp']),
    steps: findColumn(headers, ['steps', 'total steps', 'actual steps']),
    calories: findColumn(headers, ['total calories', 'calories', 'calories burned']),
    active: findColumn(headers, ['active calories', 'activity calories']),
    resting: findColumn(headers, ['resting calories', 'bmr calories']),
    distance: findColumn(headers, ['distance', 'total distance']),
    restingHr: findColumn(headers, ['resting heart rate', 'resting hr']),
    avgHr: findColumn(headers, ['average heart rate', 'avg hr']),
    activeMinutes: findColumn(headers, ['active minutes', 'intensity minutes']),
    sleep: findColumn(headers, ['sleep', 'sleep duration', 'total sleep']),
  }

  if (col.date === -1) {
    return { rows: [], warnings: [`No date column found. Headers seen: ${headers.join(', ')}`] }
  }

  const byDate = new Map<string, BulkDailyRow>()

  for (let i = 1; i < table.length; i++) {
    const cells = table[i]
    const date = parseDate(cells[col.date])
    if (!date) {
      warnings.push(`Row ${i + 1}: unrecognised date "${cells[col.date] ?? ''}"`)
      continue
    }

    const distanceRaw = col.distance === -1 ? null : parseNumber(cells[col.distance])
    // Garmin exports distance in km; the database stores metres.
    const distanceMeters = distanceRaw === null ? null : distanceRaw * 1000

    const row: BulkDailyRow = {
      date,
      raw_garmin_total_calories: col.calories === -1 ? null : parseNumber(cells[col.calories]),
      raw_garmin_active_calories: col.active === -1 ? null : parseNumber(cells[col.active]),
      raw_garmin_resting_calories: col.resting === -1 ? null : parseNumber(cells[col.resting]),
      steps_total: col.steps === -1 ? null : parseNumber(cells[col.steps]),
      distance_meters: distanceMeters,
      resting_hr: col.restingHr === -1 ? null : parseNumber(cells[col.restingHr]),
      average_hr: col.avgHr === -1 ? null : parseNumber(cells[col.avgHr]),
      active_minutes: col.activeMinutes === -1 ? null : parseNumber(cells[col.activeMinutes]),
      sleep_seconds: col.sleep === -1 ? null : (parseNumber(cells[col.sleep]) ?? 0) * 3600 || null,
      energy_source: 'import',
    }

    // Drop keys with no value so an import never blanks an existing column.
    const cleaned = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)) as BulkDailyRow
    byDate.set(date, { ...(byDate.get(date) ?? {}), ...cleaned, date })
  }

  return { rows: [...byDate.values()], warnings }
}

// --- MyFitnessPal ------------------------------------------------------------

export function parseMfpCsv(text: string): ImportResult {
  const table = parseCsv(text)
  const warnings: string[] = []
  if (table.length < 2) return { rows: [], warnings: ['File has no data rows.'] }

  const headers = table[0]
  const col = {
    date: findColumn(headers, ['date', 'day']),
    calories: findColumn(headers, ['calories', 'energy', 'kcal']),
    protein: findColumn(headers, ['protein (g)', 'protein']),
    carbs: findColumn(headers, ['carbohydrates (g)', 'carbs (g)', 'carbohydrates', 'carbs']),
    fat: findColumn(headers, ['fat (g)', 'fat']),
    fiber: findColumn(headers, ['fiber (g)', 'fibre (g)', 'fiber', 'fibre']),
    sugar: findColumn(headers, ['sugar (g)', 'sugars (g)', 'sugar']),
    sodium: findColumn(headers, ['sodium (mg)', 'sodium']),
  }

  if (col.date === -1 || col.calories === -1) {
    return {
      rows: [],
      warnings: [`Need date and calories columns. Headers seen: ${headers.join(', ')}`],
    }
  }

  // MFP exports one row per meal, so days must be summed rather than replaced.
  const totals = new Map<string, Record<string, number>>()

  for (let i = 1; i < table.length; i++) {
    const cells = table[i]
    const date = parseDate(cells[col.date])
    if (!date) {
      warnings.push(`Row ${i + 1}: unrecognised date "${cells[col.date] ?? ''}"`)
      continue
    }
    const bucket = totals.get(date) ?? {}
    const add = (key: string, index: number) => {
      if (index === -1) return
      const v = parseNumber(cells[index])
      if (v !== null) bucket[key] = (bucket[key] ?? 0) + v
    }
    add('raw_mfp_calories', col.calories)
    add('protein', col.protein)
    add('carbs', col.carbs)
    add('fat', col.fat)
    add('fiber', col.fiber)
    add('sugar', col.sugar)
    add('sodium', col.sodium)
    totals.set(date, bucket)
  }

  const rows: BulkDailyRow[] = [...totals.entries()].map(([date, values]) => ({
    date,
    ...values,
    nutrition_source: 'import',
  }))

  return { rows, warnings }
}
