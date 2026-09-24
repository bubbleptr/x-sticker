export const KATIE_SHARE_ITEM_ATTR = 'data-katie-share-item'
export const KATIE_MENU_ICON_ATTR = 'data-katie-icon'

const KATIE_LABEL = '做成卡贴'
/** X share rows use a 1.25em icon on 15px text (18.75px). */
const MENU_ICON_PX = '18.75'
const SVG_NS = 'http://www.w3.org/2000/svg'

const SHARE_LABELS = new Set([
  '分享帖子',
  '分享推文',
  'share post',
  'share tweet',
  'share',
])

export type ShareTarget = {
  menu: HTMLElement
  button: HTMLElement
  article: HTMLElement
}

function controlLabel(el: Element): string {
  return (el.getAttribute('aria-label') ?? '').trim().toLowerCase()
}

export function isShareButton(el: Element): el is HTMLElement {
  if (el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') return false
  return SHARE_LABELS.has(controlLabel(el))
}

function isShareMenu(menu: Element): boolean {
  const text = (menu.textContent ?? '').toLowerCase()
  return text.includes('复制链接') || text.includes('copy link')
}

export function articleFromShareButton(control: Element): HTMLElement | null {
  const article = control.closest('article[data-testid="tweet"]')
  return article instanceof HTMLElement ? article : null
}

export function findOpenShareTarget(doc: Document): ShareTarget | null {
  const buttons = Array.from(
    doc.querySelectorAll('button[aria-expanded="true"], [role="button"][aria-expanded="true"]'),
  ).filter(isShareButton)
  if (buttons.length === 0) return null

  const menus = Array.from(doc.querySelectorAll('[role="menu"]')).filter(
    (menu): menu is HTMLElement => menu instanceof HTMLElement && isShareMenu(menu),
  )
  const menu = menus[menus.length - 1]
  if (!menu) return null

  for (let i = buttons.length - 1; i >= 0; i -= 1) {
    const button = buttons[i]!
    const article = articleFromShareButton(button)
    if (article) return { menu, button, article }
  }
  return null
}

function iconHasSize(svg: SVGElement): boolean {
  if (svg.getAttribute('width') || svg.getAttribute('height') || svg.getAttribute('class')) return true
  const style = svg.getAttribute('style') ?? ''
  return style.includes('width') || style.includes('height')
}

/** Line icon: a photo card. Stroke uses currentColor so light and dark X menus both read. */
function paintMenuIcon(svg: SVGElement): void {
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute(KATIE_MENU_ICON_ATTR, '')
  if (!iconHasSize(svg)) {
    svg.setAttribute('width', MENU_ICON_PX)
    svg.setAttribute('height', MENU_ICON_PX)
  }
  svg.style.fill = 'none'
  svg.style.stroke = 'currentColor'
  svg.style.strokeWidth = '1.8'
  svg.style.strokeLinecap = 'round'
  svg.style.strokeLinejoin = 'round'
  while (svg.firstChild) svg.removeChild(svg.firstChild)

  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', '4')
  rect.setAttribute('y', '4')
  rect.setAttribute('width', '16')
  rect.setAttribute('height', '16')
  rect.setAttribute('rx', '2')

  const sun = document.createElementNS(SVG_NS, 'circle')
  sun.setAttribute('cx', '9')
  sun.setAttribute('cy', '9')
  sun.setAttribute('r', '1.15')
  sun.style.fill = 'currentColor'
  sun.style.stroke = 'none'

  const ridge = document.createElementNS(SVG_NS, 'path')
  ridge.setAttribute('d', 'M5 16.2 8.8 12.4a1.1 1.1 0 0 1 1.55 0l1.5 1.5 1.7-1.75a1.1 1.1 0 0 1 1.55 0L19 16.4')

  svg.append(rect, sun, ridge)
}

function ensureMenuIcon(item: HTMLElement): void {
  const svgs = Array.from(item.querySelectorAll('svg'))
  if (svgs.length === 0) {
    const svg = document.createElementNS(SVG_NS, 'svg')
    const label = labelSpan(item)
    if (label?.parentElement) label.parentElement.insertBefore(svg, label)
    else item.prepend(svg)
    if (!item.style.display) item.style.display = 'flex'
    if (!item.style.alignItems) item.style.alignItems = 'center'
    if (!item.style.gap) item.style.gap = '12px'
    paintMenuIcon(svg)
    return
  }
  paintMenuIcon(svgs[0]!)
  for (const extra of svgs.slice(1)) extra.remove()
}

function plainMenuItem(): HTMLElement {
  const item = document.createElement('div')
  item.setAttribute('role', 'menuitem')
  item.tabIndex = 0
  item.style.cssText =
    'display:flex;align-items:center;gap:12px;padding:16px;cursor:pointer;font:700 15px/20px system-ui,sans-serif;text-align:left;color:inherit;'
  const span = document.createElement('span')
  span.textContent = KATIE_LABEL
  item.append(span)
  return item
}

function labelSpan(item: HTMLElement): HTMLElement | null {
  const spans = Array.from(item.querySelectorAll('span'))
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    if ((spans[i]!.textContent ?? '').trim()) return spans[i]!
  }
  return null
}

