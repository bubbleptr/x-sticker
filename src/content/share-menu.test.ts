/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  articleFromShareButton,
  buildKatieMenuItem,
  findOpenShareTarget,
  KATIE_MENU_ICON_ATTR,
  KATIE_SHARE_ITEM_ATTR,
  syncShareMenu,
} from './share-menu'

function mount(html: string): Document {
  document.body.innerHTML = html
  return document
}

const timeline = `
<article data-testid="tweet" id="first">
  <button aria-label="分享帖子" aria-expanded="false"></button>
  <div data-testid="tweetText"><span>第一条</span></div>
  <a href="/someone/status/111"><time datetime="2026-09-23T12:00:00.000Z">t</time></a>
</article>
<article data-testid="tweet" id="second">
  <button id="share-btn" aria-label="分享帖子" aria-expanded="true"></button>
  <div data-testid="tweetText"><span>第二条要做成卡贴</span></div>
  <a href="/other/status/222"><time datetime="2026-09-23T13:00:00.000Z">t</time></a>
</article>
<div id="layers">
  <div role="menu" id="share">
    <div role="menuitem"><svg></svg><span>通过聊天发送</span></div>
    <div role="menuitem"><span>复制链接</span></div>
    <div role="menuitem"><span>收藏到文件夹</span></div>
  </div>
  <div role="menu" id="more">
    <div role="menuitem"><span>删除</span></div>
  </div>
</div>
`

describe('findOpenShareTarget', () => {
  it('pairs the expanded share button with the copy-link menu and that article', () => {
    const doc = mount(timeline)
    const target = findOpenShareTarget(doc)
    expect(target?.article.id).toBe('second')
    expect(target?.menu.id).toBe('share')
    expect(target?.button.id).toBe('share-btn')
    expect(articleFromShareButton(doc.getElementById('share-btn')!)?.id).toBe('second')
  })

  it('returns null when the share button is collapsed', () => {
    const doc = mount(timeline)
    doc.getElementById('share-btn')!.setAttribute('aria-expanded', 'false')
    expect(findOpenShareTarget(doc)).toBeNull()
  })

  it('accepts an English Share post button and Copy link menu', () => {
    const doc = mount(`
      <article data-testid="tweet" id="en">
        <div role="button" aria-label="Share post" aria-expanded="true" id="en-btn"></div>
        <div data-testid="tweetText"><span>English post</span></div>
      </article>
      <div role="menu" id="en-menu"><div role="menuitem"><span>Copy link</span></div></div>
    `)
    const target = findOpenShareTarget(doc)
    expect(target?.article.id).toBe('en')
    expect(target?.button.id).toBe('en-btn')
  })
})

describe('buildKatieMenuItem', () => {
  it('copies a native menuitem, keeps its icon slot, and draws a currentColor card icon', () => {
    const doc = mount(timeline)
    const menu = doc.getElementById('share')!
    const before = menu.querySelector('[role="menuitem"]')!.textContent
    const item = buildKatieMenuItem(menu)
    const icon = item.querySelector('svg')
    expect(item.getAttribute('role')).toBe('menuitem')
    expect(item.getAttribute(KATIE_SHARE_ITEM_ATTR)).toBe('')
    expect(item.textContent).toBe('做成卡贴')
    expect(icon?.getAttribute(KATIE_MENU_ICON_ATTR)).toBe('')
    expect(icon?.getAttribute('width')).toBe('18.75')
    expect(icon?.getAttribute('height')).toBe('18.75')
    expect(icon?.style.stroke).toBe('currentColor')
    expect(icon?.querySelector('rect')).not.toBeNull()
    expect(menu.querySelector(`[${KATIE_MENU_ICON_ATTR}]`)).toBeNull()
    expect(menu.querySelector('[role="menuitem"]')!.textContent).toBe(before)
    expect(menu.querySelector('svg')).not.toBeNull()
  })

  it('keeps a native icon box and still adds the card glyph', () => {
    const doc = mount(`
      <div role="menu" id="sized">
        <div role="menuitem" style="display:flex;align-items:center;gap:12px;padding:16px;">
          <svg viewBox="0 0 24 24" width="18.75" height="18.75"><path d="M0 0h24v24H0z"></path></svg>
          <span>复制链接</span>
        </div>
      </div>
    `)
    const item = buildKatieMenuItem(doc.getElementById('sized')!)
    const icon = item.querySelector('svg')!
    expect(icon.getAttribute('width')).toBe('18.75')
    expect(icon.getAttribute('height')).toBe('18.75')
    expect(icon.querySelector('path')?.getAttribute('d')).not.toBe('M0 0h24v24H0z')
    expect(item.querySelector('span')!.textContent).toBe('做成卡贴')
    expect(item.querySelectorAll('svg')).toHaveLength(1)
  })

  it('inserts an icon when the template row has only a label', () => {
    const doc = mount(`
      <div role="menu" id="plain">
        <div role="menuitem"><span>收藏到文件夹</span></div>
      </div>
    `)
    const item = buildKatieMenuItem(doc.getElementById('plain')!)
    expect(item.querySelector(`[${KATIE_MENU_ICON_ATTR}]`)).not.toBeNull()
    expect(item.style.display).toBe('flex')
    expect(item.textContent).toBe('做成卡贴')
  })
})

describe('syncShareMenu', () => {
  it('injects one item, ignores a second pass, and removes it when the menu closes', () => {
    const doc = mount(timeline)
    const picked: string[] = []
    syncShareMenu(doc, (article) => picked.push(article.id))
    syncShareMenu(doc, (article) => picked.push(article.id))
    const items = doc.querySelectorAll(`[${KATIE_SHARE_ITEM_ATTR}]`)
    expect(items).toHaveLength(1)
    expect(doc.getElementById('more')!.querySelector(`[${KATIE_SHARE_ITEM_ATTR}]`)).toBeNull()
    expect(doc.getElementById('share')!.lastElementChild!.textContent).toBe('做成卡贴')
    ;(items[0] as HTMLElement).click()
    return Promise.resolve().then(() => {
      expect(picked).toEqual(['second'])
      doc.getElementById('share-btn')!.setAttribute('aria-expanded', 'false')
      syncShareMenu(doc, () => picked.push('again'))
      expect(doc.querySelector(`[${KATIE_SHARE_ITEM_ATTR}]`)).toBeNull()
    })
  })

  it('opens the card once when pointerdown and click both fire', async () => {
    const doc = mount(timeline)
    const picked: string[] = []
    syncShareMenu(doc, (article) => picked.push(article.id))
    const item = doc.querySelector(`[${KATIE_SHARE_ITEM_ATTR}]`) as HTMLElement
    item.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await Promise.resolve()
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(picked).toEqual(['second'])
  })

  it('does not inject when the expanded share button has no article', () => {
    const doc = mount(`
      <button aria-label="分享帖子" aria-expanded="true"></button>
      <div role="menu"><div role="menuitem"><span>复制链接</span></div></div>
    `)
    syncShareMenu(doc, () => {
      throw new Error('should not pick')
    })
    expect(doc.querySelector(`[${KATIE_SHARE_ITEM_ATTR}]`)).toBeNull()
  })
})
