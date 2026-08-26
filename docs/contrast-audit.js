/**
 * Contrast audit. Paste into the console on any page of the running app.
 *
 * Measures what the browser actually painted rather than what the palette
 * claims. Colours are resolved through a canvas because getComputedStyle does
 * not normalise oklab(), which Tailwind v4 emits for opacity modifiers, and
 * parsing that string as RGB reports false failures.
 *
 * Thresholds follow type size: 7:1 for small text, 4.5:1 for large. Expect zero
 * failures. If you have just switched the emulated colour scheme, reload first,
 * or you may measure a half-applied state.
 */
(async () => {
  const audit = () => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const ctx = cv.getContext('2d')
    const hex = (c) => {
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      return ctx.fillStyle
    }
    const rgb = (c) => {
      const h = hex(c)
      return h.startsWith('#') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null
    }
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (fg, bg) => {
      const a = rgb(fg)
      const b = rgb(bg)
      if (!a || !b) return null
      const x = lum(a)
      const y = lum(b)
      return +(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2))
    }

    // A translucent layer sits over whatever is beneath it, so fall through to
    // the nearest opaque ancestor rather than guessing at the blend.
    const opaque = (c) => {
      const p = c.match(/[\d.]+/g)
      return c && !/transparent/.test(c) && !(p && p.length === 4 && Number(p[3]) < 1)
    }
    const bgOf = (el) => {
      let n = el
      while (n) {
        const c = getComputedStyle(n).backgroundColor
        if (opaque(c)) return c
        n = n.parentElement
      }
      return getComputedStyle(document.body).backgroundColor
    }

    const out = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length) continue
      const text = (el.textContent || '').trim()
      if (!text || text.length > 60) continue
      if (!el.getClientRects().length) continue

      const cs = getComputedStyle(el)
      const px = parseFloat(cs.fontSize)
      const large = px >= 24 || (parseInt(cs.fontWeight) >= 700 && px >= 18.66)
      const r = ratio(cs.color, bgOf(el))
      if (r === null) continue

      out.push({
        text: text.slice(0, 24),
        px: Math.round(px),
        large,
        ratio: r,
        pass: r >= (large ? 4.5 : 7),
      })
    }

    const fails = out.filter((o) => !o.pass).sort((a, b) => a.ratio - b.ratio)
    return { page: location.hash || '#/', checked: out.length, failures: fails.length, fails }
  }

  const pages = [
    '#/',
    '#/mission',
    '#/activity',
    '#/check-in',
    '#/analytics',
    '#/integrations',
    '#/settings',
  ]

  const results = []
  for (const p of pages) {
    location.hash = p
    await new Promise((r) => setTimeout(r, 1500))
    results.push(audit())
  }
  location.hash = '#/'

  const total = results.reduce((a, r) => a + r.checked, 0)
  const bad = results.reduce((a, r) => a + r.failures, 0)
  const mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

  console.log(`${mode}: ${bad} failures across ${total} text nodes`)
  console.table(results.map((r) => ({ page: r.page, checked: r.checked, failures: r.failures })))
  if (bad) console.table(results.flatMap((r) => r.fails))

  return { mode, total, failures: bad }
})()
