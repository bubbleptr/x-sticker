import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright-core'
import { expect, it } from 'vitest'
import { buildStatusArticleHtml } from './statusHtml'
import type { PostText, RenderOptions } from '../types'

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path))

const post: PostText = {
  text: '墙内分享的正文',
  authorDisplayName: 'Kieran Zhang',
  handle: 'ninthbit_ai',
  postUrl: 'https://x.com/ninthbit_ai/status/1',
  verified: true,
}

const options = (privacyMode: boolean): RenderOptions => ({
  privacyMode,
  hideHandle: false,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#ffffff' },
  locale: 'zh-CN',
  showMenu: true,
})

async function openArticle(page: Page, html: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'privacy-identity-'))
  const file = join(dir, 'article.html')
  writeFileSync(file, html)
  try {
    await page.goto(`file://${file}`)
    await page.evaluate(async () => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
      if (fonts?.ready) await fonts.ready
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

it('centers the privacy identity on the avatar and keeps the verified badge', async () => {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 320 } })
    await openArticle(page, buildStatusArticleHtml(
      { ...post, authorDisplayName: '墙内的我' },
      options(true),
    ))
    const privacy = await page.evaluate(() => {
      const avatar = document.querySelector('.avatar')!.getBoundingClientRect()
      const name = document.querySelector('.name-row')!.getBoundingClientRect()
      const badge = document.querySelector('.name-row .badge')!.getBoundingClientRect()
      return {
        delta: Math.abs((avatar.top + avatar.height / 2) - (name.top + name.height / 2)),
        handleCount: document.querySelectorAll('.handle').length,
        name: document.querySelector('.name-row')!.textContent ?? '',
        badgeFill: document.querySelector('.name-row .badge path')!.getAttribute('fill'),
        badgeBesideName: badge.left >= name.left && badge.top >= name.top - 1 && badge.bottom <= name.bottom + 1,
        headerClass: document.querySelector('.header')!.className,
        realName: document.body.textContent ?? '',
      }
    })
    expect(privacy.headerClass).toBe('header privacy')
    expect(privacy.handleCount).toBe(0)
    expect(privacy.name).toContain('墙内的我')
    expect(privacy.realName).not.toContain('Kieran Zhang')
    expect(privacy.realName).not.toContain('@ninthbit_ai')
    expect(privacy.badgeFill).toBe('#1D9BF0')
    expect(privacy.badgeBesideName).toBe(true)
    expect(privacy.delta).toBeLessThanOrEqual(1)

    await openArticle(page, buildStatusArticleHtml(post, options(false)))
    const plain = await page.evaluate(() => {
      const avatar = document.querySelector('.avatar')!.getBoundingClientRect()
      const name = document.querySelector('.name-row')!.getBoundingClientRect()
      return {
        delta: Math.abs((avatar.top + avatar.height / 2) - (name.top + name.height / 2)),
        nameTop: Math.abs(name.top - avatar.top),
        handle: document.querySelector('.handle')!.textContent,
        name: document.querySelector('.name-row')!.textContent ?? '',
        headerClass: document.querySelector('.header')!.className,
      }
    })
    expect(plain.headerClass).toBe('header')
    expect(plain.handle).toBe('@ninthbit_ai')
    expect(plain.name).toContain('Kieran Zhang')
    expect(plain.nameTop).toBeLessThanOrEqual(2)
    expect(plain.delta).toBeGreaterThan(6)
  } finally {
    await browser.close()
  }
})
