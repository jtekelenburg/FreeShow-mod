/** Validate frame metadata before native conversion or playback. */
export type FrameSize = { width: number; height: number }
export type FrameFormat = "BGRA" | "UYVY" | "UYVA" | "V210"

export function expectedFrameBytes(size: FrameSize, format: FrameFormat): number {
    const { width, height } = size
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 16384 || height > 16384)
        throw new RangeError(`Invalid frame dimensions: ${width}x${height}`)
    if ((format === "UYVY" || format === "UYVA" || format === "V210") && width % 2 !== 0)
        throw new RangeError(`${format} requires an even width`)
    const bytes = format === "BGRA" ? width * height * 4
        : format === "UYVY" ? width * height * 2
        : format === "UYVA" ? width * height * 3
        : Math.ceil(width / 48) * 128 * height
    if (!Number.isSafeInteger(bytes)) throw new RangeError("Frame byte size overflow")
    return bytes
}

export function assertFrameBuffer(data: Uint8Array, size: FrameSize, format: FrameFormat): void {
    const expected = expectedFrameBytes(size, format)
    if (data.byteLength !== expected)
        throw new RangeError(`${format} frame has ${data.byteLength} bytes; expected ${expected} for ${size.width}x${size.height}`)
}

export function assertAudioBuffer(data: Uint8Array, sampleRate: number, channels: number, bytesPerSample: 2 | 4): void {
    if (!Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 384000)
        throw new RangeError(`Invalid audio sample rate: ${sampleRate}`)
    if (!Number.isSafeInteger(channels) || channels < 1 || channels > 32)
        throw new RangeError(`Invalid audio channel count: ${channels}`)
    if (data.byteLength === 0 || data.byteLength % (channels * bytesPerSample) !== 0)
        throw new RangeError(`Invalid audio buffer length: ${data.byteLength}`)
}
