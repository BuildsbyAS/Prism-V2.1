// Shared CSS for an option image's brightness adjustment, so the builder
// thumbnail and the voter render identically.
//
// This used to carry an `object-position` focal point too, which only had a job
// while option media was cropped to a fixed 4:3 box. Media is now contained
// rather than cropped everywhere it appears, so there is no crop left to steer.
export function brightnessStyle(brightness = 0): { filter?: string } {
  return {
    filter: brightness ? `brightness(${Math.max(0, 1 + brightness / 100)})` : undefined,
  }
}
