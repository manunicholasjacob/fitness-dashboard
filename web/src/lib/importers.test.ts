import { describe, expect, it } from 'vitest'
import { parseCsv, parseGarminCsv, parseMfpCsv } from './importers'

describe('csv parser', () => {
  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('a,b\n"one, two",3')
    expect(rows).toEqual([
      ['a', 'b'],
      ['one, two', '3'],
    ])
  })

  it('handles escaped quotes and CRLF line endings', () => {
    const rows = parseCsv('name,note\r\n"He said ""hi""",ok\r\n')
    expect(rows[1]).toEqual(['He said "hi"', 'ok'])
  })

  it('strips a UTF-8 BOM from Excel exports', () => {
    const rows = parseCsv('﻿Date,Calories\n2026-01-01,2000')
    expect(rows[0][0]).toBe('Date')
  })

  it('drops fully blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('garmin import', () => {
  it('maps headers by name, not position', () => {
    const csv = [
      'Steps,Date,Total Calories,Distance',
      '"9,412",2026-08-01,"2,845",6.2',
    ].join('\n')
    const { rows, warnings } = parseGarminCsv(csv)
    expect(warnings).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-08-01')
    expect(rows[0].steps_total).toBe(9412)
    expect(rows[0].raw_garmin_total_calories).toBe(2845)
    // Garmin exports kilometres; the database stores metres.
    expect(rows[0].distance_meters).toBe(6200)
  })

  it('accepts US-style dates and two-digit years', () => {
    const { rows } = parseGarminCsv('Date,Calories\n8/1/2026,2500\n8/2/26,2600')
    expect(rows.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-02'])
  })

  it('omits absent columns rather than writing nulls over existing data', () => {
    const { rows } = parseGarminCsv('Date,Steps\n2026-08-01,9000')
    expect(rows[0]).not.toHaveProperty('raw_garmin_total_calories')
    expect(rows[0].steps_total).toBe(9000)
  })

  it('reports unparseable dates instead of dropping them silently', () => {
    const { rows, warnings } = parseGarminCsv('Date,Steps\nnot-a-date,9000\n2026-08-01,8000')
    expect(rows).toHaveLength(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('not-a-date')
  })

  it('fails loudly when there is no date column', () => {
    const { rows, warnings } = parseGarminCsv('Steps,Calories\n9000,2500')
    expect(rows).toEqual([])
    expect(warnings[0]).toContain('No date column')
  })
})

describe('myfitnesspal import', () => {
  it('sums the per-meal rows MFP exports into one row per day', () => {
    const csv = [
      'Date,Meal,Calories,Protein (g),Carbohydrates (g),Fat (g)',
      '2026-08-01,Breakfast,420,30,50,12',
      '2026-08-01,Lunch,680,45,70,22',
      '2026-08-01,Dinner,900,60,80,30',
      '2026-08-02,Breakfast,400,28,48,11',
    ].join('\n')
    const { rows } = parseMfpCsv(csv)
    expect(rows).toHaveLength(2)

    const day1 = rows.find((r) => r.date === '2026-08-01')!
    expect(day1.raw_mfp_calories).toBe(2000)
    expect(day1.protein).toBe(135)
    expect(day1.carbs).toBe(200)
    expect(day1.fat).toBe(64)
    expect(day1.nutrition_source).toBe('import')
  })

  it('tolerates thousands separators', () => {
    const { rows } = parseMfpCsv('Date,Calories\n2026-08-01,"2,145"')
    expect(rows[0].raw_mfp_calories).toBe(2145)
  })

  it('matches alternative macro header spellings', () => {
    const { rows } = parseMfpCsv('Date,Energy,Carbs,Fibre (g)\n2026-08-01,1900,180,32')
    expect(rows[0].raw_mfp_calories).toBe(1900)
    expect(rows[0].carbs).toBe(180)
    expect(rows[0].fiber).toBe(32)
  })

  it('requires both a date and a calories column', () => {
    const { rows, warnings } = parseMfpCsv('Date,Protein\n2026-08-01,120')
    expect(rows).toEqual([])
    expect(warnings[0]).toContain('date and calories')
  })
})
