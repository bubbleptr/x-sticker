import { DRAFT_TARGETS, type DraftPlatform } from './drafts/types'
import { PHOTO_PRESETS, type PhotoPresetId } from './photoBackgrounds'
import type { AspectRatio } from './types'

export type InspectorPreferences = {
  privacyMode: boolean
  customName: string
  aspect: AspectRatio
  backgroundId: PhotoPresetId
  platforms: DraftPlatform[]
}

export const DEFAULT_INSPECTOR_PREFERENCES: InspectorPreferences = {
  privacyMode: false,
  customName: '',
  aspect: '3:4',
  backgroundId: 'mt-fog',
  platforms: ['xiaohongshu'],
}

const STORAGE_KEYS = {
  privacyMode: 'stickerInspector.privacyMode',
  customName: 'stickerInspector.customName',
  aspect: 'stickerInspector.aspect',
  backgroundId: 'stickerInspector.backgroundId',
  platforms: 'stickerInspector.platforms',
} satisfies Record<keyof InspectorPreferences, string>

/** Older builds stored the account toggle separately. Unchecked meant “hide the X handle”. */
const LEGACY_SHOW_HANDLE_KEY = 'stickerInspector.showHandle'

export async function loadInspectorPreferences(): Promise<InspectorPreferences> {
  const stored: Record<string, unknown> = await chrome.storage.local.get([
    ...Object.values(STORAGE_KEYS),
    LEGACY_SHOW_HANDLE_KEY,
  ])
  const privacyMode = stored[STORAGE_KEYS.privacyMode]
  const legacyShowHandle = stored[LEGACY_SHOW_HANDLE_KEY]
  const customName = stored[STORAGE_KEYS.customName]
  const aspect = stored[STORAGE_KEYS.aspect]
  const backgroundId = PHOTO_PRESETS.find((preset) => preset.id === stored[STORAGE_KEYS.backgroundId])?.id
  const platforms = stored[STORAGE_KEYS.platforms]
  return {
    privacyMode: typeof privacyMode === 'boolean'
      ? privacyMode
      : typeof legacyShowHandle === 'boolean'
        ? !legacyShowHandle
        : DEFAULT_INSPECTOR_PREFERENCES.privacyMode,
    customName: typeof customName === 'string' ? customName : DEFAULT_INSPECTOR_PREFERENCES.customName,
    aspect: aspect === '3:4' || aspect === '9:16' ? aspect : DEFAULT_INSPECTOR_PREFERENCES.aspect,
    backgroundId: backgroundId ?? DEFAULT_INSPECTOR_PREFERENCES.backgroundId,
    platforms: Array.isArray(platforms) && platforms.every(
      (platform): platform is DraftPlatform => typeof platform === 'string' && Object.hasOwn(DRAFT_TARGETS, platform),
    ) ? platforms : [...DEFAULT_INSPECTOR_PREFERENCES.platforms],
  }
}

export async function saveInspectorPreferences(patch: Partial<InspectorPreferences>): Promise<void> {
  const items: Record<string, unknown> = {}
  for (const field of Object.keys(STORAGE_KEYS) as (keyof InspectorPreferences)[]) {
    if (patch[field] !== undefined) items[STORAGE_KEYS[field]] = patch[field]
  }
  await chrome.storage.local.set(items)
}
