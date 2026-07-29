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

/** Off-centre specular highlight layered over every gradient, for depth. */
const HIGHLIGHT = 'radial-gradient(120% 100% at 22% 2%, rgba(255,255,255,0.20), rgba(255,255,255,0) 62%)'

/** The axis every gradient runs along; the dither masks follow it. */
export const HERO_DITHER_ANGLE = '158deg'

/**
 * Gradients, angled consistently at 158° so they read as a set.
 *
 * Each is three stops rather than two — a lit opening colour, a saturated mid,
 * and a deep close — which is what stops a large fill from looking like the
 * stock two-stop CSS gradients. On top sits a soft off-centre radial highlight,
 * so the panel reads as a lit surface with a light source rather than a flat
 * ramp. Layer order matters: the highlight is listed first because CSS paints
 * the first background layer on top.
 *
 * `HERO_DITHER_ANGLE` below matches the 158° so the dither texture ramps along
 * the same axis as the colour.
 */
export const HERO_GRADIENTS: HeroBgPreset[] = [
  { value: 'g-violet', label: 'Violet', css: `${HIGHLIGHT}, linear-gradient(158deg, #6f6df2 0%, #7b4fd8 44%, #3b2a86 100%)` },
  { value: 'g-berry', label: 'Berry', css: `${HIGHLIGHT}, linear-gradient(158deg, #ea6fcb 0%, #b44bd0 46%, #5c2270 100%)` },
  { value: 'g-sunset', label: 'Sunset', css: `${HIGHLIGHT}, linear-gradient(158deg, #ff9268 0%, #f2646e 46%, #9a2d5c 100%)` },
  { value: 'g-coral', label: 'Coral', css: `${HIGHLIGHT}, linear-gradient(158deg, #ffc4aa 0%, #ff9d9e 48%, #dd6d88 100%)` },
  { value: 'g-sand', label: 'Sand', css: `${HIGHLIGHT}, linear-gradient(158deg, #f8d38d 0%, #eda96a 48%, #c2744a 100%)` },
  { value: 'g-mint', label: 'Mint', css: `${HIGHLIGHT}, linear-gradient(158deg, #45d2a9 0%, #1da98c 46%, #0d5f4d 100%)` },
  { value: 'g-ocean', label: 'Ocean', css: `${HIGHLIGHT}, linear-gradient(158deg, #6bd5e9 0%, #2e9cc4 46%, #184d72 100%)` },
  { value: 'g-sky', label: 'Sky', css: `${HIGHLIGHT}, linear-gradient(158deg, #aeeaff 0%, #7fb6fb 48%, #5878de 100%)` },
  { value: 'g-slate', label: 'Slate', css: `${HIGHLIGHT}, linear-gradient(158deg, #3d4049 0%, #24262b 50%, #131419 100%)` },
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

/**
 * Only gradients get the dither treatment — a flat fill has no banding to break
 * up, and stippling a solid colour just reads as noise.
 */
export function isHeroGradient(value: string): boolean {
  return HERO_GRADIENTS.some((p) => p.value === value)
}

/**
 * The character layer of the dither, as a seamless SVG tile that
 * `background-repeat` lays over the whole panel.
 *
 * This was originally a long run of DOM text, which broke on big screens: a
 * fixed character count fills *fewer* rows the wider the panel gets, so the
 * glyphs stopped partway down and left a hard horizontal edge — at 3840×2160
 * the text reached only 331px of a 2160px panel, leaving 85% bare. A repeating
 * tile cannot run out at any size, and it keeps ~9KB of junk text out of every
 * published form's HTML and out of the builder's re-render path.
 *
 * The tile deliberately carries no webfont: an SVG referenced from CSS can't
 * load one, so it asks for the generic monospace stack. At this size and opacity
 * the specific face isn't discernible.
 *
 * The layout is seeded rather than random so the texture is identical between
 * server and client and stable across re-renders.
 */
function glyphTile(): string {
  const glyphs = '01·+×:=*#%▪'
  const COLS = 16
  const ROWS = 14
  const CELL = 11
  const w = COLS * CELL
  const h = ROWS * CELL

  let seed = 20260728
  let cells = ''
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      // Numerical Recipes LCG — cheap, deterministic, good enough for texture.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      // Leave gaps so the field reads as scattered characters, not a solid block.
      if (seed % 100 < 45) continue
      cells += `<text x="${col * CELL}" y="${row * CELL + 9}">${glyphs[(seed >> 8) % glyphs.length]}</text>`
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<g fill="#fff" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="10">${cells}</g>` +
    `</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** Ready-to-use `background-image` for the `.hero-glyphs` layer. */
export const HERO_GLYPH_TILE = glyphTile()
