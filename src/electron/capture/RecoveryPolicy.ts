/** Pure recovery policy shared by worker-backed outputs. */
export function recoveryDelay(attempt: number, baseMs = 1000, maxMs = 30000): number {
    if (!Number.isSafeInteger(attempt) || attempt < 0) throw new RangeError("Invalid recovery attempt")
    if (!Number.isFinite(baseMs) || baseMs <= 0 || !Number.isFinite(maxMs) || maxMs < baseMs) throw new RangeError("Invalid recovery delay bounds")
    return Math.min(baseMs * 2 ** Math.min(attempt, 30), maxMs)
}

export function shouldRecover(desired: boolean, active: boolean, pending: boolean): boolean {
    return desired && !active && !pending
}
