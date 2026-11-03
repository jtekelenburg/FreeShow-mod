import { describe, expect, it } from "vitest"
import { audioFrameRateRatio, audioSamplesForFrame } from "./AudioFrameClock"

describe("audio frame clock", () => {
    it("preserves exact 48 kHz sample totals at 59.94 fps", () => {
        const samples = Array.from({ length: 60000 }, (_, i) => audioSamplesForFrame(i, 48000, 60000, 1001))
        expect(samples.reduce((a, b) => a + b, 0)).toBe(48000 * 1001)
    })
    it("recognizes broadcast frame rates", () => {
        expect(audioFrameRateRatio(59.94)).toEqual({ numerator: 60000, denominator: 1001 })
        expect(audioFrameRateRatio(29.97)).toEqual({ numerator: 30000, denominator: 1001 })
    })
    it("preserves 48 kHz totals at 29.97 fps across ten minutes", () => {
        const frames = 18000
        let total = 0
        let min = Infinity
        let max = 0
        for (let i = 0; i < frames; i++) {
            const count = audioSamplesForFrame(i, 48000, 30000, 1001)
            total += count
            min = Math.min(min, count)
            max = Math.max(max, count)
        }
        expect(total).toBe(48000 * 1001 * 3 / 5)
        expect(min).toBe(1601)
        expect(max).toBe(1602)
    })
    it("preserves 48 kHz totals at 23.976 fps", () => {
        let total = 0
        for (let i = 0; i < 24000; i++) total += audioSamplesForFrame(i, 48000, 24000, 1001)
        expect(total).toBe(48000 * 1001)
    })
    it("does not drift when seeking to large frame indexes", () => {
        const frame = 10_000_000
        const sample = audioSamplesForFrame(frame, 48000, 60000, 1001)
        expect(sample === 800 || sample === 801).toBe(true)
    })
    it("rejects invalid frame indexes", () => {
        expect(() => audioSamplesForFrame(-1, 48000, 60)).toThrow(RangeError)
    })
})
