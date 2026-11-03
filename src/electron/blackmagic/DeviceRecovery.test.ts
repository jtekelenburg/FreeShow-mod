import { describe, expect, it } from "vitest"
import { resolveRecoveryDeviceIndex } from "./DeviceRecovery"

const devices = [{ deviceHandle: "decklink-B" }, { deviceHandle: "decklink-A" }]

describe("Blackmagic device recovery identity", () => {
    it("follows the physical device after enumeration order changes", () => {
        expect(resolveRecoveryDeviceIndex("decklink-A", 0, devices)).toBe(1)
    })
    it("never substitutes a different device when the selected device is unplugged", () => {
        expect(resolveRecoveryDeviceIndex("decklink-C", 0, devices)).toBe(-1)
    })
    it("falls back to a valid index only when no handle was recorded", () => {
        expect(resolveRecoveryDeviceIndex(undefined, 1, devices)).toBe(1)
        expect(resolveRecoveryDeviceIndex(undefined, 2, devices)).toBe(-1)
        expect(resolveRecoveryDeviceIndex(undefined, -1, devices)).toBe(-1)
    })
    it("rejects invalid fallback indexes", () => {
        expect(resolveRecoveryDeviceIndex(undefined, Number.NaN, devices)).toBe(-1)
        expect(resolveRecoveryDeviceIndex(undefined, 0.5, devices)).toBe(-1)
    })
})
