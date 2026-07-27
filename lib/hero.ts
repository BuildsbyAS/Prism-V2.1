/**
 * Backdrop presets for the welcome screen's hero media — the shots.so idea: the
 * media floats on a full-bleed colour or gradient panel.
 *
 * `Form.hero_bg` holds one of:
 *   • 'none'          — no panel; the media sits on the page background
 *   • a preset value  — 'g-violet', 's-ink', … (see the tables below)
 *   • a raw hex       — '#ff8a5c', from the custom colour picker
 *
 * Storing a plain string keeps every option in one column, so adding presets
 * later needs no migration. The builder canvas and the voter screen both render
 * through `heroBgCss`, so a preview can't drift from the published form.
 */
export interface HeroBgPreset {
  value: string
  label: string
  css: string
}

/** Vivid two-stop gradients, angled consistently so they read as a set. */
export const HERO_GRADIENTS: HeroBgPreset[] = [
  { value: 'g-violet', label: 'Violet', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { value: 'g-berry', label: 'Berry', css: 'linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)' },
  { value: 'g-sunset', label: 'Sunset', css: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { value: 'g-coral', label: 'Coral', css: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)' },
  { value: 'g-sand', label: 'Sand', css: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  { value: 'g-mint', label: 'Mint', css: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { value: 'g-ocean', label: 'Ocean', css: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)' },
  { value: 'g-sky', label: 'Sky', css: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)' },
  { value: 'g-slate', label: 'Slate', css: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
]

/** Flat fills — quieter options for when the media itself carries the colour. */
export const HERO_SOLIDS: HeroBgPreset[] = [
  { value: 's-paper', label: 'Paper', css: '#f6f6f5' },
  { value: 's-neutral', label: 'Neutral', css: '#e8e8e6' },
  { value: 's-warm', label: 'Warm', css: '#fbf3e3' },
  { value: 's-cool', label: 'Cool', css: '#eef2f7' },
  { value: 's-mint', label: 'Mint', css: '#eaf7ee' },
  { value: 's-lilac', label: 'Lilac', css: '#efeafc' },
  { value: 's-navy', label: 'Navy', css: '#1e293b' },
  { value: 's-ink', label: 'Ink', css: '#18191d' },
]

export const HERO_BG_PRESETS: HeroBgPreset[] = [...HERO_GRADIENTS, ...HERO_SOLIDS]

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Custom colours are stored as a raw hex string. */
export function isCustomHeroBg(value: string): boolean {
  return HEX.test(value ?? '')
}

/**
 * Resolves a stored value to a CSS `background`. Unknown or legacy values fall
 * back to transparent so a bad value renders as "no backdrop", never broken.
 */
export function heroBgCss(value: string): string {
  if (!value || value === 'none') return 'transparent'
  if (isCustomHeroBg(value)) return value
  return HERO_BG_PRESETS.find((p) => p.value === value)?.css ?? 'transparent'
}

/** True when a real panel should be painted behind the media. */
export function hasHeroBg(value: string): boolean {
  return heroBgCss(value) !== 'transparent'
}

/** Dark backdrops need light UI on top of them (used for the media shadow). */
export function isDarkHeroBg(value: string): boolean {
  return ['g-slate', 's-navy', 's-ink'].includes(value)
}
