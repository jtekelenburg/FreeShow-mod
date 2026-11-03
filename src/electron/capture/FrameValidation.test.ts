import { describe, expect, it } from "vitest"
import { assertAudioBuffer, assertFrameBuffer, expectedFrameBytes } from "./FrameValidation"

describe("media buffer validation", () => {
    it("checks BGRA dimensions", () => {
        expect(expectedFrameBytes({ width: 1920, height: 1080 }, "BGRA")).toBe(1920 * 1080 * 4)
    })
    it("rejects odd-width packed YUV", () => {
        expect(() => expectedFrameBytes({ width: 3, height: 2 }, "UYVY")).toThrow(RangeError)
    })
    it("rejects truncated frames", () => {
        expect(() => assertFrameBuffer(new Uint8Array(7), { width: 2, height: 1 }, "BGRA")).toThrow(RangeError)
    })
    it("checks PCM sample alignment", () => {
        expect(() => assertAudioBuffer(new Uint8Array(3), 48000, 2, 2)).toThrow(RangeError)
        expect(() => assertAudioBuffer(new Uint8Array(8), 48000, 2, 2)).not.toThrow()
    })
})
