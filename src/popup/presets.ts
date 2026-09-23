export const BACKGROUND_PRESETS: Array<{
  id: string
  label: string
  background: import('../types').Background
}> = [
  {
    id: 'paper',
    label: '米白',
    background: { kind: 'solid', color: '#f7f4ef' },
  },
  {
    id: 'ink',
    label: '墨黑',
    background: { kind: 'solid', color: '#1c1917' },
  },
  {
    id: 'dusk',
    label: '暮色渐变',
    background: { kind: 'gradient', from: '#292524', to: '#78716c' },
  },
  {
    id: 'sky',
    label: '淡青渐变',
    background: { kind: 'gradient', from: '#ecfeff', to: '#e0f2fe' },
  },
]
