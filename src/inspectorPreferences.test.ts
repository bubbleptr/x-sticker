import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadInspectorPreferences, saveInspectorPreferences } from './inspectorPreferences'

let stored: Record<string, unknown>
let storage: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }

beforeEach(() => {
  stored = {}
  storage = {
    get: vi.fn(async (keys: string[]) => Object.fromEntries(
      keys.filter((key) => key in stored).map((key) => [key, structuredClone(stored[key])]),
    )),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(stored, structuredClone(items))
    }),
  }
  vi.stubGlobal('chrome', { storage: { local: storage } })
})

afterEach(() => vi.unstubAllGlobals())

it('starts a new installation with privacy mode off and a photo background', async () => {
  expect(await loadInspectorPreferences()).toEqual({
    privacyMode: false,
    customName: '',
    aspect: '3:4',
    backgroundId: 'mt-fog',
    platforms: ['xiaohongshu'],
  })
})

it('restores the selected inspector options when the module is opened again', async () => {
  await saveInspectorPreferences({
    privacyMode: true,
    customName: '  自定义用户名  ',
    aspect: '9:16',
    backgroundId: 'hk-harbor',
    platforms: ['douyin'],
  })
  vi.resetModules()
  const reopened = await import('./inspectorPreferences')

  expect(await reopened.loadInspectorPreferences()).toEqual({
    privacyMode: true,
    customName: '  自定义用户名  ',
    aspect: '9:16',
    backgroundId: 'hk-harbor',
    platforms: ['douyin'],
  })
})

it('remembers clearing a custom name without resetting other inspector choices', async () => {
  await saveInspectorPreferences({ customName: '自定义用户名', backgroundId: 'hk-harbor' })
  await saveInspectorPreferences({ customName: '' })
  vi.resetModules()
  const reopened = await import('./inspectorPreferences')

  expect(await reopened.loadInspectorPreferences()).toMatchObject({
    customName: '',
    backgroundId: 'hk-harbor',
  })
})

it('maps an older hidden-account toggle onto privacy mode and keeps the custom name', async () => {
  stored = {
    'stickerInspector.showHandle': false,
    'stickerInspector.showAuthor': true,
    'stickerInspector.customName': '墙内名字',
  }

  expect(await loadInspectorPreferences()).toMatchObject({
    privacyMode: true,
    customName: '墙内名字',
  })
})

it('keeps an explicit privacy choice ahead of the older account toggle', async () => {
  stored = {
    'stickerInspector.privacyMode': false,
    'stickerInspector.showHandle': false,
    'stickerInspector.customName': '墙内名字',
  }

  expect(await loadInspectorPreferences()).toMatchObject({
    privacyMode: false,
    customName: '墙内名字',
  })
})

it('falls back independently for malformed cached options and retired background presets', async () => {
  stored = {
    'stickerInspector.privacyMode': 'false',
    'stickerInspector.showHandle': 'false',
    'stickerInspector.showAuthor': false,
    'stickerInspector.customName': { name: '旧缓存' },
    'stickerInspector.aspect': '1:1',
    'stickerInspector.backgroundId': 'solid-white',
    'stickerInspector.platforms': ['weixin'],
  }

  expect(await loadInspectorPreferences()).toEqual({
    privacyMode: false,
    customName: '',
    aspect: '3:4',
    backgroundId: 'mt-fog',
    platforms: ['xiaohongshu'],
  })
})

it('keeps changes to separate inspector options from concurrent windows', async () => {
  await saveInspectorPreferences({ privacyMode: true, aspect: '9:16' })

  await Promise.all([
    saveInspectorPreferences({ backgroundId: 'nyc-skyline' }),
    saveInspectorPreferences({ platforms: [] }),
  ])

  expect(await loadInspectorPreferences()).toEqual({
    privacyMode: true,
    customName: '',
    aspect: '9:16',
    backgroundId: 'nyc-skyline',
    platforms: [],
  })
})

it.each([null, 'douyin', ['xiaohongshu', 'unknown'], ['toString'], [42]])(
  'rejects malformed or unsupported saved platform selections: %j', async (platforms) => {
    stored = { 'stickerInspector.platforms': platforms }

    expect((await loadInspectorPreferences()).platforms).toEqual(['xiaohongshu'])
  },
)

it('passes storage failures to the caller so the UI can report them', async () => {
  const unavailable = new Error('Extension context invalidated')
  storage.get.mockRejectedValueOnce(unavailable)
  storage.set.mockRejectedValueOnce(unavailable)

  await expect(loadInspectorPreferences()).rejects.toBe(unavailable)
  await expect(saveInspectorPreferences({ privacyMode: true })).rejects.toBe(unavailable)
})
