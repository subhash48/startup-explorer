export class InferenceError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "InferenceError";
  }
}

export function retryAfterSeconds(
  value: string | null | undefined,
  now = Date.now(),
): number {
  if (!value?.trim()) return 60;
  const seconds = /^\d+(\.\d+)?$/.test(value.trim())
    ? Number(value)
    : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds)
    ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
    : 60;
}
