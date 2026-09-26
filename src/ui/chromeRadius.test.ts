import { expect, it } from 'vitest'
import { CHROME_RADIUS, chromeCheckboxCss, chromeRadius, chromeRadiusVars } from './chromeRadius'

it('publishes one radius scale for overlay and inspector chrome', () => {
  expect(CHROME_RADIUS).toEqual({
    shell: '28px',
    surface: '24px',
    control: '999px',
    field: '18px',
    check: '8px',
  })
  const vars = chromeRadiusVars()
  for (const [token, value] of Object.entries(CHROME_RADIUS)) {
    expect(vars).toContain(`--radius-${token}: ${value};`)
    expect(chromeRadius(token as keyof typeof CHROME_RADIUS)).toBe(`var(--radius-${token}, ${value})`)
  }
})

it('applies checkbox checked styles to every selector in a group', () => {
  const css = chromeCheckboxCss('.row input[type="checkbox"], .gallery-choice input[type="checkbox"]')
  expect(css).toContain('.row input[type="checkbox"]:checked')
  expect(css).toContain('.gallery-choice input[type="checkbox"]:checked')
  expect(css).toContain('.row input[type="checkbox"]:checked::after')
  expect(css).not.toMatch(/\.row input\[type="checkbox"\], \.gallery-choice input\[type="checkbox"\]:checked/)
})
