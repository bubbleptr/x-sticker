export const PHOTO_PRESETS = [
  { id: 'mt-fog', label: '云海', file: 'backgrounds/mt-fog.jpg' },
  { id: 'ocean-dusk', label: '海边', file: 'backgrounds/ocean-dusk.jpg' },
  { id: 'snow-peak', label: '雪峰', file: 'backgrounds/snow-peak.jpg' },
  { id: 'shibuya-pink', label: '涩谷霓虹', file: 'backgrounds/shibuya-pink.jpg' },
  { id: 'nyc-skyline', label: '纽约', file: 'backgrounds/nyc-skyline.jpg' },
  { id: 'hk-harbor', label: '香港', file: 'backgrounds/hk-harbor.jpg' },
] as const

export type PhotoPresetId = (typeof PHOTO_PRESETS)[number]['id']
export type BundledBackgroundFile = (typeof PHOTO_PRESETS)[number]['file']

export const BUNDLED_BACKGROUND_FILES: readonly BundledBackgroundFile[] = PHOTO_PRESETS.map(
  (preset) => preset.file,
)

export function isBundledBackgroundFile(src: string): src is BundledBackgroundFile {
  return (BUNDLED_BACKGROUND_FILES as readonly string[]).includes(src)
}
