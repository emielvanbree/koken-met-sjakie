// Server-side input sanitisation — strips all HTML tags, trims, enforces max length
export function sanitize(input: unknown, maxLength = 2000): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, '')         // strip HTML tags
    .replace(/[<>]/g, '')            // strip remaining angle brackets
    .trim()
    .slice(0, maxLength)
}

export function sanitizeNumber(input: unknown, min: number, max: number): number {
  const n = Number(input)
  if (isNaN(n)) return min
  return Math.max(min, Math.min(max, Math.floor(n)))
}
