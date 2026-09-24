import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('retains PNG bytes and task metadata after the background page is recreated', async () => {
  const server = await createServer({
    configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent',
    plugins: [{ name: 'draft-storage-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/draft-storage-test') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><title>Draft storage test</title>')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}draft-storage-test`)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'chrome', { configurable: true, value: {
        storage: { local: {
          get: async (key: string) => ({ [key]: JSON.parse(localStorage.getItem(key) ?? 'null') }),
          set: async (data: Record<string, unknown>) => { for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value)) },
        } },
      } })
    })
    await page.reload()
    await page.evaluate(`(async () => {
      const moduleUrl = '/src/drafts/store.ts'
      const { createDraftRepository } = await import(moduleUrl)
      const repository = createDraftRepository()
      await repository.saveAsset('image-1', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
      await repository.saveJobs([{ id: 'job-1', assetId: 'image-1', title: '跨重载草稿', platform: 'xiaohongshu', status: 'running', step: 'uploading' }])
    })()`)
    await page.reload()
    const restored = await page.evaluate(`(async () => {
      const moduleUrl = '/src/drafts/store.ts'
      const { createDraftRepository } = await import(moduleUrl)
      const repository = createDraftRepository()
      const asset = await repository.getAsset('image-1')
      return { jobs: await repository.listJobs(), bytes: [...new Uint8Array(await asset.arrayBuffer())], mime: asset.type, missing: await repository.getAsset('missing') }
    })()`)
    expect(restored).toMatchObject({ jobs: [{ id: 'job-1', title: '跨重载草稿', status: 'running' }], bytes: [137, 80, 78, 71], mime: 'image/png' })
    expect(restored).toHaveProperty('missing', undefined)
  } finally {
    await browser.close()
    await server.close()
  }
}, 30_000)