export function buildKatieMenuItem(menu: ParentNode): HTMLElement {
  const template = Array.from(menu.querySelectorAll('[role="menuitem"]')).find(
    (el) => el instanceof HTMLElement && !el.hasAttribute(KATIE_SHARE_ITEM_ATTR),
  )
  const item = template instanceof HTMLElement ? (template.cloneNode(true) as HTMLElement) : plainMenuItem()
  item.removeAttribute('id')
  item.removeAttribute('data-testid')
  for (const img of Array.from(item.querySelectorAll('img'))) img.remove()
  const span = labelSpan(item)
  if (span) span.textContent = KATIE_LABEL
  else if (!item.querySelector('span')) {
    const label = document.createElement('span')
    label.textContent = KATIE_LABEL
    item.append(label)
  }
  ensureMenuIcon(item)
  item.setAttribute('role', 'menuitem')
  item.setAttribute(KATIE_SHARE_ITEM_ATTR, '')
  item.setAttribute('aria-label', KATIE_LABEL)
  return item
}

function upsertKatieMenuItem(menu: HTMLElement): HTMLElement {
  const existing = menu.querySelector(`[${KATIE_SHARE_ITEM_ATTR}]`)
  if (existing instanceof HTMLElement) return existing
  const item = buildKatieMenuItem(menu)
  menu.appendChild(item)
  return item
}

const boundItems = new WeakSet<HTMLElement>()
const buttonByItem = new WeakMap<HTMLElement, HTMLElement>()
const pickByItem = new WeakMap<HTMLElement, (article: HTMLElement) => void>()

function bindMenuItem(item: HTMLElement): void {
  if (boundItems.has(item)) return
  boundItems.add(item)
  let actedAt = 0
  const activate = (event: Event) => {
    if (event.type === 'keydown') {
      const key = (event as KeyboardEvent).key
      if (key !== 'Enter' && key !== ' ') return
    }
    event.preventDefault()
    event.stopPropagation()
    const now = Date.now()
    if (now - actedAt < 700) return
    actedAt = now
    const button = buttonByItem.get(item)
    const onPick = pickByItem.get(item)
    const article = button ? articleFromShareButton(button) : null
    if (article && onPick) onPick(article)
    queueMicrotask(() => {
      if (button?.isConnected && button.getAttribute('aria-expanded') === 'true') {
        button.click()
      }
    })
  }
  item.addEventListener('pointerdown', activate)
  item.addEventListener('click', activate)
  item.addEventListener('keydown', activate)
}

export function syncShareMenu(doc: Document, onPick: (article: HTMLElement) => void): void {
  const target = findOpenShareTarget(doc)
  for (const node of Array.from(doc.querySelectorAll(`[${KATIE_SHARE_ITEM_ATTR}]`))) {
    const menu = node.closest('[role="menu"]')
    if (!target || menu !== target.menu) node.remove()
  }
  if (!target) return
  const item = upsertKatieMenuItem(target.menu)
  buttonByItem.set(item, target.button)
  pickByItem.set(item, onPick)
  bindMenuItem(item)
}

export function startShareMenuInjector(
  doc: Document,
  onPick: (article: HTMLElement) => void,
): () => void {
  let frame = 0
  const run = () => {
    frame = 0
    syncShareMenu(doc, onPick)
  }
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(run)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded'],
  })
  schedule()
  return () => {
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
  }
}
