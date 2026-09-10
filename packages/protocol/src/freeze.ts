/** Freeze a validated JSON tree so later asynchronous work cannot change its identity. */
export function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child)
    Object.freeze(value)
  }
  return value
}
