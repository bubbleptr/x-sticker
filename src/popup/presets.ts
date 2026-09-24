import type { Background } from '../types'
import { PHOTO_PRESET_GROUPS, type PhotoPresetId } from '../photoBackgrounds'

type BackgroundPreset = {
  id: PhotoPresetId
  label: string
  background: Background
}

export const BACKGROUND_PRESET_GROUPS = PHOTO_PRESET_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  presets: group.presets.map((preset): BackgroundPreset => ({
    id: preset.id,
    label: preset.label,
    background: { kind: 'image', src: preset.file },
  })),
}))

export const BACKGROUND_PRESETS = BACKGROUND_PRESET_GROUPS.flatMap((group) => group.presets)
