export function cronHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr

  const minute = parts[0]!
  const hour = parts[1]!
  const day = parts[2]!
  const month = parts[3]!
  const weekday = parts[4]!

  if (
    minute.startsWith('*/') &&
    hour === '*' &&
    day === '*' &&
    month === '*' &&
    weekday === '*'
  ) {
    const n = minute.slice(2)
    if (/^\d+$/.test(n)) return `every ${n} min`
  }

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && day === '*' && month === '*') {
    const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    if (weekday === '*') return `daily ${time}`
    if (weekday === '0') return `Sunday ${time}`
  }

  return expr
}
