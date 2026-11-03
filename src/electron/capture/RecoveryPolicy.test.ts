import { describe, expect, it } from "vitest"
import { recoveryDelay, shouldRecover } from "./RecoveryPolicy"

describe("sender worker recovery policy", () => {
    it("backs off repeated worker crashes without unbounded delays", () => {
        expect([0, 1, 2, 3, 4, 5, 6].map((attempt) => recoveryDelay(attempt))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
    })
    it("rejects invalid attempts", () => {
        expect(() => recoveryDelay(-1)).toThrow(RangeError)
        expect(() => recoveryDelay(Number.NaN)).toThrow(RangeError)
    })
    it("retries only requested outputs that are neither active nor pending", () => {
        expect(shouldRecover(true, false, false)).toBe(true)
        expect(shouldRecover(false, false, false)).toBe(false)
        expect(shouldRecover(true, true, false)).toBe(false)
        expect(shouldRecover(true, false, true)).toBe(false)
    })
    it("does not restart an output after shutdown removes its desired state", () => {
        let desired = true
        expect(shouldRecover(desired, false, false)).toBe(true)
        desired = false
        expect(shouldRecover(desired, false, false)).toBe(false)
    })
})
