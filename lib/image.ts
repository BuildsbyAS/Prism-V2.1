// Shared CSS for an option image's focal-point crop + brightness adjustment, so
// the builder thumbnail, the focal picker, and the voter all render identically.
export function imageAdjustStyle(
  focalX = 50,
  focalY = 50,
  brightness = 0,
): { objectPosition: string; filter?: string } {
  return {
    objectPosition: `${focalX}% ${focalY}%`,
    filter: brightness ? `brightness(${Math.max(0, 1 + brightness / 100)})` : undefined,
  }
}
