import { describe, expect, it } from "vitest"
import type { Display } from "electron"
import { resolveAssignedDisplay } from "./DisplayIdentity"

const display = (id: number, label: string): Display => ({ id, label } as Display)
const monitors = [display(1, "Main"), display(2, "Projector")]

describe("resolveAssignedDisplay", () => {
    it("prefers the saved ID when its label agrees", () => {
        expect(resolveAssignedDisplay(monitors, { screen: "2", screenLabel: "Projector" })?.id).toBe(2)
    })
    it("recovers from a changed ID using a unique label", () => {
        expect(resolveAssignedDisplay(monitors, { screen: "99", screenLabel: "Projector" })?.id).toBe(2)
    })
    it("rejects a reused ID with the wrong label", () => {
        expect(resolveAssignedDisplay(monitors, { screen: "1", screenLabel: "Missing" })).toBeUndefined()
    })
    it("does not guess between identical monitor labels", () => {
        expect(resolveAssignedDisplay([display(3, "Same"), display(4, "Same")], { screen: "99", screenLabel: "Same" })).toBeUndefined()
    })
    it("supports legacy ID-only assignments", () => {
        expect(resolveAssignedDisplay(monitors, { screen: "1" })?.id).toBe(1)
    })
    it("does not assign an unconfigured output", () => {
        expect(resolveAssignedDisplay(monitors, {})).toBeUndefined()
    })
})
