/** Exact integer sample allocation for video frames on an audio clock. */
export function audioSamplesForFrame(frameIndex: number, sampleRate: number, fpsNumerator: number, fpsDenominator = 1): number {
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || !Number.isSafeInteger(sampleRate) || sampleRate <= 0 || !Number.isSafeInteger(fpsNumerator) || fpsNumerator <= 0 || !Number.isSafeInteger(fpsDenominator) || fpsDenominator <= 0) {
        throw new RangeError("Invalid audio clock parameters")
    }
    const i = BigInt(frameIndex)
    const numerator = BigInt(sampleRate) * BigInt(fpsDenominator)
    const denominator = BigInt(fpsNumerator)
    const samples = ((i + BigInt(1)) * numerator) / denominator - (i * numerator) / denominator
    if (samples > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Audio sample count overflow")
    return Number(samples)
}

export function audioFrameRateRatio(fps: number): { numerator: number; denominator: number } {
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError("Invalid frame rate")
    for (const numerator of [24000, 30000, 60000, 120000]) {
        if (Math.abs(fps - numerator / 1001) < 0.005) return { numerator, denominator: 1001 }
    }
    const rounded = Math.round(fps)
    if (Math.abs(fps - rounded) < 0.005) return { numerator: rounded, denominator: 1 }
    return { numerator: Math.round(fps * 1000), denominator: 1000 }
}
