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
    it("rejects invalid frame indexes", () => {
        expect(() => audioSamplesForFrame(-1, 48000, 60)).toThrow(RangeError)
    })
})
