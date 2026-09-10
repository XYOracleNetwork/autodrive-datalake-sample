export class SampleError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'SampleError'
    this.code = code
    this.status = status
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function requireCondition(condition: unknown, code: string, message: string, status = 400): asserts condition {
  if (!Boolean(condition)) throw new SampleError(code, message, status)
}
