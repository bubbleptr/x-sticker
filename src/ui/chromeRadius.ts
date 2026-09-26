/**
 * Shared corner scale for the edit panel (page overlay and the inspector
 * chrome inside it, including draft controls). The toolbar no longer opens
 * a separate popup; both surfaces read these tokens so radii cannot drift.
 *
 * Shell and surface follow a soft sticker curve. Controls share one pill
 * token. Fields and checks stay a step tighter so text and checkbox meaning
 * stay clear.
 */
export const CHROME_RADIUS = {
  shell: '28px',
  surface: '24px',
  control: '999px',
  field: '18px',
  check: '8px',
} as const

export type ChromeRadiusToken = keyof typeof CHROME_RADIUS

export function chromeRadiusVars(): string {
  return Object.entries(CHROME_RADIUS)
    .map(([token, value]) => `--radius-${token}: ${value};`)
    .join(' ')
}

export function chromeRadius(token: ChromeRadiusToken): string {
  return `var(--radius-${token}, ${CHROME_RADIUS[token]})`
}

function withPseudo(selector: string, pseudo: string): string {
  return selector.split(',').map((part) => `${part.trim()}${pseudo}`).join(', ')
}

export function chromeCheckboxCss(selector: string): string {
  return `
${selector} {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  margin: 0;
  border: 1.5px solid #c3ccd4;
  border-radius: ${chromeRadius('check')};
  background: #fff;
  display: inline-grid;
  place-content: center;
  flex: none;
}
${withPseudo(selector, ':checked')} {
  background: var(--ink, #0f1419);
  border-color: var(--ink, #0f1419);
}
${withPseudo(selector, ':checked::after')} {
  content: "";
  width: 8px;
  height: 5px;
  border-left: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: translateY(-1px) rotate(-45deg);
}
`
}
